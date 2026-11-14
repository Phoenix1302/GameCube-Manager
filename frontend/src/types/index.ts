export interface AvatarInfo {
  initial: string;
  hue: number;
  color: string;
  secondaryColor: string;
  gradient: string;
  svg: string;
}

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'user';
  avatar: AvatarInfo;
  createdAt?: string;
  created_at?: string;
}

export interface Game {
  id: number;
  name: string;
  headerImage: string;
  discountPercent?: number;
  originalPrice?: number | string | null;
  finalPrice?: number | null;
  priceText?: string;
  releaseDate?: string;
  currency?: string;
  windows?: boolean;
  mac?: boolean;
  linux?: boolean;
  tinyImage?: string;
  isFree?: boolean;
}

export interface ProtonSummary {
  appId: string;
  tier: 'platinum' | 'gold' | 'silver' | 'bronze' | 'borked' | 'unknown' | string;
  confidence: string;
  score: number;
  total: number;
  url?: string;
}

export interface GameDetails {
  appId: number;
  name: string;
  shortDescription: string;
  headerImage: string;
  website: string;
  developers: string[];
  publishers: string[];
  genres: string[];
  releaseDate: string;
  isFree: boolean;
  platforms: {
    windows: boolean;
    mac: boolean;
    linux: boolean;
  };
  screenshots: Array<{
    thumbnail: string;
    full: string;
  }>;
  prices: {
    kz: {
      available: boolean;
      currency: string;
      symbol?: string;
      initial?: number;
      final?: number;
      discountPercent?: number;
      formatted: string;
      isFree?: boolean;
      statusText?: string;
    };
    ru: {
      available: boolean;
      currency: string;
      symbol?: string;
      initial?: number;
      final?: number;
      discountPercent?: number;
      formatted: string;
      isFree?: boolean;
      statusText?: string;
    };
  };
  protonDb: ProtonSummary;
  steamStoreUrl: string;
}

export interface WishlistItem {
  id: number;
  user_id: number;
  app_id: string;
  title: string;
  img_url: string;
  genres: string;
  release_date: string;
  created_at: string;
}

export interface TorrentItem {
  hash: string;
  name: string;
  size: number;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  eta: number;
  state: string;
  seeds: number;
  totalSeeds: number;
  peers: number;
  totalPeers: number;
  savePath: string;
  addedOn: number;
  ratio: number;
}

export interface TorrentTransfer {
  dlSpeed: number;
  upSpeed: number;
  dlTotal: number;
  upTotal: number;
}

export interface SystemStats {
  timestamp: number;
  uptime: number;
  os: {
    platform: string;
    distro: string;
    release: string;
    hostname: string;
  };
  cpu: {
    brand: string;
    cores: number;
    speed: number;
    loadPercentage: number;
    coresLoad: number[];
    temperature: number | null;
  };
  memory: {
    total: number;
    used: number;
    available: number;
    percent: number;
    free?: number;
    active?: number;
    cached?: number;
    buffers?: number;
    swapTotal?: number;
    swapUsed?: number;
    swapFree?: number;
    swapPercent?: number;
  };
  disks: Array<{
    fs: string;
    type: string;
    size: number;
    used: number;
    available: number;
    use: number;
    mount: string;
  }>;
  network: Array<{
    iface: string;
    operstate: string;
    rx_sec: number;
    tx_sec: number;
    rx_bytes: number;
    tx_bytes: number;
  }>;
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  size: number;
  mtime: string;
  permissions: string;
}

export interface SteamShortcut {
  appid?: number;
  AppName: string;
  Exe: string;
  StartDir: string;
  LaunchOptions?: string;
  compat_tool?: string;
  tags?: Record<string, string>;
}

export interface SteamGridAsset {
  id: number;
  url: string;
  thumb: string;
  width: number;
  height: number;
}

export interface SetupStatus {
  initialized: boolean;
  version: string;
  appName?: string;
}

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

