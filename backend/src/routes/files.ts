import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { config } from '../config.js';
import { settingsQueries } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';

function getHostRoot(): string {
  return settingsQueries.get('host_root', config.hostRoot);
}

export function toDisplayPath(internalPath: string): string {
  const hostRoot = getHostRoot();
  if (hostRoot && hostRoot !== '/' && internalPath.startsWith(hostRoot)) {
    const stripped = internalPath.slice(hostRoot.length);
    return stripped.startsWith('/') ? stripped : '/' + stripped;
  }
  return internalPath;
}

function resolveFullPath(relOrAbsPath: string): string {
  const hostRoot = getHostRoot();
  if (!relOrAbsPath || relOrAbsPath === '/' || relOrAbsPath === '.') {
    return hostRoot;
  }

  // If already prefixed with hostRoot, normalize
  if (relOrAbsPath.startsWith(hostRoot)) {
    return path.normalize(relOrAbsPath);
  }

  // If path directly exists inside container (e.g. direct volume mount like /mnt/game_data)
  if (path.isAbsolute(relOrAbsPath) && fs.existsSync(relOrAbsPath)) {
    return path.normalize(relOrAbsPath);
  }

  // Check if prepending hostRoot exists
  const cleanRel = relOrAbsPath.replace(/^[/\\]+/, '');
  const withHostRoot = path.resolve(hostRoot, cleanRel);
  if (fs.existsSync(withHostRoot)) {
    return withHostRoot;
  }

  return withHostRoot;
}

