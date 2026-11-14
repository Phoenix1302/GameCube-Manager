import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { userQueries } from '../db/index.js';
import { getAvatarData } from '../utils/avatar.js';
import { requireAdmin, getAuthUser } from '../middleware/auth.js';

export async function usersRoutes(fastify: FastifyInstance) {
  // All user management routes require admin role
  fastify.addHook('preHandler', requireAdmin);

  // List users
  fastify.get('/', async () => {
    const rawUsers = userQueries.list();
    const users = rawUsers.map((u) => ({
      ...u,
      avatar: getAvatarData(u.username),
    }));
    return { users };
  });

  // Create user
  fastify.post('/', async (request, reply) => {
    const { username, password, role } = request.body as {
      username?: string;
      password?: string;
      role?: 'admin' | 'user';
    };

    if (!username || !password) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Username and password are required',
      });
    }

    const cleanUsername = username.trim();
    if (cleanUsername.length < 3) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Username must be at least 3 characters long',
      });
    }

    if (password.length < 6) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Password must be at least 6 characters long',
      });
    }

    const existing = userQueries.getByUsername(cleanUsername);
    if (existing) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'Username is already taken',
      });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const userRole = role === 'admin' ? 'admin' : 'user';
    const newId = userQueries.create(cleanUsername, passwordHash, userRole);

    return reply.status(201).send({
      message: 'User created successfully',
      user: {
        id: newId,
        username: cleanUsername,
        role: userRole,
        avatar: getAvatarData(cleanUsername),
      },
    });
  });

  // Change user password
  fastify.put('/:id/password', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { newPassword } = request.body as { newPassword?: string };

    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid user ID',
      });
    }

    if (!newPassword || newPassword.length < 6) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'New password must be at least 6 characters long',
      });
    }

    const user = userQueries.getById(userId);
    if (!user) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'User not found',
      });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    userQueries.updatePassword(userId, newHash);

    return { message: 'Password updated successfully' };
  });

  // Delete user
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid user ID',
      });
    }

    const authUser = getAuthUser(request);
    if (authUser.id === userId) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'You cannot delete your own account',
      });
    }

    const user = userQueries.getById(userId);
    if (!user) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'User not found',
      });
    }

    userQueries.delete(userId);
    return { message: 'User deleted successfully' };
  });
}
