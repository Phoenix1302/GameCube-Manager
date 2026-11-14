import crypto from 'crypto';

export interface AvatarInfo {
  initial: string;
  hue: number;
  color: string;
  secondaryColor: string;
  gradient: string;
  svg: string;
}

/**
 * Computes deterministic avatar metadata for a given username.
 * Extracts the first letter (uppercase) and computes an HSL color from sha256 hash.
 */
export function getAvatarData(username: string): AvatarInfo {
  const cleanName = (username || '').trim();
  const initial = cleanName.charAt(0).toUpperCase() || '?';

  // Compute sha256 hash for deterministic distribution
  const hash = crypto.createHash('sha256').update(cleanName.toLowerCase()).digest('hex');
  const hashNumber = parseInt(hash.substring(0, 8), 16);

  // Hue: 0-359 deg
  const hue = hashNumber % 360;
  // Saturation: 68%, Lightness: 48% (ensures high contrast with white text)
  const color = `hsl(${hue}, 70%, 48%)`;
  const secondaryColor = `hsl(${(hue + 40) % 360}, 75%, 40%)`;
  const gradient = `linear-gradient(135deg, ${color}, ${secondaryColor})`;

  const svg = generateAvatarSvg(initial, hue);

  return {
    initial,
    hue,
    color,
    secondaryColor,
    gradient,
    svg,
  };
}

/**
 * Generates an SVG avatar circle with deterministic colors and initial
 */
export function generateAvatarSvg(initial: string, hue: number, size = 64): string {
  const color1 = `hsl(${hue}, 70%, 48%)`;
  const color2 = `hsl(${(hue + 40) % 360}, 75%, 40%)`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="grad-${hue}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color1}" />
      <stop offset="100%" stop-color="${color2}" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size / 2}" fill="url(#grad-${hue})" />
  <text x="50%" y="54%" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="${Math.round(size * 0.48)}" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">
    ${initial}
  </text>
</svg>`;
}
