import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import axios from 'axios';
import { pipeline } from 'stream/promises';
import { settingsQueries } from '../db/index.js';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.js';
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

// Set of official Steam / Valve utility & runtime AppIDs to exclude from game list
const STEAM_TOOL_APPIDS = new Set<number>([
  1070560, // Steam Linux Runtime
  1391110, // Steam Linux Runtime 3.0 (sniper)
  1628350, // Steam Linux Runtime 2.0 (soldier)
  228980,  // Steamworks Common Redistributables
  1493710, // Proton Experimental
  2180070, // Proton 8.0
  2805730, // Proton 9.0
  2230260, // Proton Hotfix
  894760,  // Proton 3.7
  961940,  // Proton 4.2
  1054050, // Proton 5.0
  1580130, // Proton 6.3
  1887720, // Proton 7.0
  1826330, // Proton EasyAntiCheat Runtime
  1826340, // Proton BattlEye Runtime
  247080,  // SteamVR
  250820,  // SteamVR
]);

function isTechnicalOrJunk(name?: string, installDir?: string, appId?: number | null): boolean {
  if (appId && STEAM_TOOL_APPIDS.has(appId)) {
    return true;
  }

  const check = (str?: string): boolean => {
    if (!str) return false;
    const lower = str.toLowerCase().trim();
    const squashed = lower.replace(/[\s\-_.]/g, '');

    const junkKeywords = [
      'steamcontrollerconfigs',
      'steamcontroller',
      'steamworks',
      'steamlinuxruntime',
      'linuxruntime',
      'commonredistributables',
      'redistributables',
      'proton',
      'shadercache',
      'directx',
      'vcredist',
      'vc_redist',
      'ue4prereq',
      'ueprereq',
      'oalinst',
      'dotnet',
      'mono',
      'depotcache',
      'sourcemods',
      'steamaudio',
      'workshop',
      '.tools',
      'openvr',
      'steamvr',
      'steamlinux',
      'sniper',
      'soldier',
      'scout',
      'medic',
      'pressurevessel',
      'pressure-vessel',
    ];

    return junkKeywords.some((kw) => squashed.includes(kw) || lower.includes(kw));
  };

  return check(name) || check(installDir);
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
  'lego batman': 21000,
  'lego batman: the videogame': 21000,
  'lego batman the videogame': 21000,
  'lego batman 2': 213330,
  'lego batman 2: dc super heroes': 213330,
  'lego batman 2 dc super heroes': 213330,
  'lego batman 3': 313690,
  'lego batman 3: beyond gotham': 313690,
  'lego batman 3 beyond gotham': 313690,
  'lego batman legacy of the dark knight': 21000,
  'batman arkham asylum': 35140,
  'batman arkham city': 200260,
  'batman arkham origins': 209000,
  'batman arkham knight': 208650,
};

