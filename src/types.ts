export interface PluginConfig {
  commandName: string;
  commandAlias: string;
  generationTip: string;
  recallMessages: string[];
  waitForTimeout: number;
  imageMode: boolean;
  screenshotQuality?: number;
  searchListCount: number;
  nextPageCommand: string;
  prevPageCommand: string;
  exitCommandList: string[];
  menuExitCommandTip: boolean;
  maxSongDuration: number;
  enableRateLimit: boolean;
  rateLimitScope?: 'user' | 'channel' | 'platform';
  rateLimitInterval?: number;
  type: 'apis' | 'custom';
  metingAPI?: string;
  text?: string;
  useProxy: boolean;
  srcToWhat: 'text' | 'audio' | 'audiobuffer' | 'video' | 'file';
  loggerinfo: boolean;
}

export interface SongData {
  id: number;
  name: string;
  artists: string;
  albumName: string;
  duration: number;
}

export interface NetEaseSearchResponse {
  result?: {
    songs?: NetEaseSongItem[];
  };
}

export interface NetEaseSongItem {
  id: number;
  name: string;
  artists: { name: string }[];
  album: { name: string };
  duration: number;
}
