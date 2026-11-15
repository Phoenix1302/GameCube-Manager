import { FastifyInstance } from 'fastify';
import axios from 'axios';
import { settingsQueries } from '../db/index.js';
import { authenticate, getAuthUser } from '../middleware/auth.js';
import {
  getFullCacheStats,
  cleanImageCache,
  cleanEntireCache,
} from '../services/imageCache.js';
import { isDesktopUserAgent } from '../services/rutracker.js';

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // Get settings (admins receive system settings; regular users receive their own personal settings)
  fastify.get('/', async (request) => {
    const user = getAuthUser(request);
    if (user.role === 'admin') {
      const settings = settingsQueries.getAll();
      return { settings };
    }

    // Regular users: return public & per-user settings (with fallback to global defaults)
    const userSettings = settingsQueries.getUserSettings(user.id);
    return {
      settings: {
        rutracker_url: userSettings.rutracker_url || settingsQueries.get('rutracker_url', 'https://rutracker.org'),
        rutracker_cookie: userSettings.rutracker_cookie || settingsQueries.get('rutracker_cookie', ''),
        rutracker_download_mode: userSettings.rutracker_download_mode || settingsQueries.get('rutracker_download_mode', 'magnet'),
        rutracker_user_agent: userSettings.rutracker_user_agent || settingsQueries.get('rutracker_user_agent', ''),
        qbittorrent_url: 'http://127.0.0.1:8085',
      },
    };
  });

  // Get full cache statistics (images on disk, SQLite database, limits) - Admin only
  fastify.get('/cache-stats', async (request, reply) => {
    const user = getAuthUser(request);
    if (user.role !== 'admin') {
      return reply.status(403).send({ error: 'Administrative privileges required' });
    }
    return getFullCacheStats();
  });

  // Clean cache manually on demand - Admin only
  fastify.post('/cache-clean', async (request, reply) => {
    const user = getAuthUser(request);
    if (user.role !== 'admin') {
      return reply.status(403).send({ error: 'Administrative privileges required' });
    }
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
    const user = getAuthUser(request);
    const body = request.body as Record<string, string>;
    const incomingUa = request.headers['user-agent'];

    // Auto-capture desktop user-agent if saving cookies and user-agent was not explicitly typed
    if (isDesktopUserAgent(incomingUa) && !body.rutracker_user_agent) {
      if (user.role === 'admin' && !settingsQueries.get('rutracker_user_agent', '')) {
        settingsQueries.set('rutracker_user_agent', incomingUa!.trim());
      }
      if (!settingsQueries.getUserSetting(user.id, 'rutracker_user_agent')) {
        settingsQueries.setUserSetting(user.id, 'rutracker_user_agent', incomingUa!.trim());
      }
    }

    if (user.role === 'admin') {
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === 'string') {
          settingsQueries.set(key, value.trim());
        }
      }
      return {
        message: 'Settings saved successfully',
        settings: settingsQueries.getAll(),
      };
    }

    // Regular user can only save their own rutracker & download preferences
    const allowedKeys = ['rutracker_cookie', 'rutracker_download_mode', 'rutracker_url', 'rutracker_user_agent'];
    for (const [key, value] of Object.entries(body)) {
      if (allowedKeys.includes(key) && typeof value === 'string') {
        settingsQueries.setUserSetting(user.id, key, value.trim());
      }
    }

    return {
      message: 'Личные настройки успешно сохранены',
      settings: settingsQueries.getUserSettings(user.id),
    };
  });

  // Test qBittorrent connection - Admin only
  fastify.post('/test-qbittorrent', async (request, reply) => {
    const user = getAuthUser(request);
    if (user.role !== 'admin') {
      return reply.status(403).send({ error: 'Administrative privileges required' });
    }
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
