/**
 * Binary KeyValues (shortcuts.vdf) parser and serializer for Valve Steam.
 * Format specifications:
 * Type 0: None / Sub-dictionary (begins map)
 * Type 1: String (null-terminated string)
 * Type 2: Int32 (4-byte little-endian signed integer)
 * Type 8: End of dictionary
 */

export interface SteamShortcut {
  appid?: number;
  AppName: string;
  Exe: string;
  StartDir: string;
  icon?: string;
  ShortcutPath?: string;
  LaunchOptions?: string;
  IsHidden?: number;
  AllowDesktopConfig?: number;
  AllowOverlay?: number;
  OpenVR?: number;
  Devkit?: number;
  DevkitGameID?: string;
  DevkitOverrideAppID?: number;
  LastPlayTime?: number;
  FlatpakAppID?: string;
  tags?: Record<string, string>;
  compat_tool?: string;
}

export function parseBinaryVdf(buffer: Buffer): Record<string, any> {
  let offset = 0;

  function readString(): string {
    const start = offset;
    while (offset < buffer.length && buffer[offset] !== 0) {
      offset++;
    }
    const str = buffer.toString('utf-8', start, offset);
    offset++; // Skip null terminator
    return str;
  }

  function parseMap(): Record<string, any> {
    const map: Record<string, any> = {};

    while (offset < buffer.length) {
      const type = buffer[offset++];
      if (type === 0x08) {
        // End of map
        break;
      }

      const key = readString();

      switch (type) {
        case 0x00: // Sub-dictionary
          map[key] = parseMap();
          break;
        case 0x01: // String
          map[key] = readString();
          break;
        case 0x02: // Int32
          if (offset + 4 <= buffer.length) {
            map[key] = key.toLowerCase() === 'appid' ? buffer.readUInt32LE(offset) : buffer.readInt32LE(offset);
            offset += 4;
          }
          break;
        default:
          // Unhandled type, skip
          break;
      }
    }

    return map;
  }

  return parseMap();
}

export function serializeBinaryVdf(data: Record<string, any>): Buffer {
  const buffers: Buffer[] = [];

  function writeString(str: string) {
    buffers.push(Buffer.from(str, 'utf-8'));
    buffers.push(Buffer.from([0x00]));
  }

  function writeMap(key: string, map: Record<string, any>) {
    buffers.push(Buffer.from([0x00]));
    writeString(key);
    for (const [subKey, val] of Object.entries(map)) {
      if (val === null || val === undefined) continue;

      if (typeof val === 'object') {
        writeMap(subKey, val);
      } else if (typeof val === 'number') {
        buffers.push(Buffer.from([0x02]));
        writeString(subKey);
        const intBuf = Buffer.alloc(4);
        intBuf.writeInt32LE(val | 0, 0);
        buffers.push(intBuf);
      } else {
        buffers.push(Buffer.from([0x01]));
        writeString(subKey);
        writeString(String(val));
      }
    }
    buffers.push(Buffer.from([0x08]));
  }

  for (const [key, val] of Object.entries(data)) {
    if (typeof val === 'object') {
      writeMap(key, val);
    }
  }

  buffers.push(Buffer.from([0x08]));

  return Buffer.concat(buffers);
}

/**
 * Calculates deterministic non-steam game AppID using Valve's standard algorithm:
 * CRC32(Exe + AppName) | 0x80000000
 */
export function generateSteamAppId(exe: string, appName: string): number {
  const combined = exe + appName;
  let crc = 0 ^ -1;
  for (let i = 0; i < combined.length; i++) {
    const code = combined.charCodeAt(i);
    crc = (crc >>> 8) ^ crcTable[(crc ^ code) & 0xff];
  }
  const unsigned = (crc ^ -1) >>> 0;
  return (unsigned | 0x80000000) >>> 0;
}

// Standard CRC32 table
const crcTable: number[] = (() => {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c);
  }
  return table;
})();
