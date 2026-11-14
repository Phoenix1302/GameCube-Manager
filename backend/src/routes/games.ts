import { FastifyInstance } from 'fastify';
import axios from 'axios';
import { gameCacheQueries } from '../db/index.js';
import { ImageType } from '../services/imageCache.js';

interface L1CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// In-Memory L1 Cache for sub-millisecond hot lookups
const l1BrowseCache = new Map<string, L1CacheEntry<any>>();
const l1DetailsCache = new Map<number, L1CacheEntry<any>>();
const l1SimpleCache = new Map<string, L1CacheEntry<any>>();

// Periodically clean up expired L1 entries and SQLite expired rows
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of l1BrowseCache.entries()) {
    if (v.expiresAt < now) l1BrowseCache.delete(k);
  }
  for (const [k, v] of l1DetailsCache.entries()) {
    if (v.expiresAt < now) l1DetailsCache.delete(k);
  }
  for (const [k, v] of l1SimpleCache.entries()) {
    if (v.expiresAt < now) l1SimpleCache.delete(k);
  }
  try {
    gameCacheQueries.cleanupExpired();
  } catch {
    // Ignore cleanup errors during startup
  }
}, 5 * 60 * 1000).unref();

interface SteamAppDetailsResponse {
  [appId: string]: {
    success: boolean;
    data?: {
      name: string;
      steam_appid: number;
      required_age: number;
      is_free: boolean;
      short_description: string;
      header_image: string;
      website: string;
      developers: string[];
      publishers: string[];
      price_overview?: {
        currency: string;
        initial: number;
        final: number;
        discount_percent: number;
        initial_formatted: string;
        final_formatted: string;
      };
      platforms: {
        windows: boolean;
        mac: boolean;
        linux: boolean;
      };
      genres?: Array<{ id: string; description: string }>;
      screenshots?: Array<{ id: number; path_thumbnail: string; path_full: string }>;
      release_date?: {
        coming_soon: boolean;
        date: string;
      };
    };
  };
}

// Blacklist for adult/hentai/erotic titles and hardware/accessory junk pages
const JUNK_AND_ADULT_KEYWORDS = [
  'hentai', 'porn', 'erotic', 'eroge', 'waifu', 'sex', 'sexy', 'naked', 'nudity', 'nsfw', 'adult only', 'uncensored',
  'хентай', 'порно', 'секс', 'эротик', 'интим', 'обнажен', '18+',
  'steam deck', 'steam frame', 'valve index', 'controller', 'docking station', 'face cushion', 'carrying case',
  'soundtrack', 'original soundtrack', 'ost',
];

export function getDirectSteamHeaderUrl(appId: number, rawImg?: string | null): string {
  if (rawImg && rawImg.startsWith('http')) {
    // If rawImg is a low-res capsule_sm_120.jpg or capsule_231x87.jpg, upgrade to full header.jpg
    if (rawImg.includes('capsule_sm_120.jpg') || rawImg.includes('capsule_231x87.jpg')) {
      return rawImg.replace(/capsule_sm_120\.jpg|capsule_231x87\.jpg/, 'header.jpg');
    }
    // Avoid vertical portrait artwork (library_600x900)
    if (!rawImg.includes('library_600x900') && !rawImg.includes('portrait')) {
      return rawImg;
    }
  }
  return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
}

function isCleanGame(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  for (const kw of JUNK_AND_ADULT_KEYWORDS) {
    if (lower.includes(kw)) return false;
  }
  return true;
}

