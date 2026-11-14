import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { initDb } from './db/index.js';
import { startBackgroundCacheCleaner } from './services/imageCache.js';
import { authRoutes } from './routes/auth.js';
import { usersRoutes } from './routes/users.js';
import { systemRoutes } from './routes/system.js';
import { filesRoutes } from './routes/files.js';
import { terminalRoutes } from './routes/terminal.js';
import { gamesRoutes } from './routes/games.js';
import { wishlistRoutes } from './routes/wishlist.js';
import { torrentsRoutes } from './routes/torrents.js';
import { steamRoutes } from './routes/steam.js';
import { settingsRoutes } from './routes/settings.js';
import { rutrackerRoutes } from './routes/rutracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const fastify = Fastify({
    logger: process.env.NODE_ENV === 'production' ? true : {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Initialize SQLite database and seed default admin
  initDb();

  // Start background periodic cache cleaner (LRU & TTL janitor)
  startBackgroundCacheCleaner();

  // Register CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Register JWT
  await fastify.register(jwt, {
    secret: config.jwtSecret,
  });

  // Register WebSocket
  await fastify.register(websocket);

  // Register Multipart for file uploads (up to 1GB for games / ISOs / torrents)
  await fastify.register(multipart, {
    limits: {
      fileSize: 1024 * 1024 * 1024,
    },
  });

  // Health check
  fastify.get('/api/health', async () => ({
    status: 'ok',
    version: '1.0.1',
    timestamp: new Date().toISOString(),
  }));

  // Register API routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(usersRoutes, { prefix: '/api/users' });
  await fastify.register(systemRoutes, { prefix: '/api/system' });
  await fastify.register(filesRoutes, { prefix: '/api/files' });
  await fastify.register(terminalRoutes, { prefix: '/api/terminal' });
  await fastify.register(gamesRoutes, { prefix: '/api/games' });
  await fastify.register(wishlistRoutes, { prefix: '/api/wishlist' });
  await fastify.register(torrentsRoutes, { prefix: '/api/torrents' });
  await fastify.register(steamRoutes, { prefix: '/api/steam' });
  await fastify.register(settingsRoutes, { prefix: '/api/settings' });
  await fastify.register(rutrackerRoutes, { prefix: '/api/rutracker' });

  // Serve static frontend build if it exists
  const frontendDist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    await fastify.register(fastifyStatic, {
      root: frontendDist,
      prefix: '/',
    });

    fastify.setNotFoundHandler((request, reply) => {
      if (request.raw.url && request.raw.url.startsWith('/api')) {
        reply.status(404).send({ error: 'Endpoint Not Found' });
      } else {
        reply.sendFile('index.html');
      }
    });
  }

  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`🎮 GameCube-Manager Backend is running on http://${config.host}:${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

startServer();
