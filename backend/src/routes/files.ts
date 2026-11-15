import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { config } from '../config.js';
import { settingsQueries } from '../db/index.js';
import { authenticate, getAuthUser, JwtPayload } from '../middleware/auth.js';

export interface FileEntry {
  name: string;
  path: string;
  rawPath: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  size: number;
  mtime: string;
  permissions: string;
}

export interface RootItem {
  name: string;
  path: string;
  isDefault?: boolean;
}

export interface RootsResponse {
  isAdmin: boolean;
  roots: RootItem[];
  defaultPath: string;
}

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

export function resolveFullPath(relOrAbsPath: string): string {
  const hostRoot = getHostRoot();
  if (!relOrAbsPath || relOrAbsPath === '/' || relOrAbsPath === '.') {
    return hostRoot;
  }

  // If already prefixed with hostRoot, normalize
  if (relOrAbsPath.startsWith(hostRoot)) {
    return path.normalize(relOrAbsPath);
  }

  const cleanRel = relOrAbsPath.replace(/^[/\\]+/, '');
  const withHostRoot = path.resolve(hostRoot, cleanRel);

  // 1. If withHostRoot exists on the host filesystem, ALWAYS return it!
  // This correctly maps /home/..., /etc/..., /var/... to /host_root/home/..., /host_root/etc/..., etc.
  if (fs.existsSync(withHostRoot)) {
    return withHostRoot;
  }

  // 2. If path directly exists inside container (e.g. direct volume mounts like /mnt/game_data)
  if (path.isAbsolute(relOrAbsPath) && fs.existsSync(relOrAbsPath)) {
    return path.normalize(relOrAbsPath);
  }

  // 3. For newly created paths that do not exist yet on disk:
  // Check if it belongs to an allowed container root (like custom_games_path or /downloads)
  const allowedRoots = getUserAllowedRoots();
  for (const r of allowedRoots) {
    const normRoot = path.resolve(r);
    if (isInsideOrEqual(path.resolve(relOrAbsPath), normRoot)) {
      return path.normalize(relOrAbsPath);
    }
  }

  return withHostRoot;
}

/**
 * Returns allowed root folders for a regular (non-admin) user:
 * a) custom games path
 * b) downloads path (and /downloads if it exists)
 */
export function getUserAllowedRoots(): string[] {
  const roots: string[] = [];

  // a) Custom games path
  const customGames = settingsQueries.get('custom_games_path', config.customGamesPath);
  if (customGames && customGames.trim()) {
    roots.push(customGames.trim());
  }

  // b) Downloads path
  const downloads = settingsQueries.get('downloads_path', '/mnt/game_data/Downloads');
  if (downloads && downloads.trim()) {
    roots.push(downloads.trim());
  }

  // and /downloads if it exists
  const altDownloads = '/downloads';
  try {
    if (fs.existsSync(altDownloads) || fs.existsSync(resolveFullPath(altDownloads))) {
      roots.push(altDownloads);
    }
  } catch {}

  return roots;
}

/**
 * Checks whether childPath is equal to or located strictly inside parentPath.
 * Immune to prefix tricks (e.g. /games vs /games2).
 */
