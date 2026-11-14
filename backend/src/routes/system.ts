import { FastifyInstance } from 'fastify';
import si from 'systeminformation';
import fs from 'fs';
import { authenticate } from '../middleware/auth.js';

interface NetPrevRecord {
  rx_bytes: number;
  tx_bytes: number;
  timestamp: number;
}

const prevNetStats = new Map<string, NetPrevRecord>();

function getNetworkDevPath(): string {
  if (fs.existsSync('/host_root/proc/net/dev')) {
    return '/host_root/proc/net/dev';
  }
  return '/proc/net/dev';
}

function getNetworkStats(): Array<{
  iface: string;
  operstate: string;
  rx_sec: number;
  tx_sec: number;
  rx_bytes: number;
  tx_bytes: number;
}> {
  const devPath = getNetworkDevPath();
  const now = Date.now();

  try {
    if (fs.existsSync(devPath)) {
      const content = fs.readFileSync(devPath, 'utf-8');
      const lines = content.trim().split('\n');
      const network: Array<{
        iface: string;
        operstate: string;
        rx_sec: number;
        tx_sec: number;
        rx_bytes: number;
        tx_bytes: number;
      }> = [];

      for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(/[:\s]+/);
        const iface = parts[0];
        const rx_bytes = parseInt(parts[1], 10) || 0;
        const tx_bytes = parseInt(parts[9], 10) || 0;

        const prev = prevNetStats.get(iface);
        let rx_sec = 0;
        let tx_sec = 0;

        if (prev && now > prev.timestamp) {
          const dt = (now - prev.timestamp) / 1000;
          if (dt > 0.1) {
            rx_sec = Math.max(0, Math.round((rx_bytes - prev.rx_bytes) / dt));
            tx_sec = Math.max(0, Math.round((tx_bytes - prev.tx_bytes) / dt));
          }
        }

        prevNetStats.set(iface, { rx_bytes, tx_bytes, timestamp: now });

        network.push({
          iface,
          operstate: rx_bytes > 0 || tx_bytes > 0 ? 'UP' : 'IDLE',
          rx_sec,
          tx_sec,
          rx_bytes,
          tx_bytes,
        });
      }

      // Sort so active interfaces with traffic appear first
      network.sort((a, b) => (b.rx_bytes + b.tx_bytes) - (a.rx_bytes + a.tx_bytes));

      return network;
    }
  } catch (err) {
    // Silently fall back to systeminformation
  }

  return [];
}

export async function getSystemStatsPayload() {
  const [load, cpu, temp, mem, fsSize, osInfo, time] = await Promise.all([
    si.currentLoad().catch(() => ({ currentLoad: 0, cpus: [] })),
    si.cpu().catch(() => ({ manufacturer: '', brand: '', speed: 0, cores: 1, physicalCores: 1 })),
    si.cpuTemperature().catch(() => ({ main: null, cores: [], max: null })),
    si.mem().catch(() => ({
      total: 1,
      free: 0,
      used: 1,
      active: 1,
      available: 0,
      buffers: 0,
      cached: 0,
      buffcache: 0,
      slab: 0,
      reclaimable: 0,
      swaptotal: 0,
      swapused: 0,
      swapfree: 0,
      writeback: 0,
      dirty: 0,
    } as any)),
    si.fsSize().catch(() => []),
    si.osInfo().catch(() => ({ platform: process.platform, distro: '', release: '', hostname: '' })),
    Promise.resolve(si.time()),
  ]);

  const memUsedPercent = Math.round(((mem.total - mem.available) / mem.total) * 100);

  const disks = fsSize.map((fs) => ({
    fs: fs.fs,
    type: fs.type,
    size: fs.size,
    used: fs.used,
    available: fs.available,
    use: fs.use,
    mount: fs.mount,
  }));

  let network = getNetworkStats();
  if (network.length === 0) {
    const netStats = await si.networkStats('*').catch(() => []);
    network = netStats.map((net) => ({
      iface: net.iface,
      operstate: net.operstate || 'UP',
      rx_sec: net.rx_sec || 0,
      tx_sec: net.tx_sec || 0,
      rx_bytes: net.rx_bytes || 0,
      tx_bytes: net.tx_bytes || 0,
    }));
  }

  return {
    timestamp: Date.now(),
    uptime: time.uptime,
    os: {
      platform: osInfo.platform,
      distro: osInfo.distro,
      release: osInfo.release,
      hostname: osInfo.hostname,
    },
    cpu: {
      brand: `${cpu.manufacturer} ${cpu.brand}`.trim(),
      cores: cpu.cores,
      speed: cpu.speed,
      loadPercentage: Math.round(load.currentLoad * 10) / 10,
      coresLoad: load.cpus.map((c) => Math.round(c.load * 10) / 10),
      temperature: temp.main ?? null,
    },
    memory: {
      total: mem.total,
      used: Math.max(0, mem.total - mem.available),
      available: mem.available,
      free: mem.free,
      active: mem.active || 0,
      cached: mem.cached || mem.buffcache || 0,
      buffers: mem.buffers || 0,
      percent: memUsedPercent,
      swapTotal: mem.swaptotal || 0,
      swapUsed: mem.swapused || 0,
      swapFree: mem.swapfree || 0,
      swapPercent: mem.swaptotal > 0 ? Math.round((mem.swapused / mem.swaptotal) * 100) : 0,
    },
    disks,
    network,
  };
}

export async function systemRoutes(fastify: FastifyInstance) {
  // Snapshot HTTP stats
  fastify.get('/stats', { preHandler: [authenticate] }, async () => {
    return await getSystemStatsPayload();
  });

  // WebSocket real-time stream
  fastify.get('/stream', { websocket: true }, (socket, req) => {
    // Optional token auth verification via query param or initial connection
    let isAlive = true;
    socket.on('close', () => {
      isAlive = false;
    });

    const sendStats = async () => {
      if (!isAlive) return;
      try {
        const stats = await getSystemStatsPayload();
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(stats));
        }
      } catch (err) {
        // Silently catch and retry next interval
      }
    };

    // Send immediately on connect
    sendStats();

    // Stream every 1.5 seconds
    const interval = setInterval(sendStats, 1500);

    socket.on('close', () => {
      clearInterval(interval);
    });

    socket.on('error', () => {
      clearInterval(interval);
    });
  });
}
