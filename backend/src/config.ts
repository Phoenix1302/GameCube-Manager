import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const isWindows = process.platform === 'win32';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'gamecube-super-secret-key-change-in-production',
  hostRoot: process.env.HOST_ROOT || (isWindows ? 'C:\\' : '/host_root'),
  steamUserDataPath: process.env.STEAM_USERDATA_PATH || (isWindows ? 'C:\\Program Files (x86)\\Steam\\userdata' : '/host_root/home/gamecube/.local/share/Steam/userdata'),
  steamLibraryPath: process.env.STEAM_LIBRARY_PATH || (isWindows ? 'D:\\SteamLibrary' : '/host_root/mnt/game_data/SteamLibrary'),
  customGamesPath: process.env.CUSTOM_GAMES_PATH || (isWindows ? 'D:\\Games' : '/mnt/game_data/Games'),
  qbittorrent: {
    url: process.env.QBITTORRENT_URL || 'http://127.0.0.1:8085',
    username: process.env.QBITTORRENT_USER || 'admin',
    password: process.env.QBITTORRENT_PASS || 'adminadmin',
  },
  steamGridDbApiKey: process.env.STEAMGRIDDB_API_KEY || '',
  dataDir: process.env.DATA_DIR || path.resolve(process.cwd(), 'data'),
  dbPath: process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'gamecube.db'),
  isWindows,
};