export function isInsideOrEqual(childPath: string, parentPath: string): boolean {
  const normChild = path.resolve(childPath);
  const normParent = path.resolve(parentPath);

  if (config.isWindows) {
    const rel = path.relative(normParent.toLowerCase(), normChild.toLowerCase());
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  }

  const rel = path.relative(normParent, normChild);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Resolve canonical realpath for target, walking up existing ancestors if target does not yet exist.
 * Prevents escaping through symlinks.
 */
export function getRealOrCanonicalPath(targetPath: string): string {
  try {
    if (fs.existsSync(targetPath)) {
      return fs.realpathSync(targetPath);
    }
  } catch {}

  let current = path.resolve(targetPath);
  const segments: string[] = [];
  while (current && !fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    segments.unshift(path.basename(current));
    current = parent;
  }

  try {
    if (fs.existsSync(current)) {
      const realParent = fs.realpathSync(current);
      return path.resolve(realParent, ...segments);
    }
  } catch {}

  return path.resolve(targetPath);
}

/**
 * Checks if targetPath is inside allowed paths for the user.
 */
export function isPathAllowedForUser(user: JwtPayload | undefined, targetPath: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;

  const rawRoots = getUserAllowedRoots();
  const allAllowedRoots: string[] = [];
  for (const r of rawRoots) {
    if (!allAllowedRoots.includes(r)) {
      allAllowedRoots.push(r);
    }
    const resolved = resolveFullPath(r);
    if (resolved && !allAllowedRoots.includes(resolved)) {
      allAllowedRoots.push(resolved);
    }
  }

  const resolvedTarget = path.resolve(targetPath);
  const realTarget = getRealOrCanonicalPath(resolvedTarget);

  for (const root of allAllowedRoots) {
    const resolvedRoot = path.resolve(root);
    const realRoot = getRealOrCanonicalPath(resolvedRoot);

    const matchesResolved = isInsideOrEqual(resolvedTarget, resolvedRoot);
    const matchesReal = isInsideOrEqual(realTarget, realRoot);

    if (matchesResolved && matchesReal) {
      return true;
    }
  }

  return false;
}

/**
 * Guard check preventing directory traversal via .. or symlinks.
 */
export function checkPathAccess(
  user: JwtPayload | undefined,
  resolvedPath: string
): { allowed: boolean; message?: string } {
  if (!user) {
    return {
      allowed: false,
      message: 'Пользователь не авторизован',
    };
  }

  if (user.role === 'admin') {
    return { allowed: true };
  }

  if (isPathAllowedForUser(user, resolvedPath)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    message: 'Доступ запрещен: данный путь находится за пределами разрешенных директорий',
  };
}

/**
 * Determines whether the user is currently at a designated root boundary.
 */
export function isAtUserRoot(user: JwtPayload, fullPath: string): boolean {
  if (user.role === 'admin') {
    const hostRoot = getHostRoot();
    return fullPath === hostRoot || toDisplayPath(fullPath) === '/';
  }

  const allowedRoots = getUserAllowedRoots();
  const normFullPath = path.resolve(fullPath);
  for (const root of allowedRoots) {
    const normRoot = path.resolve(root);
    const resolvedRoot = path.resolve(resolveFullPath(root));
    if (normFullPath === normRoot || normFullPath === resolvedRoot) {
      return true;
    }
    if (toDisplayPath(fullPath) === toDisplayPath(root)) {
      return true;
    }
  }

  // If the parent of fullPath is not within allowed directories, fullPath is effectively the boundary root
  const parentOfCurrent = path.dirname(fullPath);
  if (!isPathAllowedForUser(user, parentOfCurrent)) {
    return true;
  }

  return false;
}

export function findRealSteamUserdataDir(): string {
  const hostRoot = getHostRoot();
  const configured = settingsQueries.get('steam_userdata_path', config.steamUserDataPath);
  const resolved = resolveFullPath(configured);
  if (fs.existsSync(resolved)) {
    return resolved;
  }

  // Candidates on the host filesystem
  const candidates: string[] = [
    path.join(hostRoot, 'home/gamecube/.local/share/Steam/userdata'),
    path.join(hostRoot, 'home/gamecube/.steam/steam/userdata'),
    path.join(hostRoot, 'home/deck/.local/share/Steam/userdata'),
    path.join(hostRoot, 'home/deck/.steam/steam/userdata'),
  ];

  // Scan all user home directories under hostRoot/home
  try {
    const homeDir = path.join(hostRoot, 'home');
    if (fs.existsSync(homeDir)) {
      const users = fs.readdirSync(homeDir, { withFileTypes: true });
      for (const u of users) {
        if (u.isDirectory()) {
          candidates.push(path.join(homeDir, u.name, '.local/share/Steam/userdata'));
          candidates.push(path.join(homeDir, u.name, '.steam/steam/userdata'));
          candidates.push(path.join(homeDir, u.name, '.var/app/com.valvesoftware.Steam/.local/share/Steam/userdata'));
        }
      }
    }
  } catch {}

  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      try {
        settingsQueries.set('steam_userdata_path', cand);
      } catch {}
      return cand;
    }
  }

  // If not found, ensure directory exists at resolved path so it is ready for use without 404
  try {
    fs.mkdirSync(resolved, { recursive: true });
  } catch {}

  return resolved;
}

