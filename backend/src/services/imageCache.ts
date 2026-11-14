import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { config } from '../config.js';
import { imageCacheQueries, gameCacheQueries, settingsQueries } from '../db/index.js';

// Ensure the local images cache directory exists
const imagesDir = path.join(config.dataDir, 'cache', 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

export type ImageType = 'header' | 'capsule' | 'hero';

export interface ImageResult {
  stream: fs.ReadStream;
  contentType: string;
  hit: boolean;
  contentLength?: number;
}

/**
 * Returns prioritized CDN URLs for a given Steam App ID and image type.
 * Tries Fastly, Akamai, and Cloudflare CDNs.
 */
export function getSteamCdnUrls(appId: number, type: ImageType): string[] {
  switch (type) {
    case 'header':
      return [
        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
        `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
        `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
      ];
    case 'capsule':
      return [
        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_616x353.jpg`,
        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_231x87.jpg`,
        `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_616x353.jpg`,
      ];
    case 'hero':
      return [
        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`,
        `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`,
        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
      ];
    default:
      return [
        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
      ];
  }
}

/**
 * Retrieves an image for a Steam game from local SSD/NVMe cache, or fetches from Steam CDN
 * and caches locally for subsequent zero-latency access.
 */
export async function getOrCacheGameImage(appId: number, type: ImageType = 'header'): Promise<ImageResult | null> {
  const cacheKey = `${appId}_${type}`;
  const fileName = `${cacheKey}.jpg`;
  const filePath = path.join(imagesDir, fileName);

  // 1. Check local disk cache
  if (fs.existsSync(filePath)) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > 0) {
        imageCacheQueries.touch(cacheKey);
        return {
          stream: fs.createReadStream(filePath),
          contentType: 'image/jpeg',
          hit: true,
          contentLength: stat.size,
        };
      }
    } catch {
      // Continue to re-fetch if file reading failed
    }
  }

  // 2. Fetch from Steam CDN candidates
  const cdnCandidates = getSteamCdnUrls(appId, type);

  for (const cdnUrl of cdnCandidates) {
    try {
      const response = await axios.get(cdnUrl, {
        responseType: 'arraybuffer',
        timeout: 6000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });

      if (response.status === 200 && response.data && response.data.length > 0) {
        const buffer = Buffer.from(response.data);
        const contentType = (response.headers['content-type'] as string) || 'image/jpeg';

        // Write to local disk cache atomically
        const tempPath = `${filePath}.tmp.${Date.now()}`;
        fs.writeFileSync(tempPath, buffer);
        fs.renameSync(tempPath, filePath);

        // Record in SQLite metadata cache
        imageCacheQueries.set(
          cacheKey,
          appId,
          type,
          cdnUrl,
          filePath,
          contentType,
          buffer.length
        );

        // Upsert image address in game_cache table
        const headerUrl = type === 'header' ? cdnUrl : null;
        const capsuleUrl = type === 'capsule' ? cdnUrl : null;
        const heroUrl = type === 'hero' ? cdnUrl : null;
        gameCacheQueries.upsertImages(appId, '', headerUrl, capsuleUrl, heroUrl);

        return {
          stream: fs.createReadStream(filePath),
          contentType,
          hit: false,
          contentLength: buffer.length,
        };
      }
    } catch {
      // Try next CDN candidate
      continue;
    }
  }

  return null;
}

/**
 * Validates and proxies external CDN image URLs with local on-disk caching.
 * Prevents SSRF by strictly requiring http/https and banning internal network targets.
 */
export async function getOrCacheProxyImage(rawUrl: string): Promise<ImageResult | null> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  // Security check: Only allow HTTP/HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  // Prevent SSRF: Disallow localhost, private IPs, loopbacks
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.startsWith('172.16.') ||
    host.endsWith('.local')
  ) {
    return null;
  }

  const hash = crypto.createHash('md5').update(rawUrl).digest('hex');
  const fileName = `proxy_${hash}.jpg`;
  const filePath = path.join(imagesDir, fileName);

  // 1. Check local disk cache
  if (fs.existsSync(filePath)) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > 0) {
        imageCacheQueries.touch(hash);
        return {
          stream: fs.createReadStream(filePath),
          contentType: 'image/jpeg',
          hit: true,
          contentLength: stat.size,
        };
      }
    } catch {
      // Continue to re-fetch
    }
  }

  // 2. Fetch from remote CDN
  try {
    const response = await axios.get(rawUrl, {
      responseType: 'arraybuffer',
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    if (response.status === 200 && response.data && response.data.length > 0) {
      const buffer = Buffer.from(response.data);
      const contentType = (response.headers['content-type'] as string) || 'image/jpeg';

      const tempPath = `${filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, buffer);
      fs.renameSync(tempPath, filePath);

      imageCacheQueries.set(
        hash,
        null,
        'proxy',
        rawUrl,
        filePath,
        contentType,
        buffer.length
      );

      return {
        stream: fs.createReadStream(filePath),
        contentType,
        hit: false,
        contentLength: buffer.length,
      };
    }
  } catch (err: any) {
    console.error(`[ImageCache] Failed to proxy image from ${rawUrl}:`, err.message);
  }

  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export interface CacheStats {
  imageCount: number;
  imageSizeBytes: number;
  imageSizeFormatted: string;
  dbSizeBytes: number;
  dbSizeFormatted: string;
  maxSizeMb: number;
  maxAgeDays: number;
  autoClean: boolean;
  browseEntries: number;
  gameEntries: number;
}

export function getFullCacheStats(): CacheStats {
  let imageCount = 0;
  let imageSizeBytes = 0;

  try {
    if (fs.existsSync(imagesDir)) {
      const files = fs.readdirSync(imagesDir);
      for (const f of files) {
        try {
          const filePath = path.join(imagesDir, f);
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            imageCount++;
            imageSizeBytes += stat.size;
          }
        } catch {
          // Ignore unreadable files
        }
      }
    }
  } catch {
    // Ignore directory read error
  }

  const dbStats = gameCacheQueries.getStats();
  const maxSizeMb = parseInt(settingsQueries.get('cache_max_size_mb', '500'), 10) || 500;
  const maxAgeDays = parseInt(settingsQueries.get('cache_max_age_days', '14'), 10) || 14;
  const autoClean = settingsQueries.get('cache_auto_clean', 'true') === 'true';

  return {
    imageCount,
    imageSizeBytes,
    imageSizeFormatted: formatBytes(imageSizeBytes),
    dbSizeBytes: dbStats.dbSizeBytes,
    dbSizeFormatted: formatBytes(dbStats.dbSizeBytes),
    maxSizeMb,
    maxAgeDays,
    autoClean,
    browseEntries: dbStats.browseCount,
    gameEntries: dbStats.gameCount,
  };
}

export interface CleanResult {
  deletedFiles: number;
  freedBytes: number;
  freedFormatted: string;
}

/**
 * Intelligent LRU & TTL cache cleaning.
 * - Enforces maximum disk quota (e.g. 500 MB).
 * - Enforces maximum age (e.g. 14 days without access).
 * - Prunes oldest access files down to 70% of quota when exceeded.
 */
export function cleanImageCache(options?: {
  forceAll?: boolean;
  targetSizeMb?: number;
  maxAgeDays?: number;
}): CleanResult {
  if (!fs.existsSync(imagesDir)) {
    return { deletedFiles: 0, freedBytes: 0, freedFormatted: '0 B' };
  }

  let deletedFiles = 0;
  let freedBytes = 0;

  if (options?.forceAll) {
    try {
      const files = fs.readdirSync(imagesDir);
      for (const f of files) {
        try {
          const p = path.join(imagesDir, f);
          const stat = fs.statSync(p);
          fs.unlinkSync(p);
          deletedFiles++;
          freedBytes += stat.size;
        } catch {
          // Ignore unlink error
        }
      }
      imageCacheQueries.clearAll();
    } catch {
      // Ignore directory scan error
    }
    return {
      deletedFiles,
      freedBytes,
      freedFormatted: formatBytes(freedBytes),
    };
  }

  const maxSizeMb = options?.targetSizeMb ?? (parseInt(settingsQueries.get('cache_max_size_mb', '500'), 10) || 500);
  const maxAgeDays = options?.maxAgeDays ?? (parseInt(settingsQueries.get('cache_max_age_days', '14'), 10) || 14);
  const maxSizeBytes = maxSizeMb * 1024 * 1024;
  const targetThresholdBytes = Math.floor(maxSizeBytes * 0.7); // Prune to 70% to avoid thrashing
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  try {
    const rawFiles = fs.readdirSync(imagesDir);
    const dbRecords = imageCacheQueries.getAll();
    const dbMap = new Map<string, { last_accessed: number; cache_key: string }>();
    for (const r of dbRecords) {
      if (r.local_path) {
        const base = path.basename(r.local_path);
        dbMap.set(base, { last_accessed: r.last_accessed, cache_key: r.cache_key });
      }
    }

    interface FileMeta {
      name: string;
      fullPath: string;
      size: number;
      lastAccessed: number;
      cacheKey?: string;
    }

    const fileList: FileMeta[] = [];
    let totalSize = 0;

    for (const f of rawFiles) {
      try {
        const fullPath = path.join(imagesDir, f);
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;

        const dbInfo = dbMap.get(f);
        const lastAccessed = dbInfo ? dbInfo.last_accessed : stat.mtimeMs;

        fileList.push({
          name: f,
          fullPath,
          size: stat.size,
          lastAccessed,
          cacheKey: dbInfo?.cache_key,
        });
        totalSize += stat.size;
      } catch {
        // Ignore stat error
      }
    }

    const deletedKeys: string[] = [];

    // Stage 1: Evict files older than maxAgeDays
    const remainingFiles: FileMeta[] = [];
    for (const f of fileList) {
      if (now - f.lastAccessed > maxAgeMs) {
        try {
          fs.unlinkSync(f.fullPath);
          deletedFiles++;
          freedBytes += f.size;
          totalSize -= f.size;
          if (f.cacheKey) deletedKeys.push(f.cacheKey);
        } catch {
          remainingFiles.push(f);
        }
      } else {
        remainingFiles.push(f);
      }
    }

    // Stage 2: LRU size pruning if totalSize exceeds maxSizeBytes
    if (totalSize > maxSizeBytes) {
      // Sort oldest accessed first
      remainingFiles.sort((a, b) => a.lastAccessed - b.lastAccessed);

      for (const f of remainingFiles) {
        if (totalSize <= targetThresholdBytes) break;

        try {
          fs.unlinkSync(f.fullPath);
          deletedFiles++;
          freedBytes += f.size;
          totalSize -= f.size;
          if (f.cacheKey) deletedKeys.push(f.cacheKey);
        } catch {
          // Ignore unlink error
        }
      }
    }

    // Sync database
    if (deletedKeys.length > 0) {
      imageCacheQueries.deleteByKeys(deletedKeys);
    }
  } catch (err: any) {
    console.error('[ImageCache] Error during cache cleanup:', err.message);
  }

  return {
    deletedFiles,
    freedBytes,
    freedFormatted: formatBytes(freedBytes),
  };
}

/**
 * Clears all caches: images on disk + SQLite caches + vacuum
 */
export function cleanEntireCache(): CleanResult {
  const imgResult = cleanImageCache({ forceAll: true });
  gameCacheQueries.clearAll();
  return imgResult;
}

/**
 * Background auto-cleaning routine running every 30 minutes.
 */
let cleanerTimer: NodeJS.Timeout | null = null;
export function startBackgroundCacheCleaner(intervalMs = 30 * 60 * 1000): void {
  if (cleanerTimer) return;

  const runCleanup = () => {
    const autoClean = settingsQueries.get('cache_auto_clean', 'true') === 'true';
    if (!autoClean) return;

    try {
      const expiredDb = gameCacheQueries.cleanupExpired();
      const imgRes = cleanImageCache();
      if (imgRes.deletedFiles > 0 || expiredDb > 0) {
        console.log(`[CacheCleaner] Auto-cleaned: ${imgRes.deletedFiles} images freed (${imgRes.freedFormatted}), ${expiredDb} expired DB entries removed.`);
      }
    } catch (err: any) {
      console.error('[CacheCleaner] Auto-clean error:', err.message);
    }
  };

  // Run initial pass after 1 minute of boot
  setTimeout(runCleanup, 60 * 1000).unref();

  cleanerTimer = setInterval(runCleanup, intervalMs);
  cleanerTimer.unref();
}