export function cleanGameTitle(folderName: string): string {
  if (!folderName) return '';
  let title = folderName
    .replace(/[._]/g, ' ')
    .replace(/-?(InsaneRamZes|DODI|FitGirl|CODEX|RUNE|TENOKE|ElAmigos|SKIDROW|FLT|RELOADED|CPY|GOG|Razor1911)\b/gi, '')
    .replace(/\b(Deluxe|Ultimate|Complete|Special|Enhanced|Standard|Definitive|Game of the Year|GOTY|Gold|Premium)\s*(Edition|Edit|Ed)?\b/gi, '')
    .replace(/\b(Build\s*\d+|v\s*\d+(\.\d+)*|Repack|Multi\d+|Portable)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return title || folderName;
}

function resolveAppIdByName(name: string): number | null {
  if (!name) return null;
  const clean = name.toLowerCase().trim().replace(/[®™]/g, '');
  if (KNOWN_GAME_APPIDS[clean]) return KNOWN_GAME_APPIDS[clean];

  const withoutParens = clean.replace(/\s*\([^)]*\)/g, '').trim();
  if (KNOWN_GAME_APPIDS[withoutParens]) return KNOWN_GAME_APPIDS[withoutParens];

  const noPunct = clean.replace(/[:\-_\.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (KNOWN_GAME_APPIDS[noPunct]) return KNOWN_GAME_APPIDS[noPunct];

  const cleanedTitle = cleanGameTitle(name).toLowerCase();
  if (KNOWN_GAME_APPIDS[cleanedTitle]) return KNOWN_GAME_APPIDS[cleanedTitle];

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

            if (installDir && !isTechnicalOrJunk(name, installDir, appId)) {
              matchedCommonDirs.add(installDir.toLowerCase());
              matchedCommonDirs.add(installDir.toLowerCase().replace(/[\s\-_]/g, ''));

              const gameFullPath = path.join(commonDir, installDir);
              const exists = fs.existsSync(gameFullPath);

              if (exists || sizeBytes > 0) {
                const uniqueKey = appId ? `steam_${appId}` : `dir_${installDir.toLowerCase()}`;
                if (!seenGameKeys.has(uniqueKey)) {
                  seenGameKeys.add(uniqueKey);
                  libGameCount++;
                  allGames.push({
                    appId,
                    name: name || installDir,
                    installDir,
                    fullPath: gameFullPath,
                    displayPath: toCleanPath(gameFullPath),
                    sizeBytes,
                    sizeFormatted: formatBytes(sizeBytes),
                    headerImage: appId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg` : '',
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
            if (isTechnicalOrJunk(folderName, folderName)) continue;

            const normalizedFolder = folderName.toLowerCase();
            const squashedFolder = normalizedFolder.replace(/[\s\-_]/g, '');

            if (!matchedCommonDirs.has(normalizedFolder) && !matchedCommonDirs.has(squashedFolder)) {
              const cleanedName = cleanGameTitle(folderName);
              const resolvedAppId = resolveAppIdByName(folderName) || resolveAppIdByName(cleanedName);
              const uniqueKey = resolvedAppId ? `steam_${resolvedAppId}` : `dir_${normalizedFolder}`;

              if (!seenGameKeys.has(uniqueKey)) {
                seenGameKeys.add(uniqueKey);
                const gameFullPath = path.join(commonDir, folderName);
                libGameCount++;

                allGames.push({
                  appId: resolvedAppId,
                  name: cleanedName,
                  installDir: folderName,
                  fullPath: gameFullPath,
                  displayPath: toCleanPath(gameFullPath),
                  sizeBytes: 0,
                  sizeFormatted: 'Локальная папка',
                  headerImage: resolvedAppId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/header.jpg` : '',
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

export interface SteamUserConfigDir {
  userId: string;
  userDir: string;
  configDir: string;
  gridDir: string;
  shortcutsFile: string;
}

export function findAllSteamUserConfigDirs(): SteamUserConfigDir[] {
  const rawUserdataDir = getSteamUserdataDir();
  const internalUserdataDir = toInternalPath(rawUserdataDir);
  if (!fs.existsSync(internalUserdataDir)) {
    return [];
  }

  const entries = fs.readdirSync(internalUserdataDir, { withFileTypes: true });
  // Filter numeric directories
  const numericDirs = entries.filter((e) => e.isDirectory() && /^\d+$/.test(e.name));
  // Prefer real user IDs (!== '0')
  const nonZero = numericDirs.filter((e) => e.name !== '0');
  const targetDirs = nonZero.length > 0 ? nonZero : numericDirs;

  return targetDirs.map((e) => {
    const userDir = path.join(internalUserdataDir, e.name);
    const configDir = path.join(userDir, 'config');
    const gridDir = path.join(configDir, 'grid');
    const shortcutsFile = path.join(configDir, 'shortcuts.vdf');
    return {
      userId: e.name,
      userDir,
      configDir,
      gridDir,
      shortcutsFile,
    };
  });
}

/**
 * Finds the most active valid Steam user ID directory under Steam userdata
 */
function findSteamUserConfigDir(): SteamUserConfigDir | null {
  const allDirs = findAllSteamUserConfigDirs();
  if (allDirs.length === 0) {
    return null;
  }

  // Sort by most recently modified localconfig.vdf or user directory
  allDirs.sort((a, b) => {
    let mtimeA = 0;
    let mtimeB = 0;
    try {
      const fA = path.join(a.configDir, 'localconfig.vdf');
      mtimeA = fs.existsSync(fA) ? fs.statSync(fA).mtimeMs : fs.statSync(a.userDir).mtimeMs;
    } catch {}
    try {
      const fB = path.join(b.configDir, 'localconfig.vdf');
      mtimeB = fs.existsSync(fB) ? fs.statSync(fB).mtimeMs : fs.statSync(b.userDir).mtimeMs;
    } catch {}
    return mtimeB - mtimeA;
  });

  return allDirs[0];
}

export function normalizeCompatTool(tool?: string): string {
  if (!tool) return 'proton_experimental';
  const lower = tool.toLowerCase().trim();
  if (lower.includes('experimental')) return 'proton_experimental';
  if (lower.includes('9.0') || lower.includes('proton-9') || lower === 'proton_9') return 'proton_9';
  if (lower.includes('8.0') || lower.includes('proton-8') || lower === 'proton_8') return 'proton_8';
  if (lower.includes('7.0') || lower.includes('proton-7') || lower === 'proton_7') return 'proton_7';
  if (lower.includes('hotfix')) return 'proton_hotfix';
  return tool;
}

function getSteamConfigFiles(): string[] {
  const rawUserdataDir = getSteamUserdataDir();
  const internalUserdata = toInternalPath(rawUserdataDir);
  const internalSteamDir = path.dirname(internalUserdata);

  const files = new Set<string>();

  // Global config.vdf
  files.add(path.join(internalSteamDir, 'config', 'config.vdf'));
  files.add('/host_root/home/gamecube/.local/share/Steam/config/config.vdf');
  files.add('/host_root/home/gamecube/.steam/steam/config/config.vdf');
  files.add('/home/gamecube/.local/share/Steam/config/config.vdf');
  files.add('/host_root/home/deck/.local/share/Steam/config/config.vdf');

  // User-specific config and localconfig
  const allUserDirs = findAllSteamUserConfigDirs();
  for (const u of allUserDirs) {
    files.add(path.join(u.configDir, 'localconfig.vdf'));
    files.add(path.join(u.configDir, 'config.vdf'));
  }

  return Array.from(files).filter((f) => fs.existsSync(f));
}

function updateCompatToolInVdf(filePath: string, appId: number, toolName: string) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const appIdStr = String(appId);

    // Global cleanup of invalid display names in existing CompatToolMapping
    content = content.replace(/"name"\s+"Proton Experimental"/g, '"name"\t\t"proton_experimental"');
    content = content.replace(/"name"\s+"Proton 9\.0"/g, '"name"\t\t"proton_9"');
    content = content.replace(/"name"\s+"Proton 8\.0"/g, '"name"\t\t"proton_8"');
    content = content.replace(/"name"\s+"Proton Hotfix"/g, '"name"\t\t"proton_hotfix"');

    // 1. If this appId already exists in the file, update its "name" property
    const appRegex = new RegExp(`("${appIdStr}"\\s*\\{[\\s\\S]*?"name"\\s+")[^"]*(")`);
    if (appRegex.test(content)) {
      content = content.replace(appRegex, `$1${toolName}$2`);
      fs.writeFileSync(filePath, content, 'utf-8');
      return;
    }

    // 2. Otherwise insert new entry into CompatToolMapping
    const newEntry = `\n\t\t\t\t\t"${appIdStr}"\n\t\t\t\t\t{\n\t\t\t\t\t\t"name"\t\t"${toolName}"\n\t\t\t\t\t\t"config"\t\t""\n\t\t\t\t\t\t"priority"\t\t"250"\n\t\t\t\t\t}`;

    if (/"CompatToolMapping"\s*\{/i.test(content)) {
      content = content.replace(/("CompatToolMapping"\s*\{)/i, `$1${newEntry}`);
      fs.writeFileSync(filePath, content, 'utf-8');
    } else if (/"Steam"\s*\{/i.test(content)) {
      content = content.replace(
        /("Steam"\s*\{)/i,
        `$1\n\t\t\t\t"CompatToolMapping"\n\t\t\t\t{${newEntry}\n\t\t\t\t}`
      );
      fs.writeFileSync(filePath, content, 'utf-8');
    }
  } catch (err: any) {
    console.warn(`[Steam] Failed to write Proton mapping to ${filePath}:`, err.message);
  }
}

function applyCompatToolMapping(appId: number, toolName: string) {
  const normalizedTool = normalizeCompatTool(toolName);
  const files = getSteamConfigFiles();
  for (const file of files) {
    updateCompatToolInVdf(file, appId, normalizedTool);
  }
}

function removeCompatToolMapping(appId: number) {
  const appIdStr = String(appId);
  const files = getSteamConfigFiles();
  const appBlockRegex = new RegExp(`[\\t ]*"${appIdStr}"\\s*\\{[\\s\\S]*?\\}\\r?\\n?`, 'g');

  for (const file of files) {
    try {
      let content = fs.readFileSync(file, 'utf-8');
      if (content.includes(`"${appIdStr}"`)) {
        content = content.replace(appBlockRegex, '');
        fs.writeFileSync(file, content, 'utf-8');
      }
    } catch {}
  }
}

export interface DetectedExecutable {
  path: string;
  displayPath: string;
  name: string;
  sizeBytes: number;
  sizeFormatted: string;
  score: number;
  isRecommended: boolean;
}

export function scanGameExecutables(gameDir: string): {
  executables: DetectedExecutable[];
  recommendedExe: string | null;
  recommendedDisplayExe: string | null;
  startDir: string;
} {
  const internalDir = toInternalPath(gameDir);
  if (!fs.existsSync(internalDir)) {
    return {
      executables: [],
      recommendedExe: null,
      recommendedDisplayExe: null,
      startDir: toCleanPath(gameDir),
    };
  }

  const folderName = path.basename(gameDir).toLowerCase().replace(/[\s\-_()]/g, '');
  const found: DetectedExecutable[] = [];

  const ignoredDirs = new Set([
    '_commonredist',
    'directx',
    'redist',
    'support',
    'installers',
    'prerequisites',
    'dotnet',
    'crashreporter',
    'crashhandler',
    '.steam',
    '.git',
    'mono',
    'easyanticheat',
    'battleye',
  ]);

  const ignoredExePatterns = [
    'unins',
    'uninstall',
    'dxsetup',
    'dxwebsetup',
    'oalinst',
    'unitycrashhandler',
    'crashreport',
    'ue4prereq',
    'ueprereq',
    'easyanticheat',
    'beservice',
    '7z.exe',
    'zip.exe',
    'vcredist',
    'vc_redist',
  ];

  function traverse(currentDir: string, depth: number) {
    if (depth > 4) return;
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          const lowerName = entry.name.toLowerCase();
          if (!ignoredDirs.has(lowerName)) {
            traverse(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          const lowerName = entry.name.toLowerCase();
          const ext = path.extname(lowerName);
          const isBinary = ['.exe', '.x86_64', '.sh', '.bin', '.appimage'].includes(ext);

          if (isBinary) {
            const isIgnored = ignoredExePatterns.some((ign) => lowerName.includes(ign));
            if (!isIgnored) {
              let sizeBytes = 0;
              try {
                sizeBytes = fs.statSync(fullPath).size;
              } catch {}

              let score = 0;
              const cleanExe = lowerName.replace(/\.[^/.]+$/, '').replace(/[\s\-_()]/g, '');

              // Match with folder name
              if (cleanExe.includes(folderName) || folderName.includes(cleanExe)) {
                score += 100;
              }

              if (lowerName.includes('shipping')) score += 40;
              if (lowerName.includes('game')) score += 20;
              if (lowerName.includes('launcher')) score += 10;

              // Priority by depth
              if (depth === 0) score += 30;
              if (currentDir.toLowerCase().includes('bin') || currentDir.toLowerCase().includes('x64')) {
                score += 25;
              }

              // Negative scoring for config/setup
              if (lowerName.includes('config') || lowerName.includes('setup') || lowerName.includes('server')) {
                score -= 50;
              }

              // Size bonus
              if (sizeBytes > 10 * 1024 * 1024) score += 30;
              else if (sizeBytes > 2 * 1024 * 1024) score += 15;
              else if (sizeBytes < 500 * 1024) score -= 20;

              found.push({
                path: fullPath,
                displayPath: toCleanPath(fullPath),
                name: entry.name,
                sizeBytes,
                sizeFormatted: formatBytes(sizeBytes),
                score,
                isRecommended: false,
              });
            }
          }
        }
      }
    } catch {}
  }

  traverse(internalDir, 0);

  // Sort candidates by score descending
  found.sort((a, b) => b.score - a.score);

  if (found.length > 0) {
    found[0].isRecommended = true;
  }

  const recommended = found.length > 0 ? found[0] : null;
  const startDir = recommended ? path.dirname(recommended.displayPath) : toCleanPath(gameDir);

  return {
    executables: found,
    recommendedExe: recommended ? recommended.path : null,
    recommendedDisplayExe: recommended ? recommended.displayPath : null,
    startDir,
  };
}

async function saveArtworkToSteamGrid(
  gridDirs: string | string[],
  appId: number,
  type: 'poster' | 'banner' | 'hero' | 'logo',
  sourceUrl: string
): Promise<boolean> {
  const dirs = Array.isArray(gridDirs) ? gridDirs : [gridDirs];
  const shortId = String(appId);
  const longId = ((BigInt(appId) << 32n) | 0x02000000n).toString();

  let baseSuffix = '';
  switch (type) {
    case 'poster':
      baseSuffix = 'p';
      break;
    case 'banner':
      baseSuffix = '';
      break;
    case 'hero':
      baseSuffix = '_hero';
      break;
    case 'logo':
      baseSuffix = '_logo';
      break;
  }

  try {
    const res = await axios.get(sourceUrl, { responseType: 'arraybuffer', timeout: 8000 });
    if (res.status === 200 && res.data && res.data.length > 0) {
      const buf = Buffer.from(res.data);
      for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
          try {
            fs.mkdirSync(dir, { recursive: true });
          } catch {}
        }
        for (const ext of ['.png', '.jpg']) {
          try {
            fs.writeFileSync(path.join(dir, `${shortId}${baseSuffix}${ext}`), buf);
            fs.writeFileSync(path.join(dir, `${longId}${baseSuffix}${ext}`), buf);
          } catch {}
        }
      }
      return true;
    }
  } catch (err: any) {
    console.warn(`[SteamGrid] Failed to download ${type} from ${sourceUrl}:`, err.message);
  }
  return false;
}

export interface ArtworkCandidate {
  id: string;
  url: string;
  thumb: string;
  source: 'steam' | 'steamgriddb';
  author?: string;
  width?: number;
  height?: number;
}

export interface ArtworkCandidatesResponse {
  resolvedSteamAppId: number | null;
  posters: ArtworkCandidate[];
  banners: ArtworkCandidate[];
  heroes: ArtworkCandidate[];
  logos: ArtworkCandidate[];
}

export async function getArtworkCandidates(
  name: string,
  providedAppId?: number | null
): Promise<ArtworkCandidatesResponse> {
  const result: ArtworkCandidatesResponse = {
    resolvedSteamAppId: null,
    posters: [],
    banners: [],
    heroes: [],
    logos: [],
  };

  const candidateSteamAppIds: number[] = [];
  if (providedAppId) {
    candidateSteamAppIds.push(providedAppId);
    result.resolvedSteamAppId = providedAppId;
  }

  const directMapped = resolveAppIdByName(name);
  if (directMapped && !candidateSteamAppIds.includes(directMapped)) {
    candidateSteamAppIds.push(directMapped);
    if (!result.resolvedSteamAppId) result.resolvedSteamAppId = directMapped;
  }

  // If no or few known Steam AppIDs, search Steam store by name
  if (name && name.trim().length > 0) {
    try {
      const cleanTerm = name.replace(/\s*\([^)]*\)/g, '').replace(/[:\-_\.]/g, ' ').trim();
      const searchRes = await axios.get(
        `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(cleanTerm)}&l=russian&cc=KZ`,
        { timeout: 5000 }
      );
      const items = searchRes.data?.items || [];
      for (const item of items.slice(0, 3)) {
        if (item.id && !candidateSteamAppIds.includes(item.id)) {
          candidateSteamAppIds.push(item.id);
          if (!result.resolvedSteamAppId) result.resolvedSteamAppId = item.id;
        }
      }
    } catch {}
  }

  // 1. For each resolved Steam AppID, fetch official Steam Store artwork
  for (const steamAppId of candidateSteamAppIds) {
    result.posters.push({
      id: `steam_poster_${steamAppId}`,
      url: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_600x900.jpg`,
      thumb: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_600x900.jpg`,
      source: 'steam',
      width: 600,
      height: 900,
    });

    result.posters.push({
      id: `steam_capsule_${steamAppId}`,
      url: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/capsule_616x353.jpg`,
      thumb: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/capsule_616x353.jpg`,
      source: 'steam',
      width: 616,
      height: 353,
    });

    result.banners.push({
      id: `steam_banner_${steamAppId}`,
      url: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`,
      thumb: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`,
      source: 'steam',
      width: 460,
      height: 215,
    });

    result.heroes.push({
      id: `steam_hero_${steamAppId}`,
      url: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero.jpg`,
      thumb: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero.jpg`,
      source: 'steam',
      width: 1920,
      height: 620,
    });

    result.logos.push({
      id: `steam_logo_${steamAppId}`,
      url: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/logo.png`,
      thumb: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/logo.png`,
      source: 'steam',
    });
  }

  // 2. If SteamGridDB API key is configured, search and append community artworks
  const sgdbKey = getSteamGridDbKey();
  if (sgdbKey) {
    try {
      const cleanTerm = name.replace(/\s*\([^)]*\)/g, '').replace(/[:\-_\.]/g, ' ').trim();
      const searchRes = await axios.get(
        `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(cleanTerm)}`,
        { headers: { Authorization: `Bearer ${sgdbKey}` }, timeout: 5000 }
      );

      const games = (searchRes.data?.data || []).slice(0, 2);
      for (const game of games) {
        const gameId = game.id;
        const headers = { Authorization: `Bearer ${sgdbKey}` };

        const [gridsRes, bannersRes, heroesRes, logosRes] = await Promise.allSettled([
          axios.get(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=600x900`, { headers, timeout: 5000 }),
          axios.get(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=460x215,920x430`, { headers, timeout: 5000 }),
          axios.get(`https://www.steamgriddb.com/api/v2/heroes/game/${gameId}`, { headers, timeout: 5000 }),
          axios.get(`https://www.steamgriddb.com/api/v2/logos/game/${gameId}`, { headers, timeout: 5000 }),
        ]);

        if (gridsRes.status === 'fulfilled') {
          for (const g of (gridsRes.value.data?.data || []).slice(0, 8)) {
            result.posters.push({
              id: `sgdb_grid_${g.id}`,
              url: g.url,
              thumb: g.thumb || g.url,
              source: 'steamgriddb',
              author: g.author?.name,
              width: g.width,
              height: g.height,
            });
          }
        }

        if (bannersRes.status === 'fulfilled') {
          for (const b of (bannersRes.value.data?.data || []).slice(0, 8)) {
            result.banners.push({
              id: `sgdb_banner_${b.id}`,
              url: b.url,
              thumb: b.thumb || b.url,
              source: 'steamgriddb',
              author: b.author?.name,
              width: b.width,
              height: b.height,
            });
          }
        }

        if (heroesRes.status === 'fulfilled') {
          for (const h of (heroesRes.value.data?.data || []).slice(0, 6)) {
            result.heroes.push({
              id: `sgdb_hero_${h.id}`,
              url: h.url,
              thumb: h.thumb || h.url,
              source: 'steamgriddb',
              author: h.author?.name,
              width: h.width,
              height: h.height,
            });
          }
        }

        if (logosRes.status === 'fulfilled') {
          for (const l of (logosRes.value.data?.data || []).slice(0, 6)) {
            result.logos.push({
              id: `sgdb_logo_${l.id}`,
              url: l.url,
              thumb: l.thumb || l.url,
              source: 'steamgriddb',
              author: l.author?.name,
            });
          }
        }
      }
    } catch (err: any) {
      console.warn('[SteamGridDB] Failed to fetch candidates:', err.message);
    }
  }

  return result;
}

async function autoCreateShortcut(params: {
  appName: string;
  gamePath: string;
  exe?: string;
  startDir?: string;
  compatTool?: string;
  launchOptions?: string;
  installArtwork?: boolean;
  resolvedSteamAppId?: number;
  customArtwork?: {
    poster?: string;
    banner?: string;
    hero?: string;
    logo?: string;
  };
}) {
  const allUserDirs = findAllSteamUserConfigDirs();
  if (allUserDirs.length === 0) {
    throw new Error('Каталог Steam userdata не найден. Укажите путь в Настройках.');
  }

  // 1. Resolve executable and working directory
  let cleanExe = params.exe;
  let cleanStartDir = params.startDir;

  if (!cleanExe) {
    const scanResult = scanGameExecutables(params.gamePath);
    if (!scanResult.recommendedDisplayExe) {
      throw new Error(`Исполняемый файл (.exe / .sh) не найден в каталоге игры: ${params.gamePath}`);
    }
    cleanExe = scanResult.recommendedDisplayExe;
    if (!cleanStartDir) {
      cleanStartDir = scanResult.startDir;
    }
  }

  if (!cleanStartDir) {
    cleanStartDir = path.dirname(cleanExe);
  }

  const appId = generateSteamAppId(cleanExe, params.appName);
  const compatTool = normalizeCompatTool(params.compatTool || 'proton_experimental');

  const newShortcut: SteamShortcut = {
    appid: appId,
    AppName: params.appName,
    Exe: `"${cleanExe}"`,
    StartDir: `"${cleanStartDir}"`,
    icon: '',
    ShortcutPath: '',
    LaunchOptions: params.launchOptions || '',
    IsHidden: 0,
    AllowDesktopConfig: 1,
    AllowOverlay: 1,
    OpenVR: 0,
    Devkit: 0,
    DevkitGameID: '',
    DevkitOverrideAppID: 0,
    LastPlayTime: 0,
    FlatpakAppID: '',
    tags: { '0': 'GameCube' },
    compat_tool: compatTool,
  };

  // 2. Write shortcut to EVERY discovered Steam user directory
  for (const steamPaths of allUserDirs) {
    try {
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
          fs.copyFileSync(steamPaths.shortcutsFile, `${steamPaths.shortcutsFile}.bak`);
        } catch (err) {
          console.warn(`[Steam] Could not parse existing shortcuts.vdf for user ${steamPaths.userId}, starting fresh`);
        }
      }

      let existingKey: string | null = null;
      for (const [k, v] of Object.entries(parsed.shortcuts)) {
        if ((v as any).appid === appId || (v as any).AppName === params.appName) {
          existingKey = k;
          break;
        }
      }

      const targetKey = existingKey || String(Object.keys(parsed.shortcuts).length);
      parsed.shortcuts[targetKey] = newShortcut;
      fs.writeFileSync(steamPaths.shortcutsFile, serializeBinaryVdf(parsed));
    } catch (err: any) {
      console.warn(`[Steam] Failed to write shortcuts.vdf for user ${steamPaths.userId}:`, err.message);
    }
  }

  // 3. Apply Proton compatibility mapping in config/config.vdf
  applyCompatToolMapping(appId, compatTool);

  // 4. Download and install artwork to all user grid directories if requested
  const allGridDirs = allUserDirs.map((u) => u.gridDir);
  const artworkStatus = {
    poster: false,
    banner: false,
    hero: false,
    logo: false,
  };

  if (params.installArtwork !== false) {
    // 4.1 First priority: Apply user-selected custom artwork if provided
    if (params.customArtwork) {
      if (params.customArtwork.poster) {
        if (await saveArtworkToSteamGrid(allGridDirs, appId, 'poster', params.customArtwork.poster)) {
          artworkStatus.poster = true;
        }
      }
      if (params.customArtwork.banner) {
        if (await saveArtworkToSteamGrid(allGridDirs, appId, 'banner', params.customArtwork.banner)) {
          artworkStatus.banner = true;
        }
      }
      if (params.customArtwork.hero) {
        if (await saveArtworkToSteamGrid(allGridDirs, appId, 'hero', params.customArtwork.hero)) {
          artworkStatus.hero = true;
        }
      }
      if (params.customArtwork.logo) {
        if (await saveArtworkToSteamGrid(allGridDirs, appId, 'logo', params.customArtwork.logo)) {
          artworkStatus.logo = true;
        }
      }
    }

    // 4.2 For any artwork slot not chosen manually, try official Steam Store CDN assets
    let steamAppId = params.resolvedSteamAppId || resolveAppIdByName(params.appName);
    if (!steamAppId && params.appName && (!artworkStatus.poster || !artworkStatus.banner || !artworkStatus.hero || !artworkStatus.logo)) {
      try {
        const cleanTerm = params.appName.replace(/\s*\([^)]*\)/g, '').replace(/[:\-_\.]/g, ' ').trim();
        const searchRes = await axios.get(
          `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(cleanTerm)}&l=russian&cc=KZ`,
          { timeout: 4000 }
        );
        const first = searchRes.data?.items?.[0];
        if (first?.id) steamAppId = first.id;
      } catch {}
    }

    if (steamAppId) {
      if (!artworkStatus.poster) {
        const posterCandidates = [
          `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_600x900.jpg`,
          `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_600x900.jpg`,
          `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/library_600x900.jpg`,
          `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/capsule_616x353.jpg`,
        ];
        for (const url of posterCandidates) {
          if (await saveArtworkToSteamGrid(allGridDirs, appId, 'poster', url)) {
            artworkStatus.poster = true;
            break;
          }
        }
      }

      if (!artworkStatus.banner) {
        const bannerCandidates = [
          `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`,
          `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`,
          `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/header.jpg`,
        ];
        for (const url of bannerCandidates) {
          if (await saveArtworkToSteamGrid(allGridDirs, appId, 'banner', url)) {
            artworkStatus.banner = true;
            break;
          }
        }
      }

      if (!artworkStatus.hero) {
        const heroCandidates = [
          `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero.jpg`,
          `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero.jpg`,
          `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`,
        ];
        for (const url of heroCandidates) {
          if (await saveArtworkToSteamGrid(allGridDirs, appId, 'hero', url)) {
            artworkStatus.hero = true;
            break;
          }
        }
      }

      if (!artworkStatus.logo) {
        const logoCandidates = [
          `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/logo.png`,
          `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/logo.png`,
        ];
        for (const url of logoCandidates) {
          if (await saveArtworkToSteamGrid(allGridDirs, appId, 'logo', url)) {
            artworkStatus.logo = true;
            break;
          }
        }
      }
    }

    // Try SteamGridDB if API key is present and any artwork is still missing
    const sgdbKey = getSteamGridDbKey();
    if (
      sgdbKey &&
      (!artworkStatus.poster || !artworkStatus.banner || !artworkStatus.hero || !artworkStatus.logo)
    ) {
      try {
        const cleanQuery = params.appName.replace(/\s*\([^)]*\)/g, '').trim();
        const searchRes = await axios.get(
          `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(cleanQuery)}`,
          {
            headers: { Authorization: `Bearer ${sgdbKey}` },
            timeout: 5000,
          }
        );

        const firstGame = searchRes.data?.data?.[0];
        if (firstGame?.id) {
          const gameId = firstGame.id;
          const headers = { Authorization: `Bearer ${sgdbKey}` };

          if (!artworkStatus.poster) {
            try {
              const gridsRes = await axios.get(
                `https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=600x900`,
                { headers, timeout: 5000 }
              );
              const imgUrl = gridsRes.data?.data?.[0]?.url;
              if (imgUrl && (await saveArtworkToSteamGrid(allGridDirs, appId, 'poster', imgUrl))) {
                artworkStatus.poster = true;
              }
            } catch {}
          }

          if (!artworkStatus.banner) {
            try {
              const bannersRes = await axios.get(
                `https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=460x215,920x430`,
                { headers, timeout: 5000 }
              );
              const imgUrl = bannersRes.data?.data?.[0]?.url;
              if (imgUrl && (await saveArtworkToSteamGrid(allGridDirs, appId, 'banner', imgUrl))) {
                artworkStatus.banner = true;
              }
            } catch {}
          }

          if (!artworkStatus.hero) {
            try {
              const heroesRes = await axios.get(`https://www.steamgriddb.com/api/v2/heroes/game/${gameId}`, {
                headers,
                timeout: 5000,
              });
              const imgUrl = heroesRes.data?.data?.[0]?.url;
              if (imgUrl && (await saveArtworkToSteamGrid(allGridDirs, appId, 'hero', imgUrl))) {
                artworkStatus.hero = true;
              }
            } catch {}
          }

          if (!artworkStatus.logo) {
            try {
              const logosRes = await axios.get(`https://www.steamgriddb.com/api/v2/logos/game/${gameId}`, {
                headers,
                timeout: 5000,
              });
              const imgUrl = logosRes.data?.data?.[0]?.url;
              if (imgUrl && (await saveArtworkToSteamGrid(allGridDirs, appId, 'logo', imgUrl))) {
                artworkStatus.logo = true;
              }
            } catch {}
          }
        }
      } catch {}
    }
  }

  return {
    success: true,
    appId,
    appName: params.appName,
    exe: cleanExe,
    startDir: cleanStartDir,
    compatTool,
    artwork: artworkStatus,
    message: `Ярлык «${params.appName}» и все обложки успешно добавлены в Steam!`,
  };
}

export function findSteamOsHelperScripts(): string[] {
  const found: string[] = [];
  const checked = new Set<string>();

  const check = (p: string) => {
    if (!p || checked.has(p)) return;
    checked.add(p);
    try {
      if (fs.existsSync(p)) {
        found.push(p);
      }
    } catch {}
  };

  // 1. Manually configured helper script path in settings
  const configured = settingsQueries.get('steamos_helper_script', '');
  if (configured) {
    check(toInternalPath(configured));
    check(configured);
  }

  // 2. Standard SteamOS / Bazzite system scripts
  const standard = [
    '/host_root/usr/bin/steamos-session-select',
    '/host_root/usr/local/bin/steamos-session-select',
    '/host_root/usr/bin/steamosctl',
    '/host_root/usr/local/bin/restart-gamescope',
    '/host_root/usr/bin/restart-gamescope',
    '/host_root/usr/local/bin/restart-steam',
    '/host_root/usr/bin/restart-steam',
    '/host_root/usr/bin/gamescope-session-steam',
    '/host_root/usr/bin/gamescope-session',
  ];
  standard.forEach(check);

  // 3. Scan /usr/local/bin for custom helper scripts
  try {
    const localBin = '/host_root/usr/local/bin';
    if (fs.existsSync(localBin)) {
      for (const f of fs.readdirSync(localBin)) {
        const lower = f.toLowerCase();
        if (lower.includes('steam') || lower.includes('gamescope') || lower.includes('gamemode') || lower.includes('session')) {
          check(path.join(localBin, f));
        }
      }
    }
  } catch {}

  // 4. Scan user directories under /home/* (e.g. /home/gamecube/bin, ~/.local/bin, ~/...)
  try {
    const homeRoot = '/host_root/home';
    if (fs.existsSync(homeRoot)) {
      const users = fs.readdirSync(homeRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
      for (const u of users) {
        const uDir = path.join(homeRoot, u.name);
        const subDirs = [
          path.join(uDir, 'bin'),
          path.join(uDir, '.local', 'bin'),
          uDir,
        ];
        for (const s of subDirs) {
          if (fs.existsSync(s)) {
            try {
              for (const f of fs.readdirSync(s)) {
                const lower = f.toLowerCase();
                if (
                  lower.endsWith('.sh') ||
                  lower.includes('steam') ||
                  lower.includes('gamescope') ||
                  lower.includes('gamemode')
                ) {
                  check(path.join(s, f));
                }
              }
            } catch {}
          }
        }
      }
    }
  } catch {}

  return found;
}

export function reloadSteamGameMode(): { success: boolean; methods: string[]; message: string } {
  if (config.isWindows) {
    return {
      success: true,
      methods: ['windows'],
      message: 'Windows: перезапустите Steam вручную для применения изменений',
    };
  }

  const executed: string[] = [];

  // Find active desktop user from /run/user/ (e.g. 1000 -> gamecube / deck)
  let activeUid = '1000';
  let activeUser = 'gamecube';

  try {
    const runUserDir = '/host_root/run/user';
    if (fs.existsSync(runUserDir)) {
      const uids = fs.readdirSync(runUserDir).filter((d) => /^\d+$/.test(d) && d !== '0');
      if (uids.length > 0) {
        activeUid = uids[0];
      }
    }
  } catch {}

  try {
    const passwdPath = '/host_root/etc/passwd';
    if (fs.existsSync(passwdPath)) {
      const lines = fs.readFileSync(passwdPath, 'utf-8').split('\n');
      for (const line of lines) {
        const parts = line.split(':');
        if (parts[2] === activeUid) {
          activeUser = parts[0];
          break;
        }
      }
    }
  } catch {}

  // 1. First priority: Execute detected helper scripts for SteamOS / Gamescope
  const helpers = findSteamOsHelperScripts();
  console.log(`[Steam] Found helper scripts on host (user: ${activeUser}, UID: ${activeUid}):`, helpers);

  for (const script of helpers) {
    const hostPath = toCleanPath(script);
    const basename = path.basename(script);

    try {
      if (basename === 'steamos-session-select') {
        console.log(`[Steam] Executing: steamos-session-select gamescope`);
        execSync(`chroot /host_root ${hostPath} gamescope 2>/dev/null || true`, { timeout: 4000, stdio: 'ignore' });
        executed.push(`steamos-session-select gamescope`);
      } else if (basename !== 'gamescope-session-steam' && basename !== 'gamescope-session') {
        // Run custom user helper script directly as active user
        console.log(`[Steam] Executing custom helper: ${hostPath}`);
        execSync(
          `chroot /host_root runuser -u ${activeUser} -- ${hostPath} 2>/dev/null || chroot /host_root ${hostPath} 2>/dev/null || true`,
          { timeout: 5000, stdio: 'ignore' }
        );
        executed.push(basename);
      }
    } catch (err: any) {
      console.warn(`[Steam] Helper script ${basename} failed:`, err.message);
    }
  }

  // 2. Restart Gamescope session cleanly through user systemd (keeps Gamescope compositor alive)
  try {
    console.log(`[Steam] Restarting gamescope-session via systemd --user for ${activeUser}...`);
    execSync(
      `chroot /host_root runuser -u ${activeUser} -- env XDG_RUNTIME_DIR=/run/user/${activeUid} DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/${activeUid}/bus systemctl --user restart gamescope-session 2>/dev/null || ` +
      `chroot /host_root runuser -u ${activeUser} -- env XDG_RUNTIME_DIR=/run/user/${activeUid} DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/${activeUid}/bus systemctl --user restart gamescope-session-steam 2>/dev/null || true`,
      { timeout: 4000, stdio: 'ignore' }
    );
    executed.push('systemctl --user restart gamescope-session');
  } catch {}

  // 3. Ensure Gamescope is the selected session for SteamOS
  const hasSessionSelect = fs.existsSync('/host_root/usr/bin/steamos-session-select') || fs.existsSync('/host_root/usr/local/bin/steamos-session-select');
  if (hasSessionSelect) {
    try {
      execSync('chroot /host_root steamos-session-select gamescope 2>/dev/null || true', { timeout: 3000, stdio: 'ignore' });
      executed.push('steamos-session-select gamescope');
    } catch {}
  }

  // 4. Clean graceful steam -shutdown (NEVER use pkill -f "/steam", which kills gamescope-session-steam and crashes SDDM!)
  try {
    execSync(`chroot /host_root runuser -u ${activeUser} -- steam -shutdown 2>/dev/null || chroot /host_root steam -shutdown 2>/dev/null || true`, {
      timeout: 3000,
      stdio: 'ignore',
    });
    executed.push('steam -shutdown');
  } catch {}

  return {
    success: true,
    methods: executed,
    message: `Команда отправлена через композитор Gamescope (${executed.join(', ') || 'steam -shutdown'}). Интерфейс перезапустится в Game Mode без вылета в SDDM.`,
  };
}

export function isSafeGameFolderToDelete(targetPath: string): { safe: boolean; reason?: string; resolvedPath?: string } {
  if (!targetPath || typeof targetPath !== 'string') {
    return { safe: false, reason: 'Не указан путь к каталогу' };
  }

  const clean = toCleanPath(targetPath.trim().replace(/^["]+|["]+$/g, ''));
  const internal = toInternalPath(clean);

  // Normalize path
  const normalized = path.resolve(internal).toLowerCase();

  // Guard against dangerous root or system folders
  const dangerous = [
    '/', '/bin', '/boot', '/dev', '/etc', '/home', '/lib', '/lib64', '/media',
    '/mnt', '/opt', '/proc', '/root', '/run', '/sbin', '/srv', '/sys', '/tmp', '/usr', '/var',
    '/host_root', '/host_root/home', '/host_root/mnt', '/host_root/usr',
    '/host_root/home/gamecube', '/host_root/home/deck',
    '/home/gamecube', '/home/deck',
    '/mnt/game_data',
    '/mnt/game_data/steamlibrary',
    '/mnt/game_data/steamlibrary/steamapps',
    '/mnt/game_data/steamlibrary/steamapps/common',
  ];

  for (const d of dangerous) {
    if (normalized === path.resolve(d).toLowerCase() || normalized === path.resolve(toInternalPath(d)).toLowerCase()) {
      return { safe: false, reason: `Запрещено удалять системный или корневой каталог: ${clean}` };
    }
  }

  // Must have at least 3 path segments
  const parts = clean.split(/[/\\]/).filter(Boolean);
  if (parts.length < 3) {
    return { safe: false, reason: 'Слишком короткий путь каталога для безопасного удаления' };
  }

  return { safe: true, resolvedPath: internal };
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

      // Auto-repair / normalize any existing CompatToolMapping entries in config.vdf & localconfig.vdf
      const files = getSteamConfigFiles();
      for (const file of files) {
        try {
          let content = fs.readFileSync(file, 'utf-8');
          let modified = false;
          if (content.includes('"Proton Experimental"')) {
            content = content.replace(/"name"\s+"Proton Experimental"/g, '"name"\t\t"proton_experimental"');
            modified = true;
          }
          if (content.includes('"Proton 9.0"')) {
            content = content.replace(/"name"\s+"Proton 9\.0"/g, '"name"\t\t"proton_9"');
            modified = true;
          }
          if (modified) {
            fs.writeFileSync(file, content, 'utf-8');
          }
        } catch {}
      }

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

    const chosenTool = normalizeCompatTool(compatTool || 'proton_experimental');

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
      compat_tool: chosenTool,
    };

    parsed.shortcuts[String(existingIndex)] = newShortcut;

    const newBuffer = serializeBinaryVdf(parsed);
    fs.writeFileSync(steamPaths.shortcutsFile, newBuffer);

    // Apply Proton compatibility mapping
    applyCompatToolMapping(appId, chosenTool);

    return {
      message: 'Shortcut added successfully',
      appId,
      shortcut: newShortcut,
      shortcutsFile: steamPaths.shortcutsFile,
    };
  });

  // Scan folder for executable candidates (.exe, .sh, .bin, .AppImage)
  fastify.get('/scan-executables', async (request, reply) => {
    const { path: dirPath } = request.query as { path?: string };
    if (!dirPath) {
      return reply.status(400).send({ error: 'path parameter is required' });
    }

    try {
      const result = scanGameExecutables(dirPath);
      return result;
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to scan executables: ${err.message}` });
    }
  });

  // Get artwork candidates (posters, banners, heroes, logos) from Steam CDN & SteamGridDB
  fastify.get('/artwork-candidates', async (request, reply) => {
    const { name, appId } = request.query as { name?: string; appId?: string };
    if (!name && !appId) {
      return reply.status(400).send({ error: 'name or appId parameter is required' });
    }

    const numAppId = appId ? parseInt(appId, 10) : null;
    try {
      const candidates = await getArtworkCandidates(name || '', numAppId);
      return candidates;
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to fetch artwork candidates: ${err.message}` });
    }
  });

  // 1-Click Auto Add Shortcut With Artwork (Posters, Banners, Heroes, Logos)
  fastify.post('/shortcuts/auto-create', async (request, reply) => {
    const {
      appName,
      gamePath,
      exe,
      startDir,
      compatTool,
      launchOptions,
      installArtwork = true,
      resolvedSteamAppId,
      customArtwork,
    } = request.body as {
      appName?: string;
      gamePath?: string;
      exe?: string;
      startDir?: string;
      compatTool?: string;
      launchOptions?: string;
      installArtwork?: boolean;
      resolvedSteamAppId?: number;
      customArtwork?: {
        poster?: string;
        banner?: string;
        hero?: string;
        logo?: string;
      };
    };

    if (!appName && !gamePath) {
      return reply.status(400).send({ error: 'appName or gamePath is required' });
    }

    const resolvedAppName = appName || (gamePath ? path.basename(gamePath) : 'Unknown Game');
    const resolvedGamePath = gamePath || (exe ? path.dirname(exe) : '');

    try {
      const result = await autoCreateShortcut({
        appName: resolvedAppName,
        gamePath: resolvedGamePath,
        exe,
        startDir,
        compatTool,
        launchOptions,
        installArtwork,
        resolvedSteamAppId,
        customArtwork,
      });

      // Automatically trigger safe reload in SteamOS on the fly via compositor
      if (!config.isWindows) {
        try {
          reloadSteamGameMode();
        } catch (e: any) {
          console.warn('[Steam] Auto reload game mode failed:', e.message);
        }
      }

      return result;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Delete shortcut from shortcuts.vdf across all user directories (with optional disk deletion)
  fastify.delete('/shortcuts/:appId', async (request, reply) => {
    const { appId } = request.params as { appId: string };
    const { deleteFiles, gamePath } = request.query as { deleteFiles?: string; gamePath?: string };
    const shouldDeleteFiles = deleteFiles === 'true' || deleteFiles === '1';
    const targetId = parseInt(appId, 10);
    const allUserDirs = findAllSteamUserConfigDirs();
    if (allUserDirs.length === 0) {
      return reply.status(404).send({ error: 'Каталоги пользователей Steam не найдены' });
    }

    let deletedAny = false;
    let candidateDir: string | null = gamePath || null;

    for (const steamPaths of allUserDirs) {
      if (!fs.existsSync(steamPaths.shortcutsFile)) continue;
      try {
        const buf = fs.readFileSync(steamPaths.shortcutsFile);
        const parsed = parseBinaryVdf(buf);
        const rawShortcuts = parsed.shortcuts || {};

        let found = false;
        const newShortcuts: Record<string, any> = {};
        let newIdx = 0;

        for (const [k, v] of Object.entries(rawShortcuts)) {
          if ((v as any).appid === targetId) {
            found = true;
            deletedAny = true;
            if (!candidateDir) {
              const startDir = ((v as any).StartDir || '').replace(/^["]+|["]+$/g, '');
              const exe = ((v as any).Exe || '').replace(/^["]+|["]+$/g, '');
              candidateDir = startDir || (exe ? path.dirname(exe) : null);
            }
            continue;
          }
          newShortcuts[String(newIdx++)] = v;
        }

        if (found) {
          parsed.shortcuts = newShortcuts;
          fs.writeFileSync(steamPaths.shortcutsFile, serializeBinaryVdf(parsed));
        }

        // Clean up grid artwork files
        if (fs.existsSync(steamPaths.gridDir)) {
          const shortId = String(targetId);
          const longId = ((BigInt(targetId) << 32n) | 0x02000000n).toString();
          const gridFiles = fs.readdirSync(steamPaths.gridDir);
          for (const gf of gridFiles) {
            if (gf.startsWith(shortId) || gf.startsWith(longId)) {
              try {
                fs.unlinkSync(path.join(steamPaths.gridDir, gf));
              } catch {}
            }
          }
        }
      } catch (err: any) {
        console.warn(`[Steam] Error removing shortcut from ${steamPaths.shortcutsFile}:`, err.message);
      }
    }

    // Also remove from CompatToolMapping in config.vdf and localconfig.vdf
    removeCompatToolMapping(targetId);

    // If requested, delete game folder completely from disk
    let diskMessage = '';
    if (shouldDeleteFiles && candidateDir) {
      const check = isSafeGameFolderToDelete(candidateDir);
      if (check.safe && check.resolvedPath && fs.existsSync(check.resolvedPath)) {
        try {
          console.log(`[Steam] User deleting game directory from disk: ${check.resolvedPath}`);
          fs.rmSync(check.resolvedPath, { recursive: true, force: true });
          diskMessage = ` и каталог «${toCleanPath(candidateDir)}» удален с накопителя`;
        } catch (e: any) {
          console.warn(`[Steam] Failed to delete directory ${candidateDir}:`, e.message);
          diskMessage = ` (не удалось удалить файлы с диска: ${e.message})`;
        }
      }
    }

    // Auto-reload Game Mode
    try {
      reloadSteamGameMode();
    } catch {}

    if (!deletedAny) {
      return reply.status(404).send({ error: 'Ярлык не найден в shortcuts.vdf' });
    }

    return { message: `Ярлык и обложки успешно удалены из Steam${diskMessage}`, appId: targetId };
  });

  // Delete non-Steam local game folder directly from disk
  fastify.post('/delete-local-game', async (request, reply) => {
    const { path: rawPath, removeShortcuts = true } = request.body as {
      path: string;
      removeShortcuts?: boolean;
    };

    if (!rawPath) {
      return reply.status(400).send({ error: 'Путь к каталогу игры обязателен' });
    }

    const check = isSafeGameFolderToDelete(rawPath);
    if (!check.safe || !check.resolvedPath) {
      return reply.status(400).send({ error: check.reason || 'Недопустимый каталог для удаления' });
    }

    if (!fs.existsSync(check.resolvedPath)) {
      return reply.status(404).send({ error: `Каталог игры не найден на диске: ${rawPath}` });
    }

    try {
      console.log(`[Steam] Deleting local game folder from disk: ${check.resolvedPath}`);
      fs.rmSync(check.resolvedPath, { recursive: true, force: true });

      // Clean up shortcuts pointing to this folder
      if (removeShortcuts) {
        const cleanTarget = toCleanPath(rawPath).toLowerCase();
        const allUserDirs = findAllSteamUserConfigDirs();
        for (const steamPaths of allUserDirs) {
          if (!fs.existsSync(steamPaths.shortcutsFile)) continue;
          try {
            const buf = fs.readFileSync(steamPaths.shortcutsFile);
            const parsed = parseBinaryVdf(buf);
            const rawShortcuts = parsed.shortcuts || {};
            const newShortcuts: Record<string, any> = {};
            let newIdx = 0;
            let modified = false;

            for (const [k, v] of Object.entries(rawShortcuts)) {
              const startDir = ((v as any).StartDir || '').replace(/^["]+|["]+$/g, '').toLowerCase();
              const exe = ((v as any).Exe || '').replace(/^["]+|["]+$/g, '').toLowerCase();
              if (startDir.includes(cleanTarget) || exe.includes(cleanTarget)) {
                modified = true;
                const sId = (v as any).appid;
                if (sId) {
                  removeCompatToolMapping(sId);
                  if (fs.existsSync(steamPaths.gridDir)) {
                    const shortId = String(sId);
                    const longId = ((BigInt(sId) << 32n) | 0x02000000n).toString();
                    for (const gf of fs.readdirSync(steamPaths.gridDir)) {
                      if (gf.startsWith(shortId) || gf.startsWith(longId)) {
                        try {
                          fs.unlinkSync(path.join(steamPaths.gridDir, gf));
                        } catch {}
                      }
                    }
                  }
                }
                continue;
              }
              newShortcuts[String(newIdx++)] = v;
            }

            if (modified) {
              parsed.shortcuts = newShortcuts;
              fs.writeFileSync(steamPaths.shortcutsFile, serializeBinaryVdf(parsed));
            }
          } catch {}
        }
      }

      try {
        reloadSteamGameMode();
      } catch {}

      return {
        success: true,
        message: `Каталог игры «${toCleanPath(rawPath)}» успешно удален с диска`,
      };
    } catch (err: any) {
      return reply.status(500).send({
        error: `Не удалось удалить каталог игры: ${err.message}`,
      });
    }
  });

  // Restart Steam client on host to reload shortcuts and artworks in Game Mode
  fastify.post('/restart-steam', async (request, reply) => {
    try {
      console.log('[Steam] Triggering compositor-safe Game Mode reload...');
      const result = reloadSteamGameMode();
      return result;
    } catch (err: any) {
      return reply.status(500).send({
        error: 'Не удалось отправить команду перезапуска в Gamescope',
        details: err.message,
      });
    }
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
