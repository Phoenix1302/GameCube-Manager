import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

// Ensure data directory exists
const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(config.dbPath);

// Enable WAL mode for high concurrency, memory-backed temp store, and 64MB cache
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000');
db.pragma('temp_store = MEMORY');

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: 'admin' | 'user';
  created_at: string;
}

export interface WishlistItemRow {
  id: number;
  user_id: number;
  app_id: string;
  title: string;
  img_url: string;
  genres: string;
  release_date: string;
  created_at: string;
}

export interface SettingRow {
  key: string;
  value: string;
}

export interface GameCacheRow {
  app_id: number;
  name: string;
  header_image: string | null;
  capsule_image: string | null;
  hero_image: string | null;
  details_json: string | null;
  cached_at: number;
  expires_at: number;
}

export interface BrowseCacheRow {
  cache_key: string;
  data_json: string;
  cached_at: number;
  expires_at: number;
}

export interface ImageCacheRow {
  cache_key: string;
  app_id: number | null;
  image_type: string;
  cdn_url: string;
  local_path: string | null;
  content_type: string;
  file_size: number;
  cached_at: number;
  last_accessed: number;
}

/**
 * Initialize SQLite database schema and seed default admin user
 */
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wishlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      app_id TEXT NOT NULL,
      title TEXT NOT NULL,
      img_url TEXT,
      genres TEXT,
      release_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_cache (
      app_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      header_image TEXT,
      capsule_image TEXT,
      hero_image TEXT,
      details_json TEXT,
      cached_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_game_cache_expires ON game_cache(expires_at);

    CREATE TABLE IF NOT EXISTS browse_cache (
      cache_key TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      cached_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_browse_cache_expires ON browse_cache(expires_at);

    CREATE TABLE IF NOT EXISTS image_cache (
      cache_key TEXT PRIMARY KEY,
      app_id INTEGER,
      image_type TEXT,
      cdn_url TEXT NOT NULL,
      local_path TEXT,
      content_type TEXT DEFAULT 'image/jpeg',
      file_size INTEGER DEFAULT 0,
      cached_at INTEGER NOT NULL,
      last_accessed INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_image_cache_app ON image_cache(app_id);
  `);

  // Seed default settings if missing
  const defaultSettings: Record<string, string> = {
    qbittorrent_url: config.qbittorrent.url,
    qbittorrent_user: config.qbittorrent.username,
    qbittorrent_pass: config.qbittorrent.password,
    steamgriddb_api_key: config.steamGridDbApiKey,
    steam_userdata_path: config.steamUserDataPath,
    host_root: config.hostRoot,
    cache_max_size_mb: '500',
    cache_max_age_days: '14',
    cache_auto_clean: 'true',
    rutracker_url: 'https://rutracker.org',
    rutracker_cookie: '',
    rutracker_login: '',
    rutracker_password: '',
    rutracker_download_mode: 'magnet',
  };

  const insertSettingStmt = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);

  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSettingStmt.run(key, value);
  }

  // Ensure all existing users have a valid created_at timestamp
  try {
    db.exec(`
      UPDATE users 
      SET created_at = datetime('now') 
      WHERE created_at IS NULL OR created_at = '' OR created_at = '—';
    `);
  } catch {}

  // Check if system has been initialized with an administrator
  if (isSystemInitialized()) {
    console.log('[DB] System is initialized. Administrator account exists.');
  } else {
    console.log('[DB] System is ready for first-run setup. Awaiting administrator creation via /api/auth/setup.');
  }
}

/**
 * Check whether system has at least one administrator account
 */
export function isSystemInitialized(): boolean {
  try {
    const row = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number } | undefined;
    return !!row && row.count > 0;
  } catch {
    return false;
  }
}

// User queries
export const userQueries = {
  countAdmins: (): number => {
    const row = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number } | undefined;
    return row?.count || 0;
  },
  getByUsername: (username: string): UserRow | undefined => {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
  },
  getById: (id: number): UserRow | undefined => {
    return db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(id) as UserRow | undefined;
  },
  list: (): Omit<UserRow, 'password_hash'>[] => {
    return db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id ASC').all() as Omit<UserRow, 'password_hash'>[];
  },
  create: (username: string, passwordHash: string, role: 'admin' | 'user'): number => {
    const result = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, role);
    return Number(result.lastInsertRowid);
  },
  updatePassword: (id: number, passwordHash: string): boolean => {
    const result = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
    return result.changes > 0;
  },
  updateRole: (id: number, role: 'admin' | 'user'): boolean => {
    const result = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    return result.changes > 0;
  },
  delete: (id: number): boolean => {
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return result.changes > 0;
  },
};

// Wishlist queries
export const wishlistQueries = {
  listByUser: (userId: number): WishlistItemRow[] => {
    return db.prepare('SELECT * FROM wishlist WHERE user_id = ? ORDER BY created_at DESC').all(userId) as WishlistItemRow[];
  },
  add: (userId: number, appId: string, title: string, imgUrl?: string, genres?: string, releaseDate?: string): number => {
    // Avoid duplicate appId for the same user
    const existing = db.prepare('SELECT id FROM wishlist WHERE user_id = ? AND app_id = ?').get(userId, appId) as { id: number } | undefined;
    if (existing) {
      return existing.id;
    }
    const result = db.prepare(`
      INSERT INTO wishlist (user_id, app_id, title, img_url, genres, release_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, appId, title, imgUrl || '', genres || '', releaseDate || '');
    return Number(result.lastInsertRowid);
  },
  remove: (id: number, userId: number): boolean => {
    const result = db.prepare('DELETE FROM wishlist WHERE id = ? AND user_id = ?').run(id, userId);
    return result.changes > 0;
  },
};

// Settings queries
export const settingsQueries = {
  get: (key: string, defaultValue = ''): string => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as SettingRow | undefined;
    return row ? row.value : defaultValue;
  },
  set: (key: string, value: string): void => {
    db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  },
  getUserSetting: (userId: number, key: string, defaultValue = ''): string => {
    const userRow = db.prepare('SELECT value FROM settings WHERE key = ?').get(`user:${userId}:${key}`) as SettingRow | undefined;
    if (userRow && userRow.value.trim().length > 0) {
      return userRow.value;
    }
    return settingsQueries.get(key, defaultValue);
  },
  setUserSetting: (userId: number, key: string, value: string): void => {
    settingsQueries.set(`user:${userId}:${key}`, value);
  },
  getUserSettings: (userId: number): Record<string, string> => {
    const globalSettings = settingsQueries.getAll();
    const prefix = `user:${userId}:`;
    const userRows = db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all(`${prefix}%`) as SettingRow[];
    const result: Record<string, string> = { ...globalSettings };
    for (const row of userRows) {
      const strippedKey = row.key.slice(prefix.length);
      if (row.value.trim().length > 0) {
        result[strippedKey] = row.value;
      }
    }
    return result;
  },
  getAll: (): Record<string, string> => {
    const rows = db.prepare('SELECT key, value FROM settings').all() as SettingRow[];
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  },
};

