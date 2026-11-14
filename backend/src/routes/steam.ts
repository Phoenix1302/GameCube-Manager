import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { pipeline } from 'stream/promises';
import { settingsQueries } from '../db/index.js';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.js';
import { getOrCacheGameImage } from '../services/imageCache.js';
import {
  parseBinaryVdf,
  serializeBinaryVdf,
  generateSteamAppId,
  SteamShortcut,
} from '../utils/vdf.js';

function getSteamUserdataDir(): string {
  return settingsQueries.get('steam_userdata_path', config.steamUserDataPath);
}

function getSteamGridDbKey(): string {
  return settingsQueries.get('steamgriddb_api_key', config.steamGridDbApiKey);
}

export function toCleanPath(p: string): string {
  if (p.startsWith('/host_root')) {
    const stripped = p.slice('/host_root'.length);
    return stripped.startsWith('/') ? stripped : '/' + stripped;
  }
  return p;
}

export function toInternalPath(p: string): string {
  if (fs.existsSync(p)) return p;
  if (!p.startsWith('/host_root') && fs.existsSync('/host_root' + p)) {
    return '/host_root' + p;
  }
  return p;
}

function isJunkDirectory(name: string): boolean {
  if (!name) return true;
  const lower = name.toLowerCase().trim();
  const junkPatterns = [
    'steam controller configs',
    'steamworks shared',
    'steam linux runtime',
    'common redistributables',
    'proton',
    'shadercache',
    'directx',
    'vcredist',
    '.tools',
    'depotcache',
  ];
  return junkPatterns.some((pattern) => lower.includes(pattern));
}

// Well-known popular game titles mapped to official Steam AppIDs for instant cover art
const KNOWN_GAME_APPIDS: Record<string, number> = {
  'dead space (2023)': 1693980,
  'dead space': 1693980,
  'helldivers 2': 553850,
  'helldivers™ 2': 553850,
  'space marine 2': 1943950,
  'warhammer 40,000: space marine 2': 1943950,
  'warhammer 40000 space marine 2': 1943950,
  'metro 2033 redux': 286690,
  'metro last light redux': 287390,
  'metro exodus': 412020,
  'escape the backrooms': 2180100,
  'escapethebackrooms': 2180100,
  'the witcher 3': 292030,
  'the witcher 3: wild hunt': 292030,
  'the witcher 3 wild hunt': 292030,
  'monster hunter: world': 582010,
  'monster hunter world': 582010,
  'warframe': 230410,
  'cyberpunk 2077': 1091500,
  'baldurs gate 3': 1086940,
  "baldur's gate 3": 1086940,
  'elden ring': 1245620,
  'hogwarts legacy': 990080,
  'starfield': 1716740,
  'black myth: wukong': 2358720,
  'black myth wukong': 2358720,
  'forza horizon 5': 1551360,
  'red dead redemption 2': 1174180,
  'grand theft auto v': 271590,
  'gta v': 271590,
  'god of war': 1593500,
  'god of war ragnarok': 2322010,
  'ghost of tsushima': 2215430,
  'spider-man remastered': 1817070,
  'marvel’s spider-man remastered': 1817070,
  'horizon zero dawn': 1151640,
  'horizon forbidden west': 2420110,
  'the last of us part i': 1888930,
  'palworld': 1623730,
  'dota 2': 570,
  'counter-strike 2': 730,
  'team fortress 2': 440,
  'apex legends': 1172470,
  'sifu': 2138710,
  'stardew valley': 413150,
  'hades': 1145360,
  'hades ii': 1145350,
  'lies of p': 1627720,
  'armored core vi': 1888160,
  'resident evil 4': 2050650,
  'resident evil village': 1196590,
  'fallout 4': 377160,
  'skyrim special edition': 489830,
  'the elder scrolls v: skyrim': 72850,
};

