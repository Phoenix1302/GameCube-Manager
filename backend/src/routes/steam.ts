import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { pipeline } from 'stream/promises';
import { settingsQueries } from '../db/index.js';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.js';
import {
  parseBinaryVdf,
  serializeBinaryVdf,
  generateSteamAppId,
  SteamShortcut,
} from '../utils/vdf.js';

function getSteamUserdataDir(): string {
  return settingsQueries.get('steam_userdata_path', config.steamUserDataPath);
}

function getSteamGridDbKey(): string {
  return settingsQueries.get('steamgriddb_api_key', config.steamGridDbApiKey);
}

/**
 * Finds the first valid Steam user ID directory under Steam userdata
 */
function findSteamUserConfigDir(): { userDir: string; configDir: string; gridDir: string; shortcutsFile: string } | null {
  const userdataDir = getSteamUserdataDir();
  if (!fs.existsSync(userdataDir)) {
    return null;
  }

  const entries = fs.readdirSync(userdataDir, { withFileTypes: true });
  const userDirs = entries.filter((e) => e.isDirectory() && /^\d+$/.test(e.name));

  if (userDirs.length === 0) {
    return null;
  }

  // Use the most recently modified user directory
  const activeUserDir = path.join(userdataDir, userDirs[0].name);
  const configDir = path.join(activeUserDir, 'config');
  const gridDir = path.join(configDir, 'grid');
  const shortcutsFile = path.join(configDir, 'shortcuts.vdf');

  return {
    userDir: activeUserDir,
    configDir,
    gridDir,
    shortcutsFile,
  };
}