// Game cache queries (L2 SQLite caching for game metadata, regional prices, and ProtonDB ratings)
export const gameCacheQueries = {
  get: (appId: number): GameCacheRow | undefined => {
    const now = Date.now();
    return db.prepare('SELECT * FROM game_cache WHERE app_id = ? AND expires_at > ?').get(appId, now) as GameCacheRow | undefined;
  },
  set: (
    appId: number,
    name: string,
    headerImage: string | null,
    capsuleImage: string | null,
    heroImage: string | null,
    detailsJson: string | null,
    ttlMs: number = 7 * 24 * 60 * 60 * 1000 // 7 days default
  ): void => {
    const now = Date.now();
    const expiresAt = now + ttlMs;
    db.prepare(`
      INSERT INTO game_cache (app_id, name, header_image, capsule_image, hero_image, details_json, cached_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(app_id) DO UPDATE SET
        name = CASE WHEN excluded.name != '' THEN excluded.name ELSE game_cache.name END,
        header_image = COALESCE(excluded.header_image, game_cache.header_image),
        capsule_image = COALESCE(excluded.capsule_image, game_cache.capsule_image),
        hero_image = COALESCE(excluded.hero_image, game_cache.hero_image),
        details_json = COALESCE(excluded.details_json, game_cache.details_json),
        cached_at = excluded.cached_at,
        expires_at = excluded.expires_at
    `).run(appId, name, headerImage, capsuleImage, heroImage, detailsJson, now, expiresAt);
  },
  upsertImages: (
    appId: number,
    name: string,
    headerImage: string | null,
    capsuleImage: string | null,
    heroImage: string | null
  ): void => {
    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days
    db.prepare(`
      INSERT INTO game_cache (app_id, name, header_image, capsule_image, hero_image, details_json, cached_at, expires_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(app_id) DO UPDATE SET
        name = CASE WHEN excluded.name != '' THEN excluded.name ELSE game_cache.name END,
        header_image = COALESCE(excluded.header_image, game_cache.header_image),
        capsule_image = COALESCE(excluded.capsule_image, game_cache.capsule_image),
        hero_image = COALESCE(excluded.hero_image, game_cache.hero_image)
    `).run(appId, name, headerImage, capsuleImage, heroImage, now, expiresAt);
  },
  getBrowse: (cacheKey: string): any | null => {
    const now = Date.now();
    const row = db.prepare('SELECT data_json FROM browse_cache WHERE cache_key = ? AND expires_at > ?').get(cacheKey, now) as { data_json: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.data_json);
    } catch {
      return null;
    }
  },
  setBrowse: (cacheKey: string, data: any, ttlMs: number = 30 * 60 * 1000): void => {
    const now = Date.now();
    const expiresAt = now + ttlMs;
    const jsonStr = JSON.stringify(data);
    db.prepare(`
      INSERT INTO browse_cache (cache_key, data_json, cached_at, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        data_json = excluded.data_json,
        cached_at = excluded.cached_at,
        expires_at = excluded.expires_at
    `).run(cacheKey, jsonStr, now, expiresAt);
  },
  cleanupExpired: (): number => {
    const now = Date.now();
    const r1 = db.prepare('DELETE FROM game_cache WHERE expires_at < ?').run(now);
    const r2 = db.prepare('DELETE FROM browse_cache WHERE expires_at < ?').run(now);
    return r1.changes + r2.changes;
  },
  clearAll: (): void => {
    db.prepare('DELETE FROM browse_cache').run();
    db.prepare('DELETE FROM game_cache').run();
    db.prepare('DELETE FROM image_cache').run();
    try {
      db.exec('VACUUM');
    } catch {
      // Ignore vacuum error if inside transaction
    }
  },
  getStats: () => {
    const browseRow = db.prepare('SELECT count(*) as c FROM browse_cache').get() as { c: number };
    const gameRow = db.prepare('SELECT count(*) as c FROM game_cache').get() as { c: number };
    const imageRow = db.prepare('SELECT count(*) as c FROM image_cache').get() as { c: number };
    let dbSizeBytes = 0;
    try {
      if (fs.existsSync(config.dbPath)) {
        dbSizeBytes = fs.statSync(config.dbPath).size;
      }
    } catch {
      // Ignore stat error
    }
    return {
      browseCount: browseRow?.c || 0,
      gameCount: gameRow?.c || 0,
      imageCount: imageRow?.c || 0,
      dbSizeBytes,
    };
  },
};