export async function gamesRoutes(fastify: FastifyInstance) {
  // Browse games with pagination and category filtering
  fastify.get('/browse', async (request, reply) => {
    const {
      category = 'all',
      page = 1,
      limit = 24,
      q = '',
      genre = '',
      playerMode = '',
      os = '',
      sort = '',
    } = request.query as {
      category?: string;
      page?: number | string;
      limit?: number | string;
      q?: string;
      genre?: string;
      playerMode?: string;
      os?: string;
      sort?: string;
    };

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const countNum = Math.min(100, Math.max(6, parseInt(String(limit), 10) || 24));
    const startNum = (pageNum - 1) * countNum;
    const cleanQ = (q || '').trim();

    const cacheKey = `browse:${category}:${pageNum}:${countNum}:${cleanQ}:${genre}:${playerMode}:${os}:${sort}`;

    // 1. Check L1 Memory Cache
    const l1Hit = l1BrowseCache.get(cacheKey);
    if (l1Hit && l1Hit.expiresAt > Date.now()) {
      reply.header('X-Cache', 'HIT-L1');
      reply.header('Cache-Control', 'public, max-age=300');
      return l1Hit.data;
    }

    // 2. Check L2 SQLite Cache
    const l2Hit = gameCacheQueries.getBrowse(cacheKey);
    if (l2Hit) {
      l1BrowseCache.set(cacheKey, { data: l2Hit, expiresAt: Date.now() + 5 * 60 * 1000 });
      reply.header('X-Cache', 'HIT-SQLITE');
      reply.header('Cache-Control', 'public, max-age=300');
      return l2Hit;
    }

    try {
      const params: Record<string, any> = {
        query: cleanQ,
        start: startNum,
        count: countNum + 15, // Fetch extra buffer for client-side filtering
        page: pageNum,
        dynamic_data: '',
        snr: '1_7_7_7',
        infinite: 1,
        l: 'russian',
        cc: 'KZ',
        category1: '998', // ONLY Games (excludes hardware, accessories, soundtracks, software)
        untags: '12095,9130,5611,6650,24904', // Exclude Hentai, Sexual Content, Nudity, NSFW, Adult Only
      };

      if (category === 'topSellers') {
        params.filter = 'topsellers';
      } else if (category === 'newReleases') {
        params.sort_by = 'Released_DESC';
      } else if (category === 'specials') {
        params.specials = 1;
      } else if (category === 'featured') {
        params.filter = 'popularnew';
      }

      if (sort) {
        params.sort_by = sort;
      }
      if (genre) {
        params.tags = genre;
      }
      if (playerMode) {
        params.category2 = playerMode;
      }
      if (os) {
        params.os = os;
      }

      const res = await axios.get('https://store.steampowered.com/search/results/', {
        params,
        timeout: 9000,
        headers: {
          'Accept-Language': 'ru,en',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const html = res.data.results_html || '';
      const totalCount = res.data.total_count || 0;

      // Extract items from HTML with robust block-by-block parsing
      const items: any[] = [];
      const blocks = html.split('</a>');

      for (const b of blocks) {
        if (items.length >= countNum) break;

        const idMatch = b.match(/\/app\/(\d+)/);
        const titleMatch = b.match(/class="title">([^<]+)<\/span>/);
        if (!idMatch || !titleMatch) continue;

        const id = parseInt(idMatch[1], 10);
        const name = titleMatch[1].trim();

        // Skip adult or junk hardware/accessory items
        if (!isCleanGame(name)) {
          continue;
        }

        const imgMatch = b.match(/<img[^>]+src="([^"]+)"/);
        const rawImg = imgMatch ? imgMatch[1].trim() : '';
        const headerImage = getDirectSteamHeaderUrl(id, rawImg);

        const priceMatch = b.match(/class="[^"]*discount_final_price[^"]*"[^>]*>([^<]+)<\/div>/);
        const origMatch = b.match(/class="[^"]*discount_original_price[^"]*"[^>]*>([^<]+)<\/div>/);
        const discountMatch = b.match(/data-discount="(\d+)"/);
        const releaseMatch = b.match(/class="search_released[^"]*"[^>]*>([^<]+)<\/div>/);
        const isFree = b.includes('free_tag') || b.includes('Free to Play') || b.includes('Бесплатно') || b.includes('discount_final_price free');

        let priceText = '';
        if (priceMatch) {
          priceText = priceMatch[1].trim();
        } else if (isFree) {
          priceText = 'Бесплатно';
        } else {
          priceText = 'В магазине Steam';
        }

        const discountPercent = discountMatch ? parseInt(discountMatch[1], 10) : 0;
        const releaseDate = releaseMatch ? releaseMatch[1].trim() : '';

        if (id && headerImage) {
          gameCacheQueries.upsertImages(id, name, headerImage, null, null);
        }

        items.push({
          id,
          name,
          releaseDate,
          discountPercent,
          priceText,
          originalPrice: origMatch ? origMatch[1].trim() : '',
          headerImage,
          isFree: isFree || priceText.toLowerCase().includes('бесплатно'),
        });
      }

      // Fallback for page 1 if search results were empty
      if (items.length === 0 && pageNum === 1 && !q) {
        const featuredRes = await axios.get('https://store.steampowered.com/api/featuredcategories/?l=russian&cc=KZ', {
          timeout: 6000,
        });
        const catKey = category === 'newReleases' ? 'new_releases' : (category === 'specials' ? 'specials' : 'top_sellers');
        const fallbackList = featuredRes.data[catKey]?.items || [];
        for (const it of fallbackList) {
          if (items.length >= countNum) break;
          if (!isCleanGame(it.name)) continue;

          const itHeader = getDirectSteamHeaderUrl(it.id, it.header_image || it.large_capsule_image);
          items.push({
            id: it.id,
            name: it.name,
            discountPercent: it.discount_percent || 0,
            priceText: it.final_price ? `${it.final_price / 100} KZT` : (it.is_free ? 'Бесплатно' : 'В магазине Steam'),
            headerImage: itHeader,
            isFree: Boolean(it.is_free),
          });
        }
      }

      const result = {
        items,
        page: pageNum,
        limit: countNum,
        total: totalCount || (pageNum * countNum + items.length),
        hasMore: items.length >= countNum || (totalCount > pageNum * countNum),
      };

      // Store in L2 SQLite (30 min) and L1 RAM (5 min)
      gameCacheQueries.setBrowse(cacheKey, result, 30 * 60 * 1000);
      l1BrowseCache.set(cacheKey, { data: result, expiresAt: Date.now() + 5 * 60 * 1000 });

      // Upsert discovered game CDN image addresses in game_cache table
      for (const it of items) {
        if (it.id && it.headerImage) {
          gameCacheQueries.upsertImages(it.id, it.name || '', it.headerImage, null, null);
        }
      }

      reply.header('X-Cache', 'MISS');
      reply.header('Cache-Control', 'public, max-age=300');
      return result;
    } catch (err: any) {
      console.error('[Browse] Error fetching from Steam:', err.message);
      return {
        items: [],
        page: pageNum,
        limit: countNum,
        total: 0,
        hasMore: false,
        error: 'Failed to browse Steam store',
      };
    }
  });

  // Featured, Top Sellers, New Releases, Specials
  fastify.get('/featured', async (_request, reply) => {
    const cacheKey = 'featured:home';
    const l1Hit = l1SimpleCache.get(cacheKey);
    if (l1Hit && l1Hit.expiresAt > Date.now()) {
      reply.header('X-Cache', 'HIT-L1');
      reply.header('Cache-Control', 'public, max-age=600');
      return l1Hit.data;
    }

    const l2Hit = gameCacheQueries.getBrowse(cacheKey);
    if (l2Hit) {
      l1SimpleCache.set(cacheKey, { data: l2Hit, expiresAt: Date.now() + 10 * 60 * 1000 });
      reply.header('X-Cache', 'HIT-SQLITE');
      reply.header('Cache-Control', 'public, max-age=600');
      return l2Hit;
    }

    try {
      const [featRes, catRes] = await Promise.allSettled([
        axios.get('https://store.steampowered.com/api/featured/', {
          timeout: 8000,
          headers: { 'Accept-Language': 'ru,en' },
        }),
        axios.get('https://store.steampowered.com/api/featuredcategories/?l=russian&cc=KZ', {
          timeout: 8000,
          headers: { 'Accept-Language': 'ru,en' },
        }),
      ]);

      const featData: any = featRes.status === 'fulfilled' ? featRes.value.data : {};
      const catData: any = catRes.status === 'fulfilled' ? catRes.value.data : {};

      const formatItem = (item: any) => ({
        id: item.id,
        name: item.name,
        headerImage: getDirectSteamHeaderUrl(item.id, item.header_image || item.large_capsule_image || item.small_capsule_image),
        discountPercent: item.discount_percent || 0,
        originalPrice: item.original_price ? item.original_price / 100 : null,
        finalPrice: item.final_price ? item.final_price / 100 : (item.is_free ? 0 : null),
        currency: item.currency || 'KZT',
        windows: item.windows_available ?? true,
        mac: item.mac_available ?? false,
        linux: item.linux_available ?? false,
      });

      const topSellers = (catData.top_sellers?.items || []).map(formatItem);
      const newReleases = (catData.new_releases?.items || []).map(formatItem);
      const specials = (catData.specials?.items || []).map(formatItem);
      const featured = (featData.featured_win || featData.large_capsules || []).map(formatItem);

      const result = {
        topSellers: topSellers.length > 0 ? topSellers : featured,
        newReleases,
        specials,
        featured,
      };

      // Cache for 1 hour in SQLite, 10 min in L1
      gameCacheQueries.setBrowse(cacheKey, result, 60 * 60 * 1000);
      l1SimpleCache.set(cacheKey, { data: result, expiresAt: Date.now() + 10 * 60 * 1000 });

      // Upsert discovered images in game_cache
      const allFeatured = [...result.topSellers, ...result.newReleases, ...result.specials, ...result.featured];
      for (const it of allFeatured) {
        if (it.id && it.headerImage) {
          gameCacheQueries.upsertImages(it.id, it.name || '', it.headerImage, null, null);
        }
      }

      reply.header('X-Cache', 'MISS');
      reply.header('Cache-Control', 'public, max-age=600');
      return result;
    } catch (err: any) {
      return {
        featured: [],
        topSellers: [],
        newReleases: [],
        specials: [],
        error: 'Failed to fetch featured games from Steam API',
      };
    }
  });

  // Search games
  fastify.get('/search', async (request, reply) => {
    const { q } = request.query as { q?: string };
    const cleanQ = (q || '').trim();
    if (!cleanQ) {
      return { items: [] };
    }

    const cacheKey = `search:${cleanQ.toLowerCase()}`;
    const l1Hit = l1SimpleCache.get(cacheKey);
    if (l1Hit && l1Hit.expiresAt > Date.now()) {
      reply.header('X-Cache', 'HIT-L1');
      return l1Hit.data;
    }

    const l2Hit = gameCacheQueries.getBrowse(cacheKey);
    if (l2Hit) {
      l1SimpleCache.set(cacheKey, { data: l2Hit, expiresAt: Date.now() + 10 * 60 * 1000 });
      reply.header('X-Cache', 'HIT-SQLITE');
      return l2Hit;
    }

    try {
      const res = await axios.get('https://store.steampowered.com/api/storesearch/', {
        params: {
          term: cleanQ,
          l: 'russian',
          cc: 'KZ',
        },
        timeout: 8000,
      });

      const items = (res.data.items || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        price: item.price
          ? {
              initial: item.price.initial ? item.price.initial / 100 : 0,
              final: item.price.final ? item.price.final / 100 : 0,
              currency: item.price.currency || 'KZT',
            }
          : null,
        tinyImage: item.tiny_image,
        headerImage: getDirectSteamHeaderUrl(item.id, item.tiny_image),
      }));

      const result = { items };
      gameCacheQueries.setBrowse(cacheKey, result, 2 * 60 * 60 * 1000);
      l1SimpleCache.set(cacheKey, { data: result, expiresAt: Date.now() + 10 * 60 * 1000 });

      for (const it of items) {
        if (it.id && it.headerImage) {
          gameCacheQueries.upsertImages(it.id, it.name || '', it.headerImage, null, null);
        }
      }

      reply.header('X-Cache', 'MISS');
      return result;
    } catch {
      return reply.status(502).send({ error: 'Failed to search Steam Store' });
    }
  });

  // Steam Live Autocomplete / Suggestions (like real Steam Store)
  fastify.get('/suggest', async (request, reply) => {
    const query = request.query as { term?: string; q?: string };
    const term = query.term || query.q;
    const cleanTerm = (term || '').trim();
    if (!cleanTerm) {
      return { suggestions: [] };
    }

    const cacheKey = `suggest:${cleanTerm.toLowerCase()}`;
    const l1Hit = l1SimpleCache.get(cacheKey);
    if (l1Hit && l1Hit.expiresAt > Date.now()) {
      reply.header('X-Cache', 'HIT-L1');
      return l1Hit.data;
    }

    const l2Hit = gameCacheQueries.getBrowse(cacheKey);
    if (l2Hit) {
      l1SimpleCache.set(cacheKey, { data: l2Hit, expiresAt: Date.now() + 15 * 60 * 1000 });
      reply.header('X-Cache', 'HIT-SQLITE');
      return l2Hit;
    }

    try {
      const res = await axios.get('https://store.steampowered.com/search/suggest', {
        params: {
          term: cleanTerm,
          f: 'games',
          cc: 'KZ',
          l: 'russian',
        },
        timeout: 5000,
        headers: {
          'Accept-Language': 'ru,en',
        },
      });

      const html = String(res.data || '');
      const matches = html.match(/<a[^>]+data-ds-appid="(\d+)"[^>]*>[\s\S]*?<div class="match_name">([^<]+)<\/div>[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<div class="match_price">([^<]*)<\/div>/gi) || [];

      const suggestions: Array<{
        id: number;
        name: string;
        img: string;
        price: string;
        isFree: boolean;
      }> = [];

      for (const m of matches) {
        const idMatch = m.match(/data-ds-appid="(\d+)"/i);
        const nameMatch = m.match(/<div class="match_name">([^<]+)<\/div>/i);
        const imgMatch = m.match(/<img[^>]+src="([^"]+)"/i);
        const priceMatch = m.match(/<div class="match_price">([^<]*)<\/div>/i);

        if (!idMatch || !nameMatch) continue;

        const id = parseInt(idMatch[1], 10);
        const name = nameMatch[1].trim();

        if (!isCleanGame(name)) continue;

        const rawPrice = priceMatch ? priceMatch[1].trim() : '';
        const isFree = !rawPrice || rawPrice.toLowerCase().includes('бесплатно') || rawPrice.toLowerCase().includes('free');
        const price = isFree ? 'Бесплатно' : rawPrice;
        const img = imgMatch ? imgMatch[1] : `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/capsule_sm_120.jpg`;

        suggestions.push({
          id,
          name,
          img,
          price,
          isFree,
        });

        if (suggestions.length >= 7) break;
      }

      const result = { suggestions };
      gameCacheQueries.setBrowse(cacheKey, result, 24 * 60 * 60 * 1000);
      l1SimpleCache.set(cacheKey, { data: result, expiresAt: Date.now() + 15 * 60 * 1000 });

      for (const s of suggestions) {
        if (s.id && s.img) {
          gameCacheQueries.upsertImages(s.id, s.name || '', s.img, null, null);
        }
      }

      reply.header('X-Cache', 'MISS');
      return result;
    } catch (err: any) {
      console.error('[Suggest] Steam search suggest error:', err.message);
      return { suggestions: [] };
    }
  });

  // ProtonDB summary for an App ID
  fastify.get('/protondb/:appId', async (request) => {
    const { appId } = request.params as { appId: string };
    try {
      const res = await axios.get(`https://www.protondb.com/api/v1/reports/summaries/${appId}.json`, {
        timeout: 5000,
      });
      return {
        appId,
        tier: res.data.tier || 'unknown',
        confidence: res.data.confidence || 'low',
        score: res.data.score || 0,
        total: res.data.total || 0,
        trendingTier: res.data.trendingTier || res.data.tier,
      };
    } catch {
      return {
        appId,
        tier: 'unknown',
        confidence: 'none',
        score: 0,
        total: 0,
      };
    }
  });

  // Full Details with KZ and RUB prices and ProtonDB status
  fastify.get('/details/:appId', async (request, reply) => {
    const { appId } = request.params as { appId: string };
    const numAppId = parseInt(appId, 10);
    if (isNaN(numAppId)) {
      return reply.status(400).send({ error: 'Invalid app ID' });
    }

    // 1. Check L1 Memory Cache
    const l1Hit = l1DetailsCache.get(numAppId);
    if (l1Hit && l1Hit.expiresAt > Date.now()) {
      reply.header('X-Cache', 'HIT-L1');
      reply.header('Cache-Control', 'public, max-age=86400');
      return l1Hit.data;
    }

    // 2. Check L2 SQLite Cache
    const cachedRow = gameCacheQueries.get(numAppId);
    if (cachedRow && cachedRow.details_json) {
      try {
        const parsed = JSON.parse(cachedRow.details_json);
        l1DetailsCache.set(numAppId, { data: parsed, expiresAt: Date.now() + 30 * 60 * 1000 });
        reply.header('X-Cache', 'HIT-SQLITE');
        reply.header('Cache-Control', 'public, max-age=86400');
        return parsed;
      } catch {
        // Fallback to fresh fetch on parse error
      }
    }

    try {
      // Parallel requests for KZ store, RU store, and ProtonDB
      const [kzRes, ruRes, protonRes] = await Promise.allSettled([
        axios.get<SteamAppDetailsResponse>(`https://store.steampowered.com/api/appdetails`, {
          params: { appids: appId, cc: 'KZ', l: 'russian' },
          timeout: 6000,
        }),
        axios.get<SteamAppDetailsResponse>(`https://store.steampowered.com/api/appdetails`, {
          params: { appids: appId, cc: 'RU', l: 'russian' },
          timeout: 6000,
        }),
        axios.get(`https://www.protondb.com/api/v1/reports/summaries/${appId}.json`, {
          timeout: 5000,
        }),
      ]);

      let dataKZ: any = null;
      if (kzRes.status === 'fulfilled' && kzRes.value.data[appId]?.success) {
        dataKZ = kzRes.value.data[appId].data;
      }

      let dataRU: any = null;
      if (ruRes.status === 'fulfilled' && ruRes.value.data[appId]?.success) {
        dataRU = ruRes.value.data[appId].data;
      }

      const mainData = dataKZ || dataRU;
      if (!mainData) {
        return reply.status(404).send({ error: 'Game details not found on Steam' });
      }

      // ProtonDB details
      let protonDb = {
        tier: 'unknown',
        confidence: 'none',
        score: 0,
        total: 0,
        url: `https://www.protondb.com/app/${mainData.steam_appid}`,
      };
      if (protonRes.status === 'fulfilled' && protonRes.value.data) {
        protonDb = {
          tier: protonRes.value.data.tier || 'unknown',
          confidence: protonRes.value.data.confidence || 'none',
          score: protonRes.value.data.score || 0,
          total: protonRes.value.data.total || 0,
          url: `https://www.protondb.com/app/${mainData.steam_appid}`,
        };
      }

      // Fix pricing logic for Free vs Paid and Regional availability
      const isFreeGame = Boolean(mainData.is_free);

      // KZ Region pricing
      let kzPriceInfo: any;
      if (isFreeGame) {
        kzPriceInfo = {
          available: dataKZ !== null,
          isFree: true,
          currency: 'KZT',
          formatted: 'Бесплатно',
          statusText: dataKZ !== null ? 'Бесплатная игра (Free to Play)' : 'Недоступно в регионе',
        };
      } else if (dataKZ?.price_overview) {
        kzPriceInfo = {
          available: true,
          isFree: false,
          currency: 'KZT',
          symbol: '₸',
          initial: dataKZ.price_overview.initial / 100,
          final: dataKZ.price_overview.final / 100,
          discountPercent: dataKZ.price_overview.discount_percent,
          formatted: dataKZ.price_overview.final_formatted,
          statusText: 'Официальный магазин Steam (KZ)',
        };
      } else {
        kzPriceInfo = {
          available: false,
          isFree: false,
          currency: 'KZT',
          formatted: 'Недоступно',
          statusText: 'Недоступно в данном регионе',
        };
      }

      // RU Region pricing
      let ruPriceInfo: any;
      if (isFreeGame) {
        ruPriceInfo = {
          available: dataRU !== null,
          isFree: true,
          currency: 'RUB',
          formatted: 'Бесплатно',
          statusText: dataRU !== null ? 'Бесплатная игра (Free to Play)' : 'Ограничено издателем в РФ',
        };
      } else if (dataRU?.price_overview) {
        ruPriceInfo = {
          available: true,
          isFree: false,
          currency: 'RUB',
          symbol: '₽',
          initial: dataRU.price_overview.initial / 100,
          final: dataRU.price_overview.final / 100,
          discountPercent: dataRU.price_overview.discount_percent,
          formatted: dataRU.price_overview.final_formatted,
          statusText: 'Официальный магазин Steam (RU)',
        };
      } else {
        ruPriceInfo = {
          available: false,
          isFree: false,
          currency: 'RUB',
          formatted: 'Недоступно',
          statusText: 'Ограничено издателем в РФ',
        };
      }

      const prices = {
        kz: kzPriceInfo,
        ru: ruPriceInfo,
      };

      const result = {
        appId: mainData.steam_appid,
        name: mainData.name,
        shortDescription: mainData.short_description,
        headerImage: getDirectSteamHeaderUrl(mainData.steam_appid, mainData.header_image),
        website: mainData.website,
        developers: mainData.developers || [],
        publishers: mainData.publishers || [],
        genres: (mainData.genres || []).map((g: any) => g.description),
        releaseDate: mainData.release_date?.date || '',
        isFree: mainData.is_free,
        platforms: mainData.platforms,
        screenshots: (mainData.screenshots || []).map((s: any) => ({
          thumbnail: s.path_thumbnail,
          full: s.path_full,
        })),
        prices,
        protonDb,
        steamStoreUrl: `https://store.steampowered.com/app/${mainData.steam_appid}`,
      };

      // Cache details in SQLite for 7 days
      gameCacheQueries.set(
        numAppId,
        mainData.name,
        result.headerImage,
        null,
        null,
        JSON.stringify(result),
        7 * 24 * 60 * 60 * 1000
      );

      // Cache in L1 RAM for 30 minutes
      l1DetailsCache.set(numAppId, { data: result, expiresAt: Date.now() + 30 * 60 * 1000 });

      reply.header('X-Cache', 'MISS');
      reply.header('Cache-Control', 'public, max-age=86400');
      return result;
    } catch (err: any) {
      return reply.status(500).send({ error: 'Failed to retrieve game details', details: err.message });
    }
  });

  // Direct CDN redirect endpoint for game banners (no disk writes, only original links)
  fastify.get('/image/:appId/:type', async (request, reply) => {
    const { appId, type = 'header' } = request.params as { appId: string; type?: string };
    const numId = parseInt(appId, 10);
    if (isNaN(numId)) {
      return reply.status(400).send({ error: 'Invalid app ID' });
    }

    const cached = gameCacheQueries.get(numId);
    let targetUrl = type === 'capsule' ? cached?.capsule_image : cached?.header_image;
    if (!targetUrl || !targetUrl.startsWith('http')) {
      targetUrl = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${numId}/header.jpg`;
    }

    reply.header('Cache-Control', 'public, max-age=604800');
    return reply.redirect(targetUrl, 302);
  });

  // External image redirect endpoint (no disk storage)
  fastify.get('/proxy-image', async (request, reply) => {
    const { url } = request.query as { url?: string };
    if (!url) {
      return reply.status(400).send({ error: 'Missing image url parameter' });
    }

    reply.header('Cache-Control', 'public, max-age=604800');
    return reply.redirect(url, 302);
  });
}
