import axios from 'axios';
import FormData from 'form-data';
import crypto from 'crypto';
import { settingsQueries } from '../db/index.js';
import { config } from '../config.js';

export interface RutrackerRelease {
  id: number;
  title: string;
  category: string;
  sizeBytes: number;
  sizeFormatted: string;
  seeds: number;
  leechers: number;
  addedDate: string;
  url: string;
}

export interface RutrackerSearchResult {
  configured: boolean;
  query: string;
  total: number;
  releases: RutrackerRelease[];
  warning?: string;
  error?: string;
}

/**
 * Encodes Unicode/Cyrillic string to Windows-1251 (CP1251) percent-encoded URL string.
 * Required for RuTracker forum tracker.php search queries.
 */
export function encodeWindows1251(str: string): string {
  let encoded = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0x0410 && code <= 0x044f) {
      // Cyrillic А..Я (0x0410..0x042F -> 0xC0..0xDF) and а..я (0x0430..0x044F -> 0xE0..0xFF)
      const byte = code - 0x0410 + 0xc0;
      encoded += '%' + byte.toString(16).toUpperCase();
    } else if (code === 0x0401) {
      // Ё -> 0xA8
      encoded += '%A8';
    } else if (code === 0x0451) {
      // ё -> 0xB8
      encoded += '%B8';
    } else if (
      (code >= 48 && code <= 57) || // 0-9
      (code >= 65 && code <= 90) || // A-Z
      (code >= 97 && code <= 122) || // a-z
      code === 45 || code === 95 || code === 46 || code === 126 // - _ . ~
    ) {
      encoded += str[i];
    } else if (code === 32) {
      encoded += '+';
    } else {
      encoded += encodeURIComponent(str[i]);
    }
  }
  return encoded;
}

/**
 * Decodes HTML entities commonly present in RuTracker release titles.
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/<[^>]+>/g, '') // Strip inline HTML tags like <wbr>, <b>, <s>
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Formats RuTracker base URL
 */
export function getRutrackerBaseUrl(): string {
  const url = settingsQueries.get('rutracker_url', 'https://rutracker.org');
  return url.replace(/\/+$/, '');
}

/**
 * Builds cookie header string from settings.
 * Accepts full cookie string (e.g. bb_session=...; cf_clearance=...),
 * key-value pairs, or a raw cookie value.
 * Supports per-user cookies with fallback to system settings.
 */
export function getRutrackerCookieHeader(userId?: number): string {
  const raw = (
    userId
      ? settingsQueries.getUserSetting(userId, 'rutracker_cookie')
      : settingsQueries.get('rutracker_cookie', '')
  ).trim();
  if (!raw) return '';

  // If user pasted pairs like "bb_session=...; cf_clearance=..." or "bb_data=..."
  if (raw.includes('=')) {
    return raw.includes('bb_ssl=') ? raw : `${raw}; bb_ssl=1`;
  }

  // If user pasted just a raw value without key
  return `bb_session=${raw}; bb_data=${raw}; bb_ssl=1`;
}

const DEFAULT_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Common browser headers to avoid anti-bot blocks.
 * Enforces desktop browser User-Agent so Cloudflare cf_clearance validation passes even when browsing from mobile devices.
 */