function resolveAppIdByName(name: string): number | null {
  if (!name) return null;
  const clean = name.toLowerCase().trim().replace(/[®™]/g, '');
  if (KNOWN_GAME_APPIDS[clean]) return KNOWN_GAME_APPIDS[clean];

  const withoutParens = clean.replace(/\s*\([^)]*\)/g, '').trim();
  if (KNOWN_GAME_APPIDS[withoutParens]) return KNOWN_GAME_APPIDS[withoutParens];

  const noPunct = clean.replace(/[:\-_\.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (KNOWN_GAME_APPIDS[noPunct]) return KNOWN_GAME_APPIDS[noPunct];

  return null;
}

function parseAcfFile(filePath: string): Record<string, string> {
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    const result: Record<string, string> = {};
    const lines = text.split(/\r?\n/);
    let depth = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed === '{') {
        depth++;
        continue;
      }
      if (trimmed === '}') {
        depth--;
        continue;
      }

      // Root AppState properties are strictly at depth 1
      if (depth === 1) {
        const match = trimmed.match(/^"([^"]+)"\s+"([^"]*)"/);
        if (match) {
          result[match[1]] = match[2];
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function findSteamLibraryFolders(): string[] {
  const seenClean = new Set<string>();
  const libraries: string[] = [];

  const addLib = (rawPath: string) => {
    if (!rawPath) return;
    let target = '';
    if (fs.existsSync(rawPath)) {
      target = rawPath;
    } else if (fs.existsSync('/host_root' + rawPath)) {
      target = '/host_root' + rawPath;
    } else if (rawPath.startsWith('/host_root') && fs.existsSync(rawPath.replace(/^\/host_root/, ''))) {
      target = rawPath.replace(/^\/host_root/, '');
    }

    if (!target) return;
    const clean = toCleanPath(target).toLowerCase();
    if (!seenClean.has(clean)) {
      seenClean.add(clean);
      libraries.push(target);
    }
  };

  // Primary direct mount
  addLib('/mnt/game_data/SteamLibrary');

  // Configured path
  const configured = settingsQueries.get('steam_library_path', '');
  if (configured) addLib(configured);

  // Scan libraryfolders.vdf
  const vdfCandidates = [
    '/host_root/home/gamecube/.local/share/Steam/steamapps/libraryfolders.vdf',
    '/host_root/home/gamecube/.steam/steam/steamapps/libraryfolders.vdf',
    '/home/gamecube/.local/share/Steam/steamapps/libraryfolders.vdf',
    '/host_root/mnt/game_data/SteamLibrary/libraryfolder.vdf',
    '/mnt/game_data/SteamLibrary/libraryfolder.vdf',
  ];

  const userdata = getSteamUserdataDir();
  if (userdata) {
    const steamRoot = path.dirname(userdata);
    vdfCandidates.unshift(path.join(steamRoot, 'steamapps', 'libraryfolders.vdf'));
  }

  for (const vdfPath of vdfCandidates) {
    if (fs.existsSync(vdfPath)) {
      try {
        const content = fs.readFileSync(vdfPath, 'utf-8');
        const pathMatches = content.matchAll(/"path"\s+"([^"]+)"/g);
        for (const m of pathMatches) {
          addLib(m[1]);
        }
      } catch (err) {
        console.warn(`[Steam] Failed to parse libraryfolders at ${vdfPath}:`, err);
      }
    }
  }

  return libraries;
}

export interface InstalledGameInfo {
  appId: number | null;
  name: string;
  installDir: string;
  fullPath: string;
  displayPath: string;
  sizeBytes: number;
  sizeFormatted: string;
  headerImage: string;
  isOfficialSteam: boolean;
  libraryPath: string;
  libraryDisplayPath: string;
  lastUpdated?: string;
}

export function scanInstalledGames(): { libraries: Array<{ path: string; displayPath: string; gamesCount: number }>; games: InstalledGameInfo[] } {
  const libraryDirs = findSteamLibraryFolders();
  const allGames: InstalledGameInfo[] = [];
  const librariesSummary: Array<{ path: string; displayPath: string; gamesCount: number }> = [];
  const seenGameKeys = new Set<string>();

  for (const libDir of libraryDirs) {
    const steamappsDir = path.join(libDir, 'steamapps');
    const commonDir = path.join(steamappsDir, 'common');
    let libGameCount = 0;

    const matchedCommonDirs = new Set<string>();

    // 1. Read appmanifest_*.acf files if steamapps exists
    if (fs.existsSync(steamappsDir)) {
      try {
        const files = fs.readdirSync(steamappsDir);
        for (const file of files) {
          if (file.startsWith('appmanifest_') && file.endsWith('.acf')) {
            const manifestPath = path.join(steamappsDir, file);
            const data = parseAcfFile(manifestPath);
            const appId = data['appid'] ? parseInt(data['appid'], 10) : null;
            const name = data['name'] || data['installdir'];
            const installDir = data['installdir'];
            const sizeBytes = data['SizeOnDisk'] ? parseInt(data['SizeOnDisk'], 10) : 0;
            const lastUpdated = data['LastUpdated'];

            if (installDir && !isJunkDirectory(name || installDir)) {
              matchedCommonDirs.add(installDir.toLowerCase());
              matchedCommonDirs.add(installDir.toLowerCase().replace(/[\s\-_]/g, ''));

              const gameFullPath = path.join(commonDir, installDir);
              const exists = fs.existsSync(gameFullPath);

              if (exists || sizeBytes > 0) {
                const uniqueKey = appId ? `steam_${appId}` : `dir_${installDir.toLowerCase()}`;
                if (!seenGameKeys.has(uniqueKey)) {
                  seenGameKeys.add(uniqueKey);
                  libGameCount++;
                  if (appId) {
                    getOrCacheGameImage(appId, 'header').catch(() => {});
                  }
                  allGames.push({
                    appId,
                    name: name || installDir,
                    installDir,
                    fullPath: gameFullPath,
                    displayPath: toCleanPath(gameFullPath),
                    sizeBytes,
                    sizeFormatted: formatBytes(sizeBytes),
                    headerImage: appId ? `/api/games/image/${appId}/header` : '',
                    isOfficialSteam: true,
                    libraryPath: libDir,
                    libraryDisplayPath: toCleanPath(libDir),
                    lastUpdated,
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[Steam] Error reading manifests in ${steamappsDir}:`, err);
      }
    }

    // 2. Scan commonDir for folders that weren't in manifests (custom/pirated games)
    if (fs.existsSync(commonDir)) {
      try {
        const entries = fs.readdirSync(commonDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const folderName = entry.name;
            if (isJunkDirectory(folderName)) continue;

            const normalizedFolder = folderName.toLowerCase();
            const squashedFolder = normalizedFolder.replace(/[\s\-_]/g, '');

            if (!matchedCommonDirs.has(normalizedFolder) && !matchedCommonDirs.has(squashedFolder)) {
              const resolvedAppId = resolveAppIdByName(folderName);
              const uniqueKey = resolvedAppId ? `steam_${resolvedAppId}` : `dir_${normalizedFolder}`;

              if (!seenGameKeys.has(uniqueKey)) {
                seenGameKeys.add(uniqueKey);
                const gameFullPath = path.join(commonDir, folderName);
                libGameCount++;
                if (resolvedAppId) {
                  getOrCacheGameImage(resolvedAppId, 'header').catch(() => {});
                }

                allGames.push({
                  appId: resolvedAppId,
                  name: folderName,
                  installDir: folderName,
                  fullPath: gameFullPath,
                  displayPath: toCleanPath(gameFullPath),
                  sizeBytes: 0,
                  sizeFormatted: 'Локальная папка',
                  headerImage: resolvedAppId ? `/api/games/image/${resolvedAppId}/header` : '',
                  isOfficialSteam: false,
                  libraryPath: libDir,
                  libraryDisplayPath: toCleanPath(libDir),
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[Steam] Error scanning common dir in ${commonDir}:`, err);
      }
    }

    librariesSummary.push({
      path: libDir,
      displayPath: toCleanPath(libDir),
      gamesCount: libGameCount,
    });
  }

  // Sort games by name
  allGames.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return {
    libraries: librariesSummary,
    games: allGames,
  };
}

/**
 * Finds the first valid Steam user ID directory under Steam userdata
 */
function findSteamUserConfigDir(): { userDir: string; configDir: string; gridDir: string; shortcutsFile: string } | null {
  const userdataDir = getSteamUserdataDir();
  if (!fs.existsSync(userdataDir)) {
    return null;
  }

  const entries = fs.readdirSync(userdataDir, { withFileTypes: true });
  const userDirs = entries.filter((e) => e.isDirectory() && /^\d+$/.test(e.name));

  if (userDirs.length === 0) {
    return null;
  }

  // Use the most recently modified user directory
  const activeUserDir = path.join(userdataDir, userDirs[0].name);
  const configDir = path.join(activeUserDir, 'config');
  const gridDir = path.join(configDir, 'grid');
  const shortcutsFile = path.join(configDir, 'shortcuts.vdf');

  return {
    userDir: activeUserDir,
    configDir,
    gridDir,
    shortcutsFile,
  };
}

export async function steamRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // List real installed Steam games from discovered libraries (e.g. /mnt/game_data/SteamLibrary)
  fastify.get('/installed-games', async (request, reply) => {
    try {
      const data = scanInstalledGames();
      return data;
    } catch (err: any) {
      return reply.status(500).send({
        error: 'Failed to scan installed Steam games',
        details: err.message,
      });
    }
  });

  // List discovered Steam libraries
  fastify.get('/libraries', async (request, reply) => {
    try {
      const rawLibs = findSteamLibraryFolders();
      return {
        libraries: rawLibs.map((p) => ({
          path: p,
          displayPath: toCleanPath(p),
          commonPath: toCleanPath(path.join(p, 'steamapps', 'common')),
          exists: fs.existsSync(p),
        })),
      };
    } catch (err: any) {
      return reply.status(500).send({
        error: 'Failed to get Steam libraries',
        details: err.message,
      });
    }
  });

  // List existing shortcuts
  fastify.get('/shortcuts', async (request, reply) => {
    const steamPaths = findSteamUserConfigDir();
    if (!steamPaths || !fs.existsSync(steamPaths.shortcutsFile)) {
      return {
        found: false,
        shortcutsFile: steamPaths?.shortcutsFile || null,
        shortcuts: [],
      };
    }

    try {
      const buffer = fs.readFileSync(steamPaths.shortcutsFile);
      const parsed = parseBinaryVdf(buffer);
      const rawShortcuts = parsed.shortcuts || {};

      const shortcuts: SteamShortcut[] = Object.values(rawShortcuts);

      return {
        found: true,
        shortcutsFile: steamPaths.shortcutsFile,
        gridDir: steamPaths.gridDir,
        shortcuts,
      };
    } catch (err: any) {
      return reply.status(500).send({
        error: 'Failed to read or parse shortcuts.vdf',
        details: err.message,
      });
    }
  });

  // Add or update shortcut
  fastify.post('/shortcuts', async (request, reply) => {
    const {
      appName,
      exe,
      startDir,
      launchOptions,
      tags,
      compatTool,
    } = request.body as {
      appName?: string;
      exe?: string;
      startDir?: string;
      launchOptions?: string;
      tags?: string[];
      compatTool?: string;
    };

    if (!appName || !exe) {
      return reply.status(400).send({ error: 'appName and exe are required' });
    }

    const steamPaths = findSteamUserConfigDir();
    if (!steamPaths) {
      return reply.status(404).send({
        error: 'Steam userdata directory not found. Please configure path in Settings.',
      });
    }

    // Ensure config & grid directories exist
    if (!fs.existsSync(steamPaths.configDir)) {
      fs.mkdirSync(steamPaths.configDir, { recursive: true });
    }
    if (!fs.existsSync(steamPaths.gridDir)) {
      fs.mkdirSync(steamPaths.gridDir, { recursive: true });
    }

    let parsed: Record<string, any> = { shortcuts: {} };
    if (fs.existsSync(steamPaths.shortcutsFile)) {
      try {
        const buf = fs.readFileSync(steamPaths.shortcutsFile);
        parsed = parseBinaryVdf(buf);
        if (!parsed.shortcuts) parsed.shortcuts = {};
        // Backup
        fs.copyFileSync(steamPaths.shortcutsFile, `${steamPaths.shortcutsFile}.bak`);
      } catch (err) {
        console.warn('[Steam] Could not parse existing shortcuts.vdf, starting fresh');
      }
    }

    const appId = generateSteamAppId(exe, appName);
    const existingIndex = Object.keys(parsed.shortcuts).length;

    const formattedTags: Record<string, string> = {};
    if (tags && Array.isArray(tags)) {
      tags.forEach((t, i) => {
        formattedTags[String(i)] = t;
      });
    }

    const newShortcut: SteamShortcut = {
      appid: appId,
      AppName: appName,
      Exe: `"${exe}"`,
      StartDir: startDir ? `"${startDir}"` : `"${path.dirname(exe)}"`,
      icon: '',
      ShortcutPath: '',
      LaunchOptions: launchOptions || '',
      IsHidden: 0,
      AllowDesktopConfig: 1,
      AllowOverlay: 1,
      OpenVR: 0,
      Devkit: 0,
      DevkitGameID: '',
      DevkitOverrideAppID: 0,
      LastPlayTime: 0,
      FlatpakAppID: '',
      tags: formattedTags,
      compat_tool: compatTool || 'Proton Experimental',
    };

    parsed.shortcuts[String(existingIndex)] = newShortcut;

    const newBuffer = serializeBinaryVdf(parsed);
    fs.writeFileSync(steamPaths.shortcutsFile, newBuffer);

    return {
      message: 'Shortcut added successfully',
      appId,
      shortcut: newShortcut,
      shortcutsFile: steamPaths.shortcutsFile,
    };
  });

  // SteamGridDB: Search games
  fastify.get('/grid/search', async (request, reply) => {
    const { q } = request.query as { q?: string };
    const apiKey = getSteamGridDbKey();

    if (!apiKey) {
      return reply.status(400).send({
        error: 'SteamGridDB API key is not configured. Please add it in Settings.',
      });
    }

    if (!q || q.trim().length === 0) {
      return { games: [] };
    }

    try {
      const res = await axios.get(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(q.trim())}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 6000,
      });

      return {
        games: res.data.data || [],
      };
    } catch (err: any) {
      return reply.status(502).send({
        error: 'Failed to search SteamGridDB',
        details: err.message,
      });
    }
  });

  // SteamGridDB: Get artworks (grids, heroes, logos)
  fastify.get('/grid/assets/:gameId', async (request, reply) => {
    const { gameId } = request.params as { gameId: string };
    const apiKey = getSteamGridDbKey();

    if (!apiKey) {
      return reply.status(400).send({
        error: 'SteamGridDB API key is not configured.',
      });
    }

    try {
      const headers = { Authorization: `Bearer ${apiKey}` };

      const [gridsRes, heroesRes, logosRes] = await Promise.allSettled([
        axios.get(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=600x900,460x215,920x430`, { headers, timeout: 6000 }),
        axios.get(`https://www.steamgriddb.com/api/v2/heroes/game/${gameId}`, { headers, timeout: 6000 }),
        axios.get(`https://www.steamgriddb.com/api/v2/logos/game/${gameId}`, { headers, timeout: 6000 }),
      ]);

      const grids = gridsRes.status === 'fulfilled' ? gridsRes.value.data.data || [] : [];
      const heroes = heroesRes.status === 'fulfilled' ? heroesRes.value.data.data || [] : [];
      const logos = logosRes.status === 'fulfilled' ? logosRes.value.data.data || [] : [];

      return {
        grids: grids.map((g: any) => ({ id: g.id, url: g.url, thumb: g.thumb, width: g.width, height: g.height })),
        heroes: heroes.map((h: any) => ({ id: h.id, url: h.url, thumb: h.thumb, width: h.width, height: h.height })),
        logos: logos.map((l: any) => ({ id: l.id, url: l.url, thumb: l.thumb, width: l.width, height: l.height })),
      };
    } catch (err: any) {
      return reply.status(502).send({ error: 'Failed to fetch assets from SteamGridDB', details: err.message });
    }
  });

  // Download artwork into Steam grid folder
  fastify.post('/grid/download', async (request, reply) => {
    const { appId, assetType, imageUrl } = request.body as {
      appId?: number | string;
      assetType?: 'poster' | 'banner' | 'hero' | 'logo';
      imageUrl?: string;
    };

    if (!appId || !imageUrl || !assetType) {
      return reply.status(400).send({ error: 'appId, assetType, and imageUrl are required' });
    }

    const steamPaths = findSteamUserConfigDir();
    if (!steamPaths) {
      return reply.status(404).send({ error: 'Steam userdata directory not found.' });
    }

    if (!fs.existsSync(steamPaths.gridDir)) {
      fs.mkdirSync(steamPaths.gridDir, { recursive: true });
    }

    // Determine target filename based on Valve's grid convention:
    // poster (600x900): <appId>p.png
    // banner (460x215): <appId>.png
    // hero (1920x620): <appId>_hero.png
    // logo: <appId>_logo.png
    let filename = '';
    switch (assetType) {
      case 'poster':
        filename = `${appId}p.png`;
        break;
      case 'banner':
        filename = `${appId}.png`;
        break;
      case 'hero':
        filename = `${appId}_hero.png`;
        break;
      case 'logo':
        filename = `${appId}_logo.png`;
        break;
      default:
        filename = `${appId}p.png`;
    }

    const destPath = path.join(steamPaths.gridDir, filename);

    try {
      const response = await axios({
        method: 'GET',
        url: imageUrl,
        responseType: 'stream',
        timeout: 10000,
      });

      await pipeline(response.data, fs.createWriteStream(destPath));

      return {
        message: 'Artwork saved to Steam grid directory',
        filename,
        destPath,
      };
    } catch (err: any) {
      return reply.status(500).send({
        error: `Failed to download image: ${err.message}`,
      });
    }
  });

  // Proton recommendations based on ProtonDB
  fastify.get('/proton-recommendations/:appId', async (request) => {
    const { appId } = request.params as { appId: string };

    try {
      const res = await axios.get(`https://www.protondb.com/api/v1/reports/summaries/${appId}.json`, {
        timeout: 5000,
      });

      const tier = res.data.tier || 'unknown';

      let recommendedVersion = 'GE-Proton9-20';
      let launchOptions = 'gamemoderun %command%';
      let notes = '';

      switch (tier) {
        case 'platinum':
          recommendedVersion = 'Proton Experimental';
          notes = 'Works out of the box with zero tweaks. Proton Experimental or Proton 9.0 is recommended.';
          break;
        case 'gold':
          recommendedVersion = 'GE-Proton9-20';
          launchOptions = 'RADV_PERFTEST=gpl gamemoderun %command%';
          notes = 'Works flawlessly with GE-Proton for enhanced media codecs and audio fixes.';
          break;
        case 'silver':
          recommendedVersion = 'GE-Proton9-20';
          launchOptions = 'PROTON_NO_ESYNC=1 gamemoderun %command%';
          notes = 'May require minor tweaks or GE-Proton fixes.';
          break;
        case 'bronze':
        case 'borked':
          recommendedVersion = 'GE-Proton7-55 / Wine-GE';
          launchOptions = 'PROTON_USE_WINED3D=1 %command%';
          notes = 'Has significant compatibility hurdles. Check ProtonDB community reports for custom proton builds.';
          break;
        default:
          recommendedVersion = 'Proton Experimental';
          notes = 'No ProtonDB tier report. Try Proton Experimental first.';
      }

      return {
        appId,
        tier,
        score: res.data.score || 0,
        recommendedVersion,
        launchOptions,
        notes,
      };
    } catch {
      return {
        appId,
        tier: 'unknown',
        recommendedVersion: 'Proton Experimental',
        launchOptions: 'gamemoderun %command%',
        notes: 'No ProtonDB report available. Defaulting to Proton Experimental.',
      };
    }
  });
}
