import { FastifyInstance } from 'fastify';
import {
  searchRutracker,
  downloadTorrentToQBit,
  getRutrackerMagnet,
  testRutrackerConnection,
  isRutrackerConfigured,
} from '../services/rutracker.js';
import { settingsQueries } from '../db/index.js';
import { authenticate, getAuthUser } from '../middleware/auth.js';

export async function rutrackerRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', async (request) => {
    const user = getAuthUser(request);
    const ua = request.headers['user-agent'];
    if (ua && !ua.includes('node') && !ua.includes('axios')) {
      if (user?.id) {
        settingsQueries.setUserSetting(user.id, 'rutracker_user_agent', ua);
      }
      settingsQueries.set('rutracker_user_agent', ua);
    }
  });

  // Status check: whether RuTracker credentials/cookies are set for this user
  fastify.get('/status', async (request) => {
    const user = getAuthUser(request);
    return {
      configured: isRutrackerConfigured(user?.id),
    };
  });

  // Search RuTracker for game releases
  fastify.get('/search', async (request, reply) => {
    const { q, query } = request.query as { q?: string; query?: string };
    const term = (q || query || '').trim();

    if (!term) {
      return reply.status(400).send({ error: 'Search term is required' });
    }

    const user = getAuthUser(request);
    const result = await searchRutracker(term, user?.id);
    return result;
  });

  // Get magnet URI for a topic
  fastify.get('/magnet/:topicId', async (request, reply) => {
    const { topicId } = request.params as { topicId: string };
    const numId = parseInt(topicId, 10);
    if (isNaN(numId)) {
      return reply.status(400).send({ error: 'Valid topicId is required' });
    }

    try {
      const user = getAuthUser(request);
      const magnet = await getRutrackerMagnet(numId, undefined, user?.id);
      return { topicId: numId, magnet };
    } catch (err: any) {
      return reply.status(500).send({
        error: `Не удалось получить magnet-ссылку: ${err.message}`,
      });
    }
  });

  // Download release from RuTracker (via Magnet or .torrent) and push directly to qBittorrent
  fastify.post('/download', async (request, reply) => {
    const { topicId, savePath, mode } = request.body as {
      topicId?: number | string;
      savePath?: string;
      mode?: 'magnet' | 'torrent' | 'auto';
    };
    const numId = parseInt(String(topicId), 10);

    if (isNaN(numId)) {
      return reply.status(400).send({ error: 'Valid topicId is required' });
    }

    try {
      const user = getAuthUser(request);
      const result = await downloadTorrentToQBit(numId, savePath, mode, user?.id);
      return result;
    } catch (err: any) {
      return reply.status(500).send({
        error: `Не удалось передать торрент в qBittorrent: ${err.message}`,
      });
    }
  });

  // Test RuTracker connection with configured credentials/cookies
  fastify.post('/test', async (request) => {
    const user = getAuthUser(request);
    const ua = request.headers['user-agent'];
    return testRutrackerConnection(ua, user?.id);
  });
}