export function getBrowserHeaders(extraCookie?: string, customUa?: string, userId?: number) {
  const cookie = extraCookie || getRutrackerCookieHeader(userId);
  let ua =
    customUa ||
    (userId
      ? settingsQueries.getUserSetting(userId, 'rutracker_user_agent')
      : settingsQueries.get('rutracker_user_agent', ''));

  // If saved UA is empty, invalid, or belongs to a mobile device (iPhone/Android),
  // always fallback to desktop Chrome UA so desktop cf_clearance cookies do not fail!
  if (!ua || ua.includes('Mobile') || ua.includes('iPhone') || ua.includes('Android') || ua.includes('node') || ua.includes('axios')) {
    ua = DEFAULT_DESKTOP_UA;
  }

  return {
    'User-Agent': ua,
    'Accept':
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ru,en;q=0.9,en-US;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

/**
 * Clean search query from special symbols (®, ™, edition prefixes) to maximize search hit rate
 */
export function cleanGameTitleForSearch(title: string): string {
  return title
    .replace(/[®™©]/g, '')
    .replace(/[:\-–—]\s*(Digital\s+)?(Deluxe|Collector's|Ultimate|Gold|Game\s+of\s+the\s+Year|GOTY|Enhanced|Definitive|Complete|Standard)?\s*Edition/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if RuTracker integration has credentials or cookies configured.
 */
export function isRutrackerConfigured(userId?: number): boolean {
  const cookie = (
    userId
      ? settingsQueries.getUserSetting(userId, 'rutracker_cookie')
      : settingsQueries.get('rutracker_cookie', '')
  ).trim();
  const login = settingsQueries.get('rutracker_login', '').trim();
  return cookie.length > 0 || login.length > 0;
}

/**
 * Search RuTracker for game releases.
 * Parses topic id, title, category, size, seeds, leechers, and date.
 */
export async function searchRutracker(query: string, userId?: number): Promise<RutrackerSearchResult> {
  const cleanQ = cleanGameTitleForSearch(query);
  if (!cleanQ) {
    return { configured: true, query, total: 0, releases: [] };
  }

  const cookie = getRutrackerCookieHeader(userId);
  if (!cookie) {
    return {
      configured: false,
      query: cleanQ,
      total: 0,
      releases: [],
      error: 'Учетные данные RuTracker не настроены. Перейдите в Настройки и укажите cookie bb_session или cf_clearance.',
    };
  }

  const baseUrl = getRutrackerBaseUrl();
  const encodedQuery = encodeWindows1251(cleanQ);
  const searchUrl = `${baseUrl}/forum/tracker.php?nm=${encodedQuery}`;

  try {
    const response = await axios.get(searchUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: getBrowserHeaders(cookie, undefined, userId),
    });

    const html = new TextDecoder('windows-1251').decode(response.data);

    // Check for Cloudflare challenge response
    if (
      (html.includes('Just a moment...') || html.includes('<title>Just a Moment...</title>')) &&
      !html.includes('viewtopic.php')
    ) {
      return {
        configured: true,
        query: cleanQ,
        total: 0,
        releases: [],
        error: 'Доступ ограничен Cloudflare. Обновите cookie cf_clearance в разделе Настройки.',
      };
    }

    // Check if forum reported not logged in
    if (html.includes('login.php') && !html.includes('viewtopic.php') && !html.includes('tracker.php')) {
      return {
        configured: true,
        query: cleanQ,
        total: 0,
        releases: [],
        error: 'Сессия RuTracker не авторизована. Проверьте правильность cookie bb_session в разделе Настройки.',
      };
    }

    const releases: RutrackerRelease[] = [];

    // Parse tracker table rows: <tr id="trs-tr-XXXXX" ... data-topic_id="XXXXX">...</tr>
    const rowRegex = /<tr[^>]+(?:data-topic_id|id)="?(?:trs-tr-)?(\d+)"?[^>]*>([\s\S]*?)<\/tr>/gi;
    let match: RegExpExecArray | null;

    while ((match = rowRegex.exec(html)) !== null) {
      const topicId = parseInt(match[1], 10);
      if (!topicId || isNaN(topicId)) continue;
      const rowContent = match[2];

      // Extract Forum / Category
      const catMatch = rowContent.match(/<a[^>]+href="tracker\.php\?f=\d+"[^>]*>([^<]+)<\/a>/i);
      const category = catMatch ? decodeHtmlEntities(catMatch[1]) : 'Игры';

      // Extract Release Title
      const titleMatch = rowContent.match(/<a[^>]+href="viewtopic\.php\?t=\d+"[^>]*>([\s\S]*?)<\/a>/i);
      if (!titleMatch) continue;
      const title = decodeHtmlEntities(titleMatch[1]);

      // Extract Size
      const sizeMatch =
        rowContent.match(/tor-size[^>]*data-ts_text="(\d+)"[^>]*>([\s\S]*?)<\/td>/i) ||
        rowContent.match(/data-ts_text="(\d+)"[^>]*>\s*<a[^>]+dl\.php[^>]*>([\s\S]*?)<\/a>/i);
      let sizeBytes = 0;
      let sizeFormatted = '0 MB';
      if (sizeMatch) {
        sizeBytes = parseInt(sizeMatch[1], 10) || 0;
        sizeFormatted = decodeHtmlEntities(sizeMatch[2])
          .replace(/&nbsp;/g, ' ')
          .replace(/[↓\s]+$/, '')
          .trim();
      }

      // Extract Seeds
      const seedMatch = rowContent.match(/class="[^"]*seedmed[^"]*"[^>]*>(?:<b>)?(\d+)(?:<\/b>)?/i);
      const seeds = seedMatch ? parseInt(seedMatch[1], 10) : 0;

      // Extract Leechers
      const leechMatch = rowContent.match(/class="[^"]*leechmed[^"]*"[^>]*>(?:<b>)?(\d+)(?:<\/b>)?/i);
      const leechers = leechMatch ? parseInt(leechMatch[1], 10) : 0;

      // Extract Date
      const dateMatch = rowContent.match(/<td[^>]+class="[^"]*nowrap[^"]*"[^>]*>\s*<p>([^<]+)<\/p>/i);
      const addedDate = dateMatch ? decodeHtmlEntities(dateMatch[1]).trim() : '';

      releases.push({
        id: topicId,
        title,
        category,
        sizeBytes,
        sizeFormatted,
        seeds,
        leechers,
        addedDate,
        url: `${baseUrl}/forum/viewtopic.php?t=${topicId}`,
      });
    }

    // Sort by seeds descending (most active/healthy releases first)
    releases.sort((a, b) => b.seeds - a.seeds);

    return {
      configured: true,
      query: cleanQ,
      total: releases.length,
      releases,
    };
  } catch (err: any) {
    if (err.response?.status === 403) {
      return {
        configured: true,
        query: cleanQ,
        total: 0,
        releases: [],
        error: 'Доступ ограничен Cloudflare (403 Forbidden). Обновите cookie cf_clearance и bb_session в разделе Настройки.',
      };
    }
    return {
      configured: true,
      query: cleanQ,
      total: 0,
      releases: [],
      error: `Ошибка при поиске на RuTracker: ${err.message}`,
    };
  }
}

/**
 * Authenticates with qBittorrent and returns an active session
 */
async function getQBitClient() {
  const qbUrl = settingsQueries.get('qbittorrent_url', config.qbittorrent.url).replace(/\/+$/, '');
  const username = settingsQueries.get('qbittorrent_user', config.qbittorrent.username);
  const password = settingsQueries.get('qbittorrent_pass', config.qbittorrent.password);

  const client = axios.create({
    baseURL: qbUrl,
    timeout: 5000,
  });

  const params = new URLSearchParams();
  params.append('username', username);
  params.append('password', password);

  const loginRes = await axios.post(`${qbUrl}/api/v2/auth/login`, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 5000,
  });

  const setCookie = loginRes.headers['set-cookie'];
  if (setCookie && setCookie.length > 0) {
    client.defaults.headers['Cookie'] = setCookie[0].split(';')[0];
  }
  return { client, qbUrl };
}

/**
 * Extracts BitTorrent InfoHash (BTIH) from a bencoded .torrent file buffer.
 * Traverses bencoded dictionary depth to isolate 4:info slice, then computes SHA-1.
 */
export function extractInfoHashFromTorrent(buffer: Buffer): string | null {
  const needle = Buffer.from('4:info');
  const idx = buffer.indexOf(needle);
  if (idx === -1) return null;

  const infoStart = idx + needle.length;
  let depth = 0;
  let pos = infoStart;

  while (pos < buffer.length) {
    const byte = buffer[pos];
    if (byte === 0x64 /* 'd' */ || byte === 0x6c /* 'l' */) {
      depth++;
      pos++;
    } else if (byte === 0x69 /* 'i' */) {
      const end = buffer.indexOf(0x65 /* 'e' */, pos);
      if (end === -1) break;
      pos = end + 1;
    } else if (byte >= 0x30 && byte <= 0x39 /* '0'-'9' */) {
      const colon = buffer.indexOf(0x3a /* ':' */, pos);
      if (colon === -1) break;
      const len = parseInt(buffer.subarray(pos, colon).toString('ascii'), 10);
      if (isNaN(len) || len < 0) break;
      pos = colon + 1 + len;
    } else if (byte === 0x65 /* 'e' */) {
      depth--;
      pos++;
      if (depth === 0) {
        const infoSlice = buffer.subarray(infoStart, pos);
        return crypto.createHash('sha1').update(infoSlice).digest('hex').toUpperCase();
      }
    } else {
      pos++;
    }
  }
  return null;
}

/**
 * Constructs a fully formed Magnet URI for a given BTIH hash and trackers
 */
export function buildMagnetUri(btih: string, title?: string): string {
  const cleanHash = btih.toUpperCase().trim();
  const trackers = [
    'http://bt.t-ru.org/ann?magnet',
    'http://bt2.t-ru.org/ann?magnet',
    'http://bt3.t-ru.org/ann?magnet',
    'http://bt4.t-ru.org/ann?magnet',
    'http://retracker.local/announce',
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
  ];
  let uri = `magnet:?xt=urn:btih:${cleanHash}`;
  if (title) {
    uri += `&dn=${encodeURIComponent(title.trim())}`;
  }
  for (const tr of trackers) {
    uri += `&tr=${encodeURIComponent(tr)}`;
  }
  return uri;
}

/**
 * Resolves a Magnet link for a given topicId.
 * First tries scraping viewtopic.php; falls back to computing SHA-1 from .torrent buffer.
 */
export async function getRutrackerMagnet(topicId: number, title?: string, userId?: number): Promise<string> {
  const cookie = getRutrackerCookieHeader(userId);
  const baseUrl = getRutrackerBaseUrl();

  // 1. Try scraping from viewtopic.php HTML
  try {
    const topicRes = await axios.get(`${baseUrl}/forum/viewtopic.php?t=${topicId}`, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: getBrowserHeaders(cookie, undefined, userId),
    });

    const html = new TextDecoder('windows-1251').decode(topicRes.data);

    // Look for explicit magnet link
    const magnetMatch = html.match(/(magnet:\?xt=urn:btih:[a-zA-Z0-9%_\-+=&.:;]+)/i);
    if (magnetMatch) {
      let magnet = decodeHtmlEntities(magnetMatch[1])
        .replace(/&amp;?/gi, '&')
        .replace(/[&?]+$/, '');
      if (!magnet.includes('bt.t-ru.org')) {
        magnet += `&tr=${encodeURIComponent('http://bt.t-ru.org/ann?magnet')}`;
      }
      return magnet;
    }

    // Look for 40-character hex hash in page text
    const hashMatch = html.match(/(?:хэш|hash|btih)[^0-9a-fA-F]{0,40}([0-9a-fA-F]{40})/i) ||
                      html.match(/data-topic_hash="([0-9a-fA-F]{40})"/i);
    if (hashMatch) {
      return buildMagnetUri(hashMatch[1], title);
    }
  } catch (err: any) {
    console.warn(`[RuTracker] Scrape viewtopic.php for #${topicId} failed (${err.message}). Trying dl.php...`);
  }

  // 2. Fallback: fetch .torrent binary from dl.php and calculate BTIH SHA-1
  if (!cookie) {
    throw new Error('Для получения ссылки требуются RuTracker cookie в Настройках');
  }

  const dlUrl = `${baseUrl}/forum/dl.php?t=${topicId}`;
  const dlRes = await axios.get(dlUrl, {
    responseType: 'arraybuffer',
    timeout: 10000,
    headers: {
      ...getBrowserHeaders(cookie, undefined, userId),
      Referer: `${baseUrl}/forum/viewtopic.php?t=${topicId}`,
    },
  });

  const buffer = Buffer.from(dlRes.data);
  if (buffer.length < 50 || buffer.toString('utf8', 0, 50).includes('<!DOCTYPE') || buffer.toString('utf8', 0, 50).includes('<html')) {
    throw new Error('RuTracker вернул страницу ошибки вместо данных раздачи. Проверьте актуальность cookie в Настройках.');
  }

  const hash = extractInfoHashFromTorrent(buffer);
  if (!hash) {
    throw new Error('Не удалось рассчитать BTIH хэш из торрента');
  }

  return buildMagnetUri(hash, title);
}

/**
 * Downloads release to qBittorrent either via Magnet link (recommended/default) or .torrent file.
 */
export async function downloadTorrentToQBit(
  topicId: number,
  savePath?: string,
  requestedMode?: 'magnet' | 'torrent' | 'auto',
  userId?: number
): Promise<{ success: boolean; message: string; mode: string; magnet?: string }> {
  const preferredMode = !requestedMode || requestedMode === 'auto'
    ? (userId ? settingsQueries.getUserSetting(userId, 'rutracker_download_mode', 'magnet') : settingsQueries.get('rutracker_download_mode', 'magnet'))
    : requestedMode;

  const { qbUrl, client } = await getQBitClient();

  // Mode A: Magnet link (fast, direct, doesn't consume tracker download limits)
  if (preferredMode === 'magnet') {
    try {
      const magnet = await getRutrackerMagnet(topicId, undefined, userId);
      const params = new URLSearchParams();
      params.append('urls', magnet);
      if (savePath) {
        params.append('savepath', savePath.trim());
      }

      await axios.post(`${qbUrl}/api/v2/torrents/add`, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: client.defaults.headers['Cookie'] as string || '',
        },
      });

      return {
        success: true,
        mode: 'magnet',
        magnet,
        message: `Magnet-ссылка для раздачи #${topicId} успешно передана в qBittorrent!`,
      };
    } catch (magnetErr: any) {
      console.warn(`[RuTracker] Magnet download failed for #${topicId}: ${magnetErr.message}. Falling back to .torrent download...`);
      if (requestedMode === 'magnet') {
        throw magnetErr;
      }
    }
  }

  // Mode B: .torrent file via dl.php
  const cookie = getRutrackerCookieHeader(userId);
  if (!cookie) {
    throw new Error('RuTracker cookie не настроены');
  }

  const baseUrl = getRutrackerBaseUrl();
  const dlUrl = `${baseUrl}/forum/dl.php?t=${topicId}`;

  const dlResponse = await axios.get(dlUrl, {
    responseType: 'arraybuffer',
    timeout: 10000,
    headers: {
      ...getBrowserHeaders(cookie, undefined, userId),
      Referer: `${baseUrl}/forum/viewtopic.php?t=${topicId}`,
    },
  });

  if (!dlResponse.data || dlResponse.data.length < 50) {
    throw new Error('RuTracker вернул пустой или невалидный файл торрента');
  }

  const buffer = Buffer.from(dlResponse.data);

  if (buffer.toString('utf8', 0, 50).includes('<!DOCTYPE') || buffer.toString('utf8', 0, 50).includes('<html')) {
    throw new Error('RuTracker вернул страницу ошибки вместо файла торрента. Возможно, требуется обновить сессию.');
  }

  const form = new FormData();
  form.append('torrents', buffer, {
    filename: `[rutracker.org].t${topicId}.torrent`,
    contentType: 'application/x-bittorrent',
  });
  if (savePath) {
    form.append('savepath', savePath.trim());
  }

  await axios.post(`${qbUrl}/api/v2/torrents/add`, form, {
    headers: {
      ...form.getHeaders(),
      Cookie: client.defaults.headers['Cookie'] as string || '',
    },
  });

  return {
    success: true,
    mode: 'torrent',
    message: `Торрент-файл #${topicId} успешно скачан и отправлен в qBittorrent!`,
  };
}

