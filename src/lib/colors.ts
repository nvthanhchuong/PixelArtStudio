export const families = [
  { name: 'Red', hue: 0, color: '#ef5969' }, { name: 'Orange', hue: 27, color: '#ef994b' },
  { name: 'Yellow', hue: 48, color: '#edcd54' }, { name: 'Green', hue: 135, color: '#64b987' },
  { name: 'Cyan', hue: 185, color: '#57c7cd' }, { name: 'Blue', hue: 218, color: '#618ee6' },
  { name: 'Purple', hue: 265, color: '#9470dc' }, { name: 'Pink', hue: 325, color: '#dc80b3' },
  { name: 'Brown', hue: 25, color: '#a37e65' }, { name: 'Gray', hue: 0, color: '#8b919c' },
] as const;
export type Family = typeof families[number]['name'];
export function hslToHex(h: number, s: number, l: number) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}
export function generateShades(family: Family) {
  const { hue } = families.find(f => f.name === family)!;
  return Array.from({ length: 100 }, (_, i) => {
    const x = i % 10, y = Math.floor(i / 10);
    if (family === 'Gray') return hslToHex(215, x * 1.5, 97 - i * .91);
    return hslToHex(hue + (x - 4.5) * 1.1, family === 'Brown' ? 20 + x * 5 : 28 + x * 7.5, (family === 'Brown' ? 86 : 95) - y * 8.5);
  });
}
export function hexToPixel(hex: string) { return ((parseInt(hex.slice(1), 16) << 8) | 255) >>> 0; }
export function pixelToHex(pixel: number) { return `#${(pixel >>> 8).toString(16).padStart(6, '0')}`.toUpperCase(); }
