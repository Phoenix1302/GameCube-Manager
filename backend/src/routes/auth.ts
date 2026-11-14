import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { userQueries, isSystemInitialized, settingsQueries } from '../db/index.js';
import { getAvatarData } from '../utils/avatar.js';
import { authenticate, getAuthUser } from '../middleware/auth.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Check whether system is initialized with an administrator
  fastify.get('/setup-status', async () => {
    const initialized = isSystemInitialized();
    return {
      initialized,
      version: '1.1.1',
      appName: 'GameCube Manager',
    };
  });

  // First-run administrator setup
  fastify.post('/setup', async (request, reply) => {
    if (isSystemInitialized()) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Система уже инициализирована. Первичная настройка недоступна.',
      });
    }

    const { username, password, confirmPassword } = request.body as {
      username?: string;
      password?: string;
      confirmPassword?: string;
    };

    const cleanUsername = (username || 'admin').trim();
    if (cleanUsername.length < 3) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Имя администратора должно содержать не менее 3 символов',
      });
    }

    if (!password || password.length < 6) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Пароль должен содержать не менее 6 символов',
      });
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Введенные пароли не совпадают',
      });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const newId = userQueries.create(cleanUsername, passwordHash, 'admin');

    settingsQueries.set('system_initialized', 'true');
    console.log(`[SETUP] Administrator account "${cleanUsername}" created. System initialized.`);

    const token = fastify.jwt.sign(
      {
        id: newId,
        username: cleanUsername,
        role: 'admin',
      },
      { expiresIn: '7d' }
    );

    const avatar = getAvatarData(cleanUsername);

    return reply.status(201).send({
      message: 'Администратор успешно создан и система инициализирована',
      token,
      user: {
        id: newId,
        username: cleanUsername,
        role: 'admin',
        avatar,
      },
    });
  });

  // Login
  fastify.post('/login', async (request, reply) => {
    const { username, password } = request.body as { username?: string; password?: string };

    if (!username || !password) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Username and password are required',
      });
    }

    const user = userQueries.getByUsername(username.trim());
    if (!user) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid username or password',
      });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid username or password',
      });
    }

    const token = fastify.jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      { expiresIn: '7d' }
    );

    const avatar = getAvatarData(user.username);

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        avatar,
      },
    };
  });

  // Current user profile
  fastify.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const authUser = getAuthUser(request);
    const user = userQueries.getById(authUser.id);
    if (!user) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'User profile not found',
      });
    }

    const avatar = getAvatarData(user.username);

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      avatar,
      createdAt: user.created_at,
    };
  });

  // Change current user password
  fastify.put('/change-password', { preHandler: [authenticate] }, async (request, reply) => {
    const authUser = getAuthUser(request);
    const user = userQueries.getByUsername(authUser.username);
    if (!user) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Пользователь не найден',
      });
    }

    const { currentPassword, newPassword, confirmPassword } = request.body as {
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Укажите текущий и новый пароль',
      });
    }

    const isMatch = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!isMatch) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Неверный текущий пароль',
      });
    }

    if (newPassword.length < 6) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Новый пароль должен содержать не менее 6 символов',
      });
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Подтверждение не совпадает с новым паролем',
      });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    userQueries.updatePassword(user.id, newHash);

    return {
      message: 'Пароль успешно изменён',
    };
  });
}