export async function steamRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // List existing shortcuts
  fastify.get('/shortcuts', async (request, reply) => {
    const steamPaths = findSteamUserConfigDir();
    if (!steamPaths || !fs.existsSync(steamPaths.shortcutsFile)) {
      return {
        found: false,
        shortcutsFile: steamPaths?.shortcutsFile || null,
        shortcuts: [],
      };
    }

    try {
      const buffer = fs.readFileSync(steamPaths.shortcutsFile);
      const parsed = parseBinaryVdf(buffer);
      const rawShortcuts = parsed.shortcuts || {};

      const shortcuts: SteamShortcut[] = Object.values(rawShortcuts);

      return {
        found: true,
        shortcutsFile: steamPaths.shortcutsFile,
        gridDir: steamPaths.gridDir,
        shortcuts,
      };
    } catch (err: any) {
      return reply.status(500).send({
        error: 'Failed to read or parse shortcuts.vdf',
        details: err.message,
      });
    }
  });

  // Add or update shortcut
  fastify.post('/shortcuts', async (request, reply) => {
    const {
      appName,
      exe,
      startDir,
      launchOptions,
      tags,
      compatTool,
    } = request.body as {
      appName?: string;
      exe?: string;
      startDir?: string;
      launchOptions?: string;
      tags?: string[];
      compatTool?: string;
    };

    if (!appName || !exe) {
      return reply.status(400).send({ error: 'appName and exe are required' });
    }

    const steamPaths = findSteamUserConfigDir();
    if (!steamPaths) {
      return reply.status(404).send({
        error: 'Steam userdata directory not found. Please configure path in Settings.',
      });
    }

    // Ensure config & grid directories exist
    if (!fs.existsSync(steamPaths.configDir)) {
      fs.mkdirSync(steamPaths.configDir, { recursive: true });
    }
    if (!fs.existsSync(steamPaths.gridDir)) {
      fs.mkdirSync(steamPaths.gridDir, { recursive: true });
    }

    let parsed: Record<string, any> = { shortcuts: {} };
    if (fs.existsSync(steamPaths.shortcutsFile)) {
      try {
        const buf = fs.readFileSync(steamPaths.shortcutsFile);
        parsed = parseBinaryVdf(buf);
        if (!parsed.shortcuts) parsed.shortcuts = {};
        // Backup
        fs.copyFileSync(steamPaths.shortcutsFile, `${steamPaths.shortcutsFile}.bak`);
      } catch (err) {
        console.warn('[Steam] Could not parse existing shortcuts.vdf, starting fresh');
      }
    }

    const appId = generateSteamAppId(exe, appName);
    const existingIndex = Object.keys(parsed.shortcuts).length;

    const formattedTags: Record<string, string> = {};
    if (tags && Array.isArray(tags)) {
      tags.forEach((t, i) => {
        formattedTags[String(i)] = t;
      });
    }

    const newShortcut: SteamShortcut = {
      appid: appId,
      AppName: appName,
      Exe: `"${exe}"`,
      StartDir: startDir ? `"${startDir}"` : `"${path.dirname(exe)}"`,
      icon: '',
      ShortcutPath: '',
      LaunchOptions: launchOptions || '',
      IsHidden: 0,
      AllowDesktopConfig: 1,
      AllowOverlay: 1,
      OpenVR: 0,
      Devkit: 0,
      DevkitGameID: '',
      DevkitOverrideAppID: 0,
      LastPlayTime: 0,
      FlatpakAppID: '',
      tags: formattedTags,
      compat_tool: compatTool || 'Proton Experimental',
    };

    parsed.shortcuts[String(existingIndex)] = newShortcut;

    const newBuffer = serializeBinaryVdf(parsed);
    fs.writeFileSync(steamPaths.shortcutsFile, newBuffer);

    return {
      message: 'Shortcut added successfully',
      appId,
      shortcut: newShortcut,
      shortcutsFile: steamPaths.shortcutsFile,
    };
  });

  // SteamGridDB: Search games
  fastify.get('/grid/search', async (request, reply) => {
    const { q } = request.query as { q?: string };
    const apiKey = getSteamGridDbKey();

    if (!apiKey) {
      return reply.status(400).send({
        error: 'SteamGridDB API key is not configured. Please add it in Settings.',
      });
    }

    if (!q || q.trim().length === 0) {
      return { games: [] };
    }

    try {
      const res = await axios.get(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(q.trim())}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 6000,
      });

      return {
        games: res.data.data || [],
      };
    } catch (err: any) {
      return reply.status(502).send({
        error: 'Failed to search SteamGridDB',
        details: err.message,
      });
    }
  });

  // SteamGridDB: Get artworks (grids, heroes, logos)
  fastify.get('/grid/assets/:gameId', async (request, reply) => {
    const { gameId } = request.params as { gameId: string };
    const apiKey = getSteamGridDbKey();

    if (!apiKey) {
      return reply.status(400).send({
        error: 'SteamGridDB API key is not configured.',
      });
    }

    try {
      const headers = { Authorization: `Bearer ${apiKey}` };

      const [gridsRes, heroesRes, logosRes] = await Promise.allSettled([
        axios.get(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=600x900,460x215,920x430`, { headers, timeout: 6000 }),
        axios.get(`https://www.steamgriddb.com/api/v2/heroes/game/${gameId}`, { headers, timeout: 6000 }),
        axios.get(`https://www.steamgriddb.com/api/v2/logos/game/${gameId}`, { headers, timeout: 6000 }),
      ]);

      const grids = gridsRes.status === 'fulfilled' ? gridsRes.value.data.data || [] : [];
      const heroes = heroesRes.status === 'fulfilled' ? heroesRes.value.data.data || [] : [];
      const logos = logosRes.status === 'fulfilled' ? logosRes.value.data.data || [] : [];

      return {
        grids: grids.map((g: any) => ({ id: g.id, url: g.url, thumb: g.thumb, width: g.width, height: g.height })),
        heroes: heroes.map((h: any) => ({ id: h.id, url: h.url, thumb: h.thumb, width: h.width, height: h.height })),
        logos: logos.map((l: any) => ({ id: l.id, url: l.url, thumb: l.thumb, width: l.width, height: l.height })),
      };
    } catch (err: any) {
      return reply.status(502).send({ error: 'Failed to fetch assets from SteamGridDB', details: err.message });
    }
  });

  // Download artwork into Steam grid folder
  fastify.post('/grid/download', async (request, reply) => {
    const { appId, assetType, imageUrl } = request.body as {
      appId?: number | string;
      assetType?: 'poster' | 'banner' | 'hero' | 'logo';
      imageUrl?: string;
    };

    if (!appId || !imageUrl || !assetType) {
      return reply.status(400).send({ error: 'appId, assetType, and imageUrl are required' });
    }

    const steamPaths = findSteamUserConfigDir();
    if (!steamPaths) {
      return reply.status(404).send({ error: 'Steam userdata directory not found.' });
    }

    if (!fs.existsSync(steamPaths.gridDir)) {
      fs.mkdirSync(steamPaths.gridDir, { recursive: true });
    }

    // Determine target filename based on Valve's grid convention:
    // poster (600x900): <appId>p.png
    // banner (460x215): <appId>.png
    // hero (1920x620): <appId>_hero.png
    // logo: <appId>_logo.png
    let filename = '';
    switch (assetType) {
      case 'poster':
        filename = `${appId}p.png`;
        break;
      case 'banner':
        filename = `${appId}.png`;
        break;
      case 'hero':
        filename = `${appId}_hero.png`;
        break;
      case 'logo':
        filename = `${appId}_logo.png`;
        break;
      default:
        filename = `${appId}p.png`;
    }

    const destPath = path.join(steamPaths.gridDir, filename);

    try {
      const response = await axios({
        method: 'GET',
        url: imageUrl,
        responseType: 'stream',
        timeout: 10000,
      });

      await pipeline(response.data, fs.createWriteStream(destPath));

      return {
        message: 'Artwork saved to Steam grid directory',
        filename,
        destPath,
      };
    } catch (err: any) {
      return reply.status(500).send({
        error: `Failed to download image: ${err.message}`,
      });
    }
  });

  // Proton recommendations based on ProtonDB
  fastify.get('/proton-recommendations/:appId', async (request) => {
    const { appId } = request.params as { appId: string };

    try {
      const res = await axios.get(`https://www.protondb.com/api/v1/reports/summaries/${appId}.json`, {
        timeout: 5000,
      });

      const tier = res.data.tier || 'unknown';

      let recommendedVersion = 'GE-Proton9-20';
      let launchOptions = 'gamemoderun %command%';
      let notes = '';

      switch (tier) {
        case 'platinum':
          recommendedVersion = 'Proton Experimental';
          notes = 'Works out of the box with zero tweaks. Proton Experimental or Proton 9.0 is recommended.';
          break;
        case 'gold':
          recommendedVersion = 'GE-Proton9-20';
          launchOptions = 'RADV_PERFTEST=gpl gamemoderun %command%';
          notes = 'Works flawlessly with GE-Proton for enhanced media codecs and audio fixes.';
          break;
        case 'silver':
          recommendedVersion = 'GE-Proton9-20';
          launchOptions = 'PROTON_NO_ESYNC=1 gamemoderun %command%';
          notes = 'May require minor tweaks or GE-Proton fixes.';
          break;
        case 'bronze':
        case 'borked':
          recommendedVersion = 'GE-Proton7-55 / Wine-GE';
          launchOptions = 'PROTON_USE_WINED3D=1 %command%';
          notes = 'Has significant compatibility hurdles. Check ProtonDB community reports for custom proton builds.';
          break;
        default:
          recommendedVersion = 'Proton Experimental';
          notes = 'No ProtonDB tier report. Try Proton Experimental first.';
      }

      return {
        appId,
        tier,
        score: res.data.score || 0,
        recommendedVersion,
        launchOptions,
        notes,
      };
    } catch {
      return {
        appId,
        tier: 'unknown',
        recommendedVersion: 'Proton Experimental',
        launchOptions: 'gamemoderun %command%',
        notes: 'No ProtonDB report available. Defaulting to Proton Experimental.',
      };
    }
  });
}
