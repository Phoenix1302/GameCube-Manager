import { FastifyInstance } from 'fastify';
import axios, { AxiosInstance } from 'axios';
import { settingsQueries } from '../db/index.js';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.js';

let qbCookie: string | null = null;

function getQBitConfig() {
  return {
    url: settingsQueries.get('qbittorrent_url', config.qbittorrent.url).replace(/\/+$/, ''),
    username: settingsQueries.get('qbittorrent_user', config.qbittorrent.username),
    password: settingsQueries.get('qbittorrent_pass', config.qbittorrent.password),
  };
}

async function getClient(): Promise<AxiosInstance> {
  const { url, username, password } = getQBitConfig();

  const client = axios.create({
    baseURL: url,
    timeout: 5000,
    headers: qbCookie ? { Cookie: qbCookie } : {},
  });

  // Verify auth / login if needed
  try {
    const versionRes = await client.get('/api/v2/app/version');
    if (versionRes.status === 200) {
      return client;
    }
  } catch {
    // Need to login
  }

  // Attempt login
  const params = new URLSearchParams();
  params.append('username', username);
  params.append('password', password);

  const loginRes = await axios.post(`${url}/api/v2/auth/login`, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 5000,
  });

  const setCookie = loginRes.headers['set-cookie'];
  if (setCookie && setCookie.length > 0) {
    qbCookie = setCookie[0].split(';')[0];
    client.defaults.headers['Cookie'] = qbCookie;
  }

  return client;
}

export async function torrentsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // List all torrents + global transfer info
  fastify.get('/list', async (request, reply) => {
    try {
      const client = await getClient();
      const [torrentsRes, transferRes] = await Promise.all([
        client.get('/api/v2/torrents/info'),
        client.get('/api/v2/transfer/info').catch(() => ({ data: {} })),
      ]);

      const torrents = (torrentsRes.data || []).map((t: any) => ({
        hash: t.hash,
        name: t.name,
        size: t.size,
        progress: Math.round(t.progress * 1000) / 10, // e.g. 85.5%
        downloadSpeed: t.dlspeed,
        uploadSpeed: t.upspeed,
        eta: t.eta,
        state: t.state,
        seeds: t.num_seeds,
        totalSeeds: t.num_complete,
        peers: t.num_leechs,
        totalPeers: t.num_incomplete,
        savePath: t.save_path,
        addedOn: t.added_on,
        ratio: Math.round(t.ratio * 100) / 100,
      }));

      return {
        connected: true,
        transfer: {
          dlSpeed: transferRes.data?.dl_info_speed || 0,
          upSpeed: transferRes.data?.up_info_speed || 0,
          dlTotal: transferRes.data?.dl_info_data || 0,
          upTotal: transferRes.data?.up_info_data || 0,
        },
        torrents,
      };
    } catch (err: any) {
      return {
        connected: false,
        error: `Unable to connect to qBittorrent: ${err.message}`,
        transfer: { dlSpeed: 0, upSpeed: 0, dlTotal: 0, upTotal: 0 },
        torrents: [],
      };
    }
  });

  // Add torrent (magnet link or URL)
  fastify.post('/add', async (request, reply) => {
    const { urls, savePath, paused } = request.body as {
      urls?: string;
      savePath?: string;
      paused?: boolean;
    };

    if (!urls || urls.trim().length === 0) {
      return reply.status(400).send({ error: 'Torrent magnet or URL is required' });
    }

    try {
      const client = await getClient();
      const params = new URLSearchParams();
      params.append('urls', urls.trim());
      if (savePath) params.append('savepath', savePath.trim());
      if (paused !== undefined) params.append('paused', paused ? 'true' : 'false');

      const res = await client.post('/api/v2/torrents/add', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      return { message: 'Torrent added successfully', result: res.data };
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to add torrent: ${err.message}` });
    }
  });

  // Add torrent by uploading .torrent file
  fastify.post('/upload', async (request, reply) => {
    try {
      const parts = request.parts();
      let fileBuffer: Buffer | null = null;
      let filename = '';

      for await (const part of parts) {
        if (part.type === 'file') {
          filename = part.filename;
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          fileBuffer = Buffer.concat(chunks);
        }
      }

      if (!fileBuffer) {
        return reply.status(400).send({ error: 'No .torrent file uploaded' });
      }

      const client = await getClient();
      const { url } = getQBitConfig();

      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('torrents', fileBuffer, { filename });

      await axios.post(`${url}/api/v2/torrents/add`, form, {
        headers: {
          ...form.getHeaders(),
          Cookie: qbCookie || '',
        },
      });

      return { message: 'Torrent file uploaded and added to qBittorrent' };
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to upload torrent: ${err.message}` });
    }
  });

  // Pause torrent(s)
  fastify.post('/pause', async (request, reply) => {
    const { hashes } = request.body as { hashes?: string[] | string };
    if (!hashes) {
      return reply.status(400).send({ error: 'Torrent hash or hashes are required' });
    }

    const hashList = Array.isArray(hashes) ? hashes.join('|') : hashes;

    try {
      const client = await getClient();
      const params = new URLSearchParams();
      params.append('hashes', hashList);
      await client.post('/api/v2/torrents/pause', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      return { message: 'Torrents paused' };
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to pause torrent: ${err.message}` });
    }
  });

  // Resume torrent(s)
  fastify.post('/resume', async (request, reply) => {
    const { hashes } = request.body as { hashes?: string[] | string };
    if (!hashes) {
      return reply.status(400).send({ error: 'Torrent hash or hashes are required' });
    }

    const hashList = Array.isArray(hashes) ? hashes.join('|') : hashes;

    try {
      const client = await getClient();
      const params = new URLSearchParams();
      params.append('hashes', hashList);
      await client.post('/api/v2/torrents/resume', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      return { message: 'Torrents resumed' };
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to resume torrent: ${err.message}` });
    }
  });

  // Delete torrent(s)
  fastify.post('/delete', async (request, reply) => {
    const { hashes, deleteFiles } = request.body as { hashes?: string[] | string; deleteFiles?: boolean };
    if (!hashes) {
      return reply.status(400).send({ error: 'Torrent hash or hashes are required' });
    }

    const hashList = Array.isArray(hashes) ? hashes.join('|') : hashes;

    try {
      const client = await getClient();
      const params = new URLSearchParams();
      params.append('hashes', hashList);
      params.append('deleteFiles', deleteFiles ? 'true' : 'false');
      await client.post('/api/v2/torrents/delete', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      return { message: 'Torrents deleted' };
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to delete torrent: ${err.message}` });
    }
  });
}