export async function filesRoutes(fastify: FastifyInstance) {
  // File operations require Admin privileges
  fastify.addHook('preHandler', requireAdmin);

  // List directory contents
  fastify.get('/list', async (request, reply) => {
    const { path: reqPath } = request.query as { path?: string };
    const hostRoot = getHostRoot();
    const fullPath = resolveFullPath(reqPath || '');

    if (!fs.existsSync(fullPath)) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Directory does not exist: ${toDisplayPath(fullPath)}`,
      });
    }

    const stat = await fs.promises.stat(fullPath);
    if (!stat.isDirectory()) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Path is not a directory',
      });
    }

    const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });

    const items = await Promise.all(
      entries.map(async (entry) => {
        const itemFullPath = path.join(fullPath, entry.name);
        try {
          const itemStat = await fs.promises.stat(itemFullPath);
          return {
            name: entry.name,
            path: toDisplayPath(itemFullPath),
            rawPath: itemFullPath,
            isDirectory: entry.isDirectory(),
            isFile: entry.isFile(),
            isSymlink: entry.isSymbolicLink(),
            size: itemStat.size,
            mtime: itemStat.mtime.toISOString(),
            permissions: (itemStat.mode & 0o777).toString(8),
          };
        } catch {
          return {
            name: entry.name,
            path: toDisplayPath(itemFullPath),
            rawPath: itemFullPath,
            isDirectory: entry.isDirectory(),
            isFile: entry.isFile(),
            isSymlink: entry.isSymbolicLink(),
            size: 0,
            mtime: new Date().toISOString(),
            permissions: '000',
          };
        }
      })
    );

    // Sort: directories first, then alphabetical
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    const isAtRoot = fullPath === hostRoot || toDisplayPath(fullPath) === '/';
    const parentPath = isAtRoot ? null : toDisplayPath(path.dirname(fullPath));

    return {
      currentPath: toDisplayPath(fullPath),
      rawPath: fullPath,
      parentPath,
      root: '/',
      items,
    };
  });

  // Read file contents (text/json/code)
  fastify.get('/read', async (request, reply) => {
    const { path: reqPath } = request.query as { path?: string };
    if (!reqPath) {
      return reply.status(400).send({ error: 'Path query parameter is required' });
    }

    const fullPath = resolveFullPath(reqPath);
    if (!fs.existsSync(fullPath)) {
      return reply.status(404).send({ error: 'File not found' });
    }

    const stat = await fs.promises.stat(fullPath);
    if (stat.isDirectory()) {
      return reply.status(400).send({ error: 'Target is a directory, not a file' });
    }

    // Protection against reading huge binary files into memory
    if (stat.size > 5 * 1024 * 1024) {
      return reply.status(413).send({ error: 'File exceeds 5MB limit for inline text viewing' });
    }

    const content = await fs.promises.readFile(fullPath, 'utf-8');
    return {
      path: fullPath,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      content,
    };
  });

  // Write / Save file contents
  fastify.post('/write', async (request, reply) => {
    const { path: reqPath, content } = request.body as { path?: string; content?: string };
    if (!reqPath || content === undefined) {
      return reply.status(400).send({ error: 'Path and content are required' });
    }

    const fullPath = resolveFullPath(reqPath);
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      await fs.promises.mkdir(parentDir, { recursive: true });
    }

    await fs.promises.writeFile(fullPath, content, 'utf-8');
    return { message: 'File saved successfully', path: fullPath };
  });

  // Create directory
  fastify.post('/mkdir', async (request, reply) => {
    const { path: reqPath } = request.body as { path?: string };
    if (!reqPath) {
      return reply.status(400).send({ error: 'Path is required' });
    }

    const fullPath = resolveFullPath(reqPath);
    if (fs.existsSync(fullPath)) {
      return reply.status(409).send({ error: 'Directory or file already exists' });
    }

    await fs.promises.mkdir(fullPath, { recursive: true });
    return { message: 'Directory created successfully', path: fullPath };
  });

  // Rename or Move
  fastify.post('/rename', async (request, reply) => {
    const { oldPath, newPath } = request.body as { oldPath?: string; newPath?: string };
    if (!oldPath || !newPath) {
      return reply.status(400).send({ error: 'oldPath and newPath are required' });
    }

    const resolvedOld = resolveFullPath(oldPath);
    const resolvedNew = resolveFullPath(newPath);

    if (!fs.existsSync(resolvedOld)) {
      return reply.status(404).send({ error: 'Source file does not exist' });
    }

    await fs.promises.rename(resolvedOld, resolvedNew);
    return { message: 'Item renamed / moved successfully', from: resolvedOld, to: resolvedNew };
  });

  // Delete file or directory
  fastify.delete('/', async (request, reply) => {
    const { path: reqPath } = request.query as { path?: string };
    if (!reqPath) {
      return reply.status(400).send({ error: 'Path query parameter is required' });
    }

    const fullPath = resolveFullPath(reqPath);
    const hostRoot = getHostRoot();

    // Prevent deleting host root itself
    if (fullPath === hostRoot || fullPath === '/' || fullPath === 'C:\\') {
      return reply.status(403).send({ error: 'Cannot delete the root directory' });
    }

    if (!fs.existsSync(fullPath)) {
      return reply.status(404).send({ error: 'Target does not exist' });
    }

    await fs.promises.rm(fullPath, { recursive: true, force: true });
    return { message: 'Deleted successfully', path: fullPath };
  });

  // Download file
  fastify.get('/download', async (request, reply) => {
    const { path: reqPath } = request.query as { path?: string };
    if (!reqPath) {
      return reply.status(400).send({ error: 'Path parameter is required' });
    }

    const fullPath = resolveFullPath(reqPath);
    if (!fs.existsSync(fullPath)) {
      return reply.status(404).send({ error: 'File not found' });
    }

    const stat = await fs.promises.stat(fullPath);
    if (stat.isDirectory()) {
      return reply.status(400).send({ error: 'Cannot download a directory directly' });
    }

    const filename = path.basename(fullPath);
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Length', stat.size);

    return reply.send(fs.createReadStream(fullPath));
  });

  // Upload file(s) via multipart
  fastify.post('/upload', async (request, reply) => {
    const parts = request.parts();
    let targetDir = getHostRoot();

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'targetDir') {
        targetDir = resolveFullPath(part.value as string);
      } else if (part.type === 'file') {
        if (!fs.existsSync(targetDir)) {
          await fs.promises.mkdir(targetDir, { recursive: true });
        }
        const destination = path.join(targetDir, part.filename);
        await pipeline(part.file, fs.createWriteStream(destination));
      }
    }

    return { message: 'Upload completed', targetDir };
  });
}
