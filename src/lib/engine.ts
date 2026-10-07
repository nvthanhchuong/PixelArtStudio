import { History, type Change } from './history';
import { hexToPixel, pixelToHex } from './colors';
import { line, type Point } from './coordinates';
// Pixel data and strokes stay outside React. Subscribers schedule Canvas repaint.
export class PixelEngine {
  width = 32; height = 32;
  documentVersion = 0;
  pixels = new Uint32Array(32 * 32);
  history = new History();
  private stroke = new Map<number, number>();
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach(listener => listener()); }
  begin() { this.stroke.clear(); }
  paint(from: Point, to: Point, color: string | null, size: number) {
    const value = color ? hexToPixel(color) : 0;
    const start = { x: Math.floor(from.x / size), y: Math.floor(from.y / size) }, end = { x: Math.floor(to.x / size), y: Math.floor(to.y / size) };
    line(start, end, (cx, cy) => {
      for (let y = Math.max(0, cy * size); y < Math.min(this.height, (cy + 1) * size); y++) {
        for (let x = Math.max(0, cx * size); x < Math.min(this.width, (cx + 1) * size); x++) {
          const index = y * this.width + x;
          if (!this.stroke.has(index)) this.stroke.set(index, this.pixels[index]);
          this.pixels[index] = value;
        }
      }
    }); this.emit();
  }
  commit() {
    const changes: Change[] = [];
    this.stroke.forEach((before, index) => { if (before !== this.pixels[index]) changes.push({ index, before, after: this.pixels[index] }); });
    this.history.push(changes); this.stroke.clear(); return changes.length > 0;
  }
  cancel() { this.stroke.forEach((before, index) => { this.pixels[index] = before; }); this.stroke.clear(); this.emit(); }
  undo() {
    const changes = this.history.past.pop(); if (!changes) return false;
    changes.forEach(c => { this.pixels[c.index] = c.before; }); this.history.future.push(changes); this.emit(); return true;
  }
  redo() {
    const changes = this.history.future.pop(); if (!changes) return false;
    changes.forEach(c => { this.pixels[c.index] = c.after; }); this.history.past.push(changes); this.emit(); return true;
  }
  reset(width: number, height: number, pixels?: Uint32Array) {
    this.documentVersion++;
    this.width = width; this.height = height; this.pixels = pixels ? pixels.slice() : new Uint32Array(width * height);
    this.stroke.clear(); this.history.clear(); this.emit();
  }
  sample(point: Point) {
    if (point.x < 0 || point.y < 0 || point.x >= this.width || point.y >= this.height) return null;
    const pixel = this.pixels[point.y * this.width + point.x]; return pixel & 255 ? pixelToHex(pixel) : null;
  }
  get hasArtwork() { return this.pixels.some(pixel => pixel !== 0); }
  rgba() {
    const data = new Uint8ClampedArray(this.pixels.length * 4);
    this.pixels.forEach((p, i) => { data[i * 4] = p >>> 24; data[i * 4 + 1] = (p >>> 16) & 255; data[i * 4 + 2] = (p >>> 8) & 255; data[i * 4 + 3] = p & 255; });
    return data;
  }
}
