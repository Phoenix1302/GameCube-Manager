import { FastifyInstance } from 'fastify';
import axios from 'axios';
import { settingsQueries } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  getFullCacheStats,
  cleanImageCache,
  cleanEntireCache,
} from '../services/imageCache.js';

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdmin);

  // Get all settings
  fastify.get('/', async () => {
    const settings = settingsQueries.getAll();
    return { settings };
  });

  // Get full cache statistics (images on disk, SQLite database, limits)
  fastify.get('/cache-stats', async () => {
    return getFullCacheStats();
  });

  // Clean cache manually on demand
  fastify.post('/cache-clean', async (request) => {
    const { type = 'images' } = (request.body as { type?: 'images' | 'all' }) || {};
    let result;
    if (type === 'all') {
      result = cleanEntireCache();
    } else {
      result = cleanImageCache({ forceAll: true });
    }
    const updatedStats = getFullCacheStats();
    return {
      message: `Кэш успешно очищен (${result.freedFormatted} освобождено, ${result.deletedFiles} файлов удалено)`,
      result,
      stats: updatedStats,
    };
  });

  // Update settings
  fastify.post('/', async (request) => {
    const body = request.body as Record<string, string>;
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        settingsQueries.set(key, value.trim());
      }
    }
    return {
      message: 'Settings saved successfully',
      settings: settingsQueries.getAll(),
    };
  });

  // Test qBittorrent connection
  fastify.post('/test-qbittorrent', async (request, reply) => {
    const { url, username, password } = request.body as {
      url?: string;
      username?: string;
      password?: string;
    };

    const targetUrl = (url || settingsQueries.get('qbittorrent_url')).replace(/\/+$/, '');
    const targetUser = username !== undefined ? username : settingsQueries.get('qbittorrent_user');
    const targetPass = password !== undefined ? password : settingsQueries.get('qbittorrent_pass');

    try {
      const params = new URLSearchParams();
      params.append('username', targetUser);
      params.append('password', targetPass);

      const loginRes = await axios.post(`${targetUrl}/api/v2/auth/login`, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 4000,
      });

      if (loginRes.data === 'Fails.') {
        return reply.status(401).send({ success: false, error: 'qBittorrent rejected username or password' });
      }

      const versionRes = await axios.get(`${targetUrl}/api/v2/app/version`, {
        headers: loginRes.headers['set-cookie'] ? { Cookie: loginRes.headers['set-cookie'][0] } : {},
        timeout: 4000,
      });

      return {
        success: true,
        version: versionRes.data,
        message: `Successfully connected to qBittorrent (${versionRes.data})`,
      };
    } catch (err: any) {
      return reply.status(502).send({
        success: false,
        error: `Could not connect to qBittorrent: ${err.message}`,
      });
    }
  });

  // Test SteamGridDB API Key
  fastify.post('/test-steamgriddb', async (request, reply) => {
    const { apiKey } = request.body as { apiKey?: string };
    const key = apiKey || settingsQueries.get('steamgriddb_api_key');

    if (!key) {
      return reply.status(400).send({ success: false, error: 'API Key is empty' });
    }

    try {
      const res = await axios.get('https://www.steamgriddb.com/api/v2/search/autocomplete/portal', {
        headers: { Authorization: `Bearer ${key}` },
        timeout: 5000,
      });

      return {
        success: res.data.success === true,
        message: 'SteamGridDB API key is valid!',
      };
    } catch (err: any) {
      return reply.status(401).send({
        success: false,
        error: `SteamGridDB validation failed: ${err.response?.data?.errors?.[0] || err.message}`,
      });
    }
  });
}