// Image & CDN address cache queries
export const imageCacheQueries = {
  get: (cacheKey: string): ImageCacheRow | undefined => {
    return db.prepare('SELECT * FROM image_cache WHERE cache_key = ?').get(cacheKey) as ImageCacheRow | undefined;
  },
  getByAppAndType: (appId: number, imageType: string): ImageCacheRow | undefined => {
    return db.prepare('SELECT * FROM image_cache WHERE app_id = ? AND image_type = ?').get(appId, imageType) as ImageCacheRow | undefined;
  },
  set: (
    cacheKey: string,
    appId: number | null,
    imageType: string,
    cdnUrl: string,
    localPath: string | null,
    contentType: string,
    fileSize: number
  ): void => {
    const now = Date.now();
    db.prepare(`
      INSERT INTO image_cache (cache_key, app_id, image_type, cdn_url, local_path, content_type, file_size, cached_at, last_accessed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        cdn_url = excluded.cdn_url,
        local_path = COALESCE(excluded.local_path, image_cache.local_path),
        content_type = excluded.content_type,
        file_size = excluded.file_size,
        last_accessed = excluded.last_accessed
    `).run(cacheKey, appId, imageType, cdnUrl, localPath, contentType, fileSize, now, now);
  },
  touch: (cacheKey: string): void => {
    db.prepare('UPDATE image_cache SET last_accessed = ? WHERE cache_key = ?').run(Date.now(), cacheKey);
  },
  deleteByKeys: (keys: string[]): void => {
    if (keys.length === 0) return;
    const placeholders = keys.map(() => '?').join(',');
    db.prepare(`DELETE FROM image_cache WHERE cache_key IN (${placeholders})`).run(...keys);
  },
  clearAll: (): void => {
    db.prepare('DELETE FROM image_cache').run();
  },
  getAll: (): ImageCacheRow[] => {
    return db.prepare('SELECT * FROM image_cache').all() as ImageCacheRow[];
  },
};