export function findRealSteamCommonDir(): string {
  const hostRoot = getHostRoot();
  const configuredLib = settingsQueries.get('steam_library_path', config.steamLibraryPath);
  const resolved = resolveFullPath(path.join(configuredLib, 'steamapps', 'common'));
  if (fs.existsSync(resolved)) {
    return resolved;
  }

  const candidates: string[] = [
    '/mnt/game_data/SteamLibrary/steamapps/common',
    path.join(hostRoot, 'mnt/game_data/SteamLibrary/steamapps/common'),
    path.join(hostRoot, 'home/gamecube/.local/share/Steam/steamapps/common'),
    path.join(hostRoot, 'home/deck/.local/share/Steam/steamapps/common'),
  ];

  try {
    const homeDir = path.join(hostRoot, 'home');
    if (fs.existsSync(homeDir)) {
      const users = fs.readdirSync(homeDir, { withFileTypes: true });
      for (const u of users) {
        if (u.isDirectory()) {
          candidates.push(path.join(homeDir, u.name, '.local/share/Steam/steamapps/common'));
          candidates.push(path.join(homeDir, u.name, '.steam/steam/steamapps/common'));
          candidates.push(path.join(homeDir, u.name, '.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common'));
        }
      }
    }
  } catch {}

  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      return cand;
    }
  }

  try {
    if (fs.existsSync('/mnt/game_data')) {
      const defaultMntCommon = '/mnt/game_data/SteamLibrary/steamapps/common';
      fs.mkdirSync(defaultMntCommon, { recursive: true });
      return defaultMntCommon;
    }
  } catch {}

  return resolved;
}

