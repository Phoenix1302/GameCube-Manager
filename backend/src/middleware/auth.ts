import { FastifyRequest, FastifyReply } from 'fastify';

export interface JwtPayload {
  id: number;
  username: string;
  role: 'admin' | 'user';
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

/**
 * Safe helper to extract typed user from FastifyRequest
 */
export function getAuthUser(request: FastifyRequest): JwtPayload {
  return request.user as unknown as JwtPayload;
}

/**
 * Middleware to verify JWT token
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or missing authentication token',
    });
  }
}

/**
 * Middleware to verify that the authenticated user has 'admin' role
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  if (reply.sent) return;

  const user = getAuthUser(request);
  if (!user || user.role !== 'admin') {
    return reply.status(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Administrative privileges required for this action',
    });
  }
}