/**
 * Tests RuTracker connection and credentials
 */
export async function testRutrackerConnection(customUa?: string, userId?: number): Promise<{ success: boolean; message: string; username?: string }> {
  const cookie = getRutrackerCookieHeader(userId);
  const login = settingsQueries.get('rutracker_login', '').trim();
  const baseUrl = getRutrackerBaseUrl();

  if (!cookie && !login) {
    return {
      success: false,
      message: 'Укажите cookie в настройках.',
    };
  }

  try {
    const res = await axios.get(`${baseUrl}/forum/index.php`, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: getBrowserHeaders(cookie, customUa, userId),
    });

    const html = new TextDecoder('windows-1251').decode(res.data);

    // 1. First check if user is logged in (RuTracker renders profile link on authenticated pages)
    const userMatch =
      html.match(/id="logged-in-username"[^>]*>([^<]+)/i) ||
      html.match(/profile\.php\?mode=viewprofile[^>]*>(?:<b>)?([^<]+)(?:<\/b>)?<\/a>/i);

    if (userMatch) {
      const username = decodeHtmlEntities(userMatch[1]).trim();
      return {
        success: true,
        username,
        message: `Успешное подключение к RuTracker! Авторизован как: ${username}`,
      };
    }

    if (html.includes('login.php?logout=1') || html.includes('mode=viewprofile')) {
      return {
        success: true,
        message: 'Подключение к RuTracker успешно! Активная сессия подтверждена.',
      };
    }

    // 2. Check for Cloudflare challenge
    if (html.includes('Just a moment...') || html.includes('<title>Just a Moment...</title>')) {
      return {
        success: false,
        message: 'Cloudflare отклонил запрос. Проверьте актуальность cf_clearance и User-Agent.',
      };
    }

    return {
      success: false,
      message: 'RuTracker ответил, но сессия не активна. Проверьте правильность bb_session.',
    };
  } catch (err: any) {
    if (err.response?.status === 403) {
      return {
        success: false,
        message: 'Cloudflare отклонил запрос (403 Forbidden). Обновите cf_clearance и User-Agent в настройках.',
      };
    }
    return {
      success: false,
      message: `Ошибка подключения к ${baseUrl}: ${err.message}`,
    };
  }
}
