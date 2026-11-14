import { FastifyInstance } from 'fastify';
import { wishlistQueries } from '../db/index.js';
import { authenticate, getAuthUser } from '../middleware/auth.js';

export async function wishlistRoutes(fastify: FastifyInstance) {
  // Wishlist requires authentication
  fastify.addHook('preHandler', authenticate);

  // List current user's wishlist
  fastify.get('/', async (request) => {
    const authUser = getAuthUser(request);
    const items = wishlistQueries.listByUser(authUser.id);
    return { items };
  });

  // Add game to wishlist
  fastify.post('/', async (request, reply) => {
    const { appId, title, imgUrl, genres, releaseDate } = request.body as {
      appId?: string | number;
      title?: string;
      imgUrl?: string;
      genres?: string;
      releaseDate?: string;
    };

    if (!appId || !title) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'appId and title are required',
      });
    }

    const authUser = getAuthUser(request);
    const id = wishlistQueries.add(
      authUser.id,
      String(appId),
      title.trim(),
      imgUrl,
      genres,
      releaseDate
    );

    return reply.status(201).send({
      message: 'Added to wishlist',
      id,
    });
  });

  // Remove game from wishlist
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const wishId = parseInt(id, 10);

    if (isNaN(wishId)) {
      return reply.status(400).send({ error: 'Invalid wishlist item ID' });
    }

    const authUser = getAuthUser(request);
    const removed = wishlistQueries.remove(wishId, authUser.id);
    if (!removed) {
      return reply.status(404).send({ error: 'Item not found in wishlist' });
    }

    return { message: 'Item removed from wishlist' };
  });
}