export async function filesRoutes(fastify: FastifyInstance) {
  // File operations require valid authenticated user
  fastify.addHook('preHandler', authenticate);

  // Get accessible roots and default path for the current user
  fastify.get('/roots', async (request: FastifyRequest): Promise<RootsResponse> => {
    const user = getAuthUser(request);
    const isAdmin = user?.role === 'admin';

    const customGamesSetting = settingsQueries.get('custom_games_path', config.customGamesPath);
    const gamesDisplay = toDisplayPath(customGamesSetting);

    let downloadsDisplay = toDisplayPath(settingsQueries.get('downloads_path', '/mnt/game_data/Downloads'));
    try {
      if (fs.existsSync('/downloads')) {
        downloadsDisplay = '/downloads';
      }
    } catch {}

    if (!isAdmin) {
      return {
        isAdmin: false,
        roots: [
          { name: 'Игры', path: gamesDisplay, isDefault: true },
          { name: 'Загрузки', path: downloadsDisplay },
        ],
        defaultPath: gamesDisplay,
      };
    }

    const steamCommonReal = findRealSteamCommonDir();
    const steamCommonDisplay = toDisplayPath(steamCommonReal);

    const steamUserDataReal = findRealSteamUserdataDir();
    const steamUserDataDisplay = toDisplayPath(steamUserDataReal);

    const rootDisplay = '/';

    return {
      isAdmin: true,
      roots: [
        { name: 'Игры', path: gamesDisplay, isDefault: true },
        { name: 'Steam common', path: steamCommonDisplay },
        { name: 'Загрузки', path: downloadsDisplay },
        { name: 'Steam Userdata', path: steamUserDataDisplay },
        { name: 'Корень', path: rootDisplay },
      ],
      defaultPath: rootDisplay,
    };
  });

  // List directory contents
  fastify.get('/list', async (request: FastifyRequest, reply: FastifyReply) => {
    const { path: reqPath } = request.query as { path?: string };
    const user = getAuthUser(request);
    const isAdmin = user?.role === 'admin';
    const hostRoot = getHostRoot();

    const defaultGamesPath = toDisplayPath(settingsQueries.get('custom_games_path', config.customGamesPath));

    let targetPath = reqPath;
    if (targetPath === undefined || targetPath === null || targetPath.trim() === '') {
      targetPath = isAdmin ? hostRoot : defaultGamesPath;
    }

    let fullPath = resolveFullPath(targetPath);

    // Auto-create default games path if missing so user doesn't encounter a 404
    if (!isAdmin && (targetPath === defaultGamesPath || fullPath === resolveFullPath(defaultGamesPath))) {
      if (!fs.existsSync(fullPath)) {
        try {
          await fs.promises.mkdir(fullPath, { recursive: true });
        } catch {}
      }
    }

    // Auto-detect or auto-create Steam Userdata if being accessed
    const steamUserDataSetting = settingsQueries.get('steam_userdata_path', config.steamUserDataPath);
    if (isAdmin && (targetPath === toDisplayPath(steamUserDataSetting) || fullPath === resolveFullPath(steamUserDataSetting))) {
      if (!fs.existsSync(fullPath)) {
        const realUserdata = findRealSteamUserdataDir();
        if (realUserdata && fs.existsSync(realUserdata)) {
          fullPath = realUserdata;
        } else {
          try {
            await fs.promises.mkdir(fullPath, { recursive: true });
          } catch {}
        }
      }
    }

    const access = checkPathAccess(user, fullPath);
    if (!access.allowed) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: access.message || 'Доступ запрещен: недостаточно прав для работы с указанным путем',
      });
    }

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

    const items: FileEntry[] = await Promise.all(
      entries.map(async (entry: fs.Dirent): Promise<FileEntry> => {
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
    items.sort((a: FileEntry, b: FileEntry) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    const isAtRoot = isAtUserRoot(user, fullPath);
    const parentPath = isAtRoot ? null : toDisplayPath(path.dirname(fullPath));

    return {
      currentPath: toDisplayPath(fullPath),
      rawPath: fullPath,
      parentPath,
      root: isAdmin ? '/' : defaultGamesPath,
      items,
    };
  });

  // Read file contents (text/json/code)
  fastify.get('/read', async (request: FastifyRequest, reply: FastifyReply) => {
    const { path: reqPath } = request.query as { path?: string };
    if (!reqPath) {
      return reply.status(400).send({ error: 'Path query parameter is required' });
    }

    const fullPath = resolveFullPath(reqPath);
    const user = getAuthUser(request);
    const access = checkPathAccess(user, fullPath);
    if (!access.allowed) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: access.message || 'Доступ запрещен',
      });
    }

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
  fastify.post('/write', async (request: FastifyRequest, reply: FastifyReply) => {
    const { path: reqPath, content } = request.body as { path?: string; content?: string };
    if (!reqPath || content === undefined) {
      return reply.status(400).send({ error: 'Path and content are required' });
    }

    const fullPath = resolveFullPath(reqPath);
    const user = getAuthUser(request);
    const access = checkPathAccess(user, fullPath);
    if (!access.allowed) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: access.message || 'Доступ запрещен',
      });
    }

    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      await fs.promises.mkdir(parentDir, { recursive: true });
    }

    await fs.promises.writeFile(fullPath, content, 'utf-8');
    return { message: 'File saved successfully', path: fullPath };
  });

  // Create directory
  fastify.post('/mkdir', async (request: FastifyRequest, reply: FastifyReply) => {
    const { path: reqPath } = request.body as { path?: string };
    if (!reqPath) {
      return reply.status(400).send({ error: 'Path is required' });
    }

    const fullPath = resolveFullPath(reqPath);
    const user = getAuthUser(request);
    const access = checkPathAccess(user, fullPath);
    if (!access.allowed) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: access.message || 'Доступ запрещен',
      });
    }

    if (fs.existsSync(fullPath)) {
      return reply.status(409).send({ error: 'Directory or file already exists' });
    }

    await fs.promises.mkdir(fullPath, { recursive: true });
    return { message: 'Directory created successfully', path: fullPath };
  });

  // Rename or Move (simple path-to-path)
  fastify.post('/rename', async (request: FastifyRequest, reply: FastifyReply) => {
    const { oldPath, newPath } = request.body as { oldPath?: string; newPath?: string };
    if (!oldPath || !newPath) {
      return reply.status(400).send({ error: 'oldPath and newPath are required' });
    }

    const resolvedOld = resolveFullPath(oldPath);
    const resolvedNew = resolveFullPath(newPath);

    const user = getAuthUser(request);
    const oldAccess = checkPathAccess(user, resolvedOld);
    if (!oldAccess.allowed) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: oldAccess.message || 'Доступ запрещен к исходному пути',
      });
    }

    if (user.role !== 'admin' && isAtUserRoot(user, resolvedOld)) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Запрещено переименовывать корневую директорию',
      });
    }

    const newAccess = checkPathAccess(user, resolvedNew);
    if (!newAccess.allowed) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: newAccess.message || 'Доступ запрещен к целевому пути',
      });
    }

    if (!fs.existsSync(resolvedOld)) {
      return reply.status(404).send({ error: 'Source file does not exist' });
    }

    const targetDir = path.dirname(resolvedNew);
    if (!fs.existsSync(targetDir)) {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    try {
      await fs.promises.rename(resolvedOld, resolvedNew);
    } catch (err: any) {
      if (err?.code === 'EXDEV' || (typeof err?.message === 'string' && err.message.includes('cross-device'))) {
        await fs.promises.cp(resolvedOld, resolvedNew, { recursive: true, force: true });
        await fs.promises.rm(resolvedOld, { recursive: true, force: true });
      } else {
        throw err;
      }
    }

    return { message: 'Item renamed / moved successfully', from: resolvedOld, to: resolvedNew };
  });

  // Copy file or directory
  fastify.post('/copy', async (request: FastifyRequest, reply: FastifyReply) => {
    const { source, destination, overwrite } = request.body as {
      source?: string;
      destination?: string;
      overwrite?: boolean;
    };

    if (!source || !destination) {
      return reply.status(400).send({ error: 'source and destination are required' });
    }

    const resolvedSource = resolveFullPath(source);
    const resolvedDest = resolveFullPath(destination);

    if (!fs.existsSync(resolvedSource)) {
      return reply.status(404).send({
        error: 'Source not found',
        message: `Исходный файл или папка не существует: ${source}`,
      });
    }

    let target = resolvedDest;
    try {
      if (fs.existsSync(resolvedDest)) {
        const destStat = await fs.promises.stat(resolvedDest);
        if (destStat.isDirectory() && path.basename(resolvedDest) !== path.basename(resolvedSource)) {
          target = path.join(resolvedDest, path.basename(resolvedSource));
        }
      }
    } catch {}

    const normSource = path.resolve(resolvedSource);
    const normTarget = path.resolve(target);

    const user = getAuthUser(request);

    // Check permissions for source and destination target
    const sourceAccess = checkPathAccess(user, resolvedSource);
    if (!sourceAccess.allowed) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: sourceAccess.message || 'Доступ запрещен к исходному пути',
      });
    }

    const targetAccess = checkPathAccess(user, target);
    if (!targetAccess.allowed) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: targetAccess.message || 'Доступ запрещен к целевому пути',
      });
    }

    const sourceStat = await fs.promises.stat(resolvedSource);
    if (sourceStat.isDirectory()) {
      if (normTarget === normSource || isInsideOrEqual(normTarget, normSource)) {
        return reply.status(400).send({
          error: 'Invalid copy target',
          message: 'Невозможно скопировать папку внутрь самой себя',
        });
      }
    } else {
      if (normTarget === normSource) {
        return reply.status(400).send({
          error: 'Invalid copy target',
          message: 'Исходный и целевой файл совпадают',
        });
      }
    }

    if (fs.existsSync(target)) {
      if (overwrite !== true) {
        return reply.status(409).send({
          error: 'Target exists',
          exists: true,
          message: `Элемент "${path.basename(target)}" уже существует в целевой папке. Заменить его?`,
        });
      }
      await fs.promises.rm(target, { recursive: true, force: true });
    }

    const targetDir = path.dirname(target);
    if (!fs.existsSync(targetDir)) {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    await fs.promises.cp(resolvedSource, target, { recursive: true, force: true });

    return {
      message: 'Item copied successfully',
      from: source,
      to: target,
    };
  });

  // Move file or directory
  fastify.post('/move', async (request: FastifyRequest, reply: FastifyReply) => {
    const { source, destination, overwrite } = request.body as {
      source?: string;
      destination?: string;
      overwrite?: boolean;
    };

    if (!source || !destination) {
      return reply.status(400).send({ error: 'source and destination are required' });
    }

    const resolvedSource = resolveFullPath(source);
    const resolvedDest = resolveFullPath(destination);

    if (!fs.existsSync(resolvedSource)) {
      return reply.status(404).send({
        error: 'Source not found',
        message: `Исходный файл или папка не существует: ${source}`,
      });
    }

    let target = resolvedDest;
    try {
      if (fs.existsSync(resolvedDest)) {
        const destStat = await fs.promises.stat(resolvedDest);
        if (destStat.isDirectory() && path.basename(resolvedDest) !== path.basename(resolvedSource)) {
          target = path.join(resolvedDest, path.basename(resolvedSource));
        }
      }
    } catch {}

    const normSource = path.resolve(resolvedSource);
    const normTarget = path.resolve(target);

    if (normSource === normTarget) {
      return reply.status(400).send({
        error: 'Invalid target',
        message: 'Исходный и целевой пути совпадают',
      });
    }

    const sourceStat = await fs.promises.stat(resolvedSource);
    if (sourceStat.isDirectory()) {
      if (isInsideOrEqual(normTarget, normSource)) {
        return reply.status(400).send({
          error: 'Invalid target',
          message: 'Запрещено перемещать папку саму в себя или в свои подпапки',
        });
      }
    }

    const user = getAuthUser(request);

    const sourceAccess = checkPathAccess(user, resolvedSource);
    if (!sourceAccess.allowed) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: sourceAccess.message || 'Доступ запрещен к исходному пути',
      });
    }

    const targetAccess = checkPathAccess(user, target);
    if (!targetAccess.allowed) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: targetAccess.message || 'Доступ запрещен к целевому пути',
      });
    }

    if (fs.existsSync(target)) {
      if (overwrite !== true) {
        return reply.status(409).send({
          error: 'Target exists',
          exists: true,
          message: `Элемент "${path.basename(target)}" уже существует в целевой папке. Заменить его?`,
        });
      }
      await fs.promises.rm(target, { recursive: true, force: true });
    }

    const targetDir = path.dirname(target);
    if (!fs.existsSync(targetDir)) {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    try {
      await fs.promises.rename(resolvedSource, target);
    } catch (err: any) {
      if (err?.code === 'EXDEV' || (typeof err?.message === 'string' && err.message.includes('cross-device'))) {
        await fs.promises.cp(resolvedSource, target, { recursive: true, force: true });
        await fs.promises.rm(resolvedSource, { recursive: true, force: true });
      } else {
        throw err;
      }
    }

    return {
      message: 'Item moved successfully',
      from: source,
      to: target,
    };
  });

  // Delete file or directory
  fastify.delete('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { path: reqPath } = request.query as { path?: string };
    if (!reqPath) {
      return reply.status(400).send({ error: 'Path query parameter is required' });
    }

    const fullPath = resolveFullPath(reqPath);
    const hostRoot = getHostRoot();

    const user = getAuthUser(request);
    const access = checkPathAccess(user, fullPath);
    if (!access.allowed) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: access.message || 'Доступ запрещен к удаляемому пути',
      });
    }

    // Prevent deleting host root itself
    if (fullPath === hostRoot || fullPath === '/' || fullPath === 'C:\\') {
      return reply.status(403).send({ error: 'Cannot delete the root directory' });
    }

    // For regular users, prevent deleting root boundaries
    if (user.role !== 'admin' && isAtUserRoot(user, fullPath)) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Запрещено удалять корневую директорию',
      });
    }

    if (!fs.existsSync(fullPath)) {
      return reply.status(404).send({ error: 'Target does not exist' });
    }

    await fs.promises.rm(fullPath, { recursive: true, force: true });
    return { message: 'Deleted successfully', path: fullPath };
  });

  // Download file
  fastify.get('/download', async (request: FastifyRequest, reply: FastifyReply) => {
    const { path: reqPath } = request.query as { path?: string };
    if (!reqPath) {
      return reply.status(400).send({ error: 'Path parameter is required' });
    }

    const fullPath = resolveFullPath(reqPath);
    const user = getAuthUser(request);
    const access = checkPathAccess(user, fullPath);
    if (!access.allowed) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: access.message || 'Доступ запрещен',
      });
    }

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
  fastify.post('/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getAuthUser(request);
    const defaultGamesPath = toDisplayPath(settingsQueries.get('custom_games_path', config.customGamesPath));
    const defaultDir = user.role === 'admin' ? getHostRoot() : resolveFullPath(defaultGamesPath);
    let targetDir = defaultDir;

    const parts = (request as any).parts();

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'targetDir') {
        targetDir = resolveFullPath(part.value as string);
      } else if (part.type === 'file') {
        const access = checkPathAccess(user, targetDir);
        if (!access.allowed) {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: access.message || 'Доступ запрещен к целевой директории',
          });
        }

        const destination = path.join(targetDir, part.filename);
        const destAccess = checkPathAccess(user, destination);
        if (!destAccess.allowed) {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Доступ запрещен к целевому файлу',
          });
        }

        if (!fs.existsSync(targetDir)) {
          await fs.promises.mkdir(targetDir, { recursive: true });
        }
        await pipeline(part.file, fs.createWriteStream(destination));
      }
    }

    return { message: 'Upload completed', targetDir };
  });
}
