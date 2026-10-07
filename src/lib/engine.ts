import { History, HISTORY_LIMIT, HISTORY_PIXEL_BUDGET, type Change } from './history';
import { hexToPixel, pixelToHex } from './colors';
import { line, type Point } from './coordinates';
import { DEFAULT_FRAME_DURATION, MAX_FRAMES, MAX_ANIMATION_PIXELS, validDuration, validFrames, type FrameData } from './animation';
export type PixelFrame = FrameData & { id: number; history: History; revision: number };
// Pixel data and strokes stay outside React. Subscribers schedule Canvas repaint.
export class PixelEngine {
  width = 32; height = 32;
  documentVersion = 0;
  animationVersion = 0;
  activeFrame = 0;
  private nextFrameId = 1;
  private frameList: PixelFrame[] = [];
  private preview: number | null = null;
  private stroke = new Map<number, number>();
  private drawing = false;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  constructor() { this.frameList = [this.makeFrame(new Uint32Array(32 * 32))]; }
  private makeFrame(pixels: Uint32Array, duration = DEFAULT_FRAME_DURATION): PixelFrame {
    return { id: this.nextFrameId++, pixels, duration, history: new History(), revision: 0 };
  }
  get frames(): readonly PixelFrame[] { return this.frameList; }
  get pixels() { return this.frameList[this.activeFrame].pixels; }
  get history() { return this.frameList[this.activeFrame].history; }
  get playing() { return this.preview !== null; }
  get displayFrame() { return this.preview ?? this.activeFrame; }
  get canAddFrame() { return this.frameList.length < MAX_FRAMES && (this.frameList.length + 1) * this.width * this.height <= MAX_ANIMATION_PIXELS; }
  private emit(animation = false) { if (animation) this.animationVersion++; this.listeners.forEach(listener => listener()); }
  begin() { this.stroke.clear(); this.drawing = true; }
  get isDrawing() { return this.drawing; }
  snapshotPixels(frameIndex = this.activeFrame) {
    const pixels = this.frameList[frameIndex].pixels.slice();
    // Autosave must not retain a tentative one-finger stroke canceled by a pinch.
    if (this.drawing && frameIndex === this.activeFrame) this.stroke.forEach((before, index) => { pixels[index] = before; });
    return pixels;
  }
  snapshotFrames(): FrameData[] { return this.frameList.map((frame, index) => ({ pixels: this.snapshotPixels(index), duration: frame.duration })); }
  selectFrame(index: number) {
    if (this.drawing || !Number.isInteger(index) || index < 0 || index >= this.frameList.length) return false;
    this.preview = null; this.activeFrame = index; this.emit(true); return true;
  }
  addFrame(duplicate = false) {
    if (this.drawing || !this.canAddFrame) return false;
    this.preview = null;
    const frame = this.makeFrame(duplicate ? this.pixels.slice() : new Uint32Array(this.width * this.height), this.frameList[this.activeFrame].duration);
    this.frameList.splice(++this.activeFrame, 0, frame); this.emit(true); return true;
  }
  deleteFrame() {
    if (this.drawing || this.frameList.length <= 1) return false;
    this.preview = null; this.frameList.splice(this.activeFrame, 1);
    this.activeFrame = Math.min(this.activeFrame, this.frameList.length - 1); this.emit(true); return true;
  }
  setFrameDuration(duration: number) {
    if (!validDuration(duration) || this.playing || duration === this.frameList[this.activeFrame].duration) return false;
    this.frameList[this.activeFrame].duration = duration; this.emit(true); return true;
  }
  startPlayback() {
    if (this.drawing || this.frameList.length < 2) return false;
    this.preview = this.activeFrame; this.emit(true); return true;
  }
  advancePlayback() { if (this.preview !== null) { this.preview = (this.preview + 1) % this.frameList.length; this.emit(true); } }
  stopPlayback() { if (this.preview !== null) { this.preview = null; this.emit(true); } }
  private trimHistory() {
    const histories = this.frameList.map(frame => frame.history);
    let actions = histories.reduce((sum, h) => sum + h.past.length + h.future.length, 0);
    let pixels = histories.reduce((sum, h) => sum + [...h.past, ...h.future].reduce((count, action) => count + action.length, 0), 0);
    // Bound history across the whole animation, keeping the current frame's newest edits.
    while (actions > HISTORY_LIMIT || pixels > HISTORY_PIXEL_BUDGET) {
      const other = histories.find(h => h !== this.history && (h.past.length || h.future.length));
      const history = other ?? this.history;
      const removed = history.past.length ? history.past.shift()! : history.future.pop()!;
      actions--; pixels -= removed.length;
    }
  }
  paint(from: Point, to: Point, color: string | null, size: number) {
    const value = color ? hexToPixel(color) : 0;
    const pixels = this.pixels;
    let changed = false;
    const start = { x: Math.floor(from.x / size), y: Math.floor(from.y / size) }, end = { x: Math.floor(to.x / size), y: Math.floor(to.y / size) };
    line(start, end, (cx, cy) => {
      for (let y = Math.max(0, cy * size); y < Math.min(this.height, (cy + 1) * size); y++) {
        for (let x = Math.max(0, cx * size); x < Math.min(this.width, (cx + 1) * size); x++) {
          const index = y * this.width + x;
          if (pixels[index] === value) continue;
          if (!this.stroke.has(index)) this.stroke.set(index, pixels[index]);
          // Replace the cell's RGBA value; repeated marks never create layers.
          pixels[index] = value;
          changed = true;
        }
      }
    });
    if (changed) this.emit();
  }
  commit() {
    const changes: Change[] = [];
    this.stroke.forEach((before, index) => { if (before !== this.pixels[index]) changes.push({ index, before, after: this.pixels[index] }); });
    this.history.push(changes); this.stroke.clear(); this.drawing = false;
    if (changes.length) { this.frameList[this.activeFrame].revision++; this.trimHistory(); this.emit(true); }
    return changes.length > 0;
  }
  cancel() { this.stroke.forEach((before, index) => { this.pixels[index] = before; }); this.stroke.clear(); this.drawing = false; this.emit(); }
  undo() {
    if (this.drawing || this.playing) return false;
    const changes = this.history.past.pop(); if (!changes) return false;
    changes.forEach(c => { this.pixels[c.index] = c.before; }); this.history.future.push(changes); this.frameList[this.activeFrame].revision++; this.emit(true); return true;
  }
  redo() {
    if (this.drawing || this.playing) return false;
    const changes = this.history.future.pop(); if (!changes) return false;
    changes.forEach(c => { this.pixels[c.index] = c.after; }); this.history.past.push(changes); this.frameList[this.activeFrame].revision++; this.emit(true); return true;
  }
  reset(width: number, height: number, pixels?: Uint32Array) {
    this.resetAnimation(width, height, [{ pixels: pixels ?? new Uint32Array(width * height), duration: DEFAULT_FRAME_DURATION }]);
  }
  resetAnimation(width: number, height: number, frames: FrameData[], activeFrame = 0) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 256 || height > 256 || !validFrames(frames, width, height, activeFrame)) throw new Error('Invalid animation data.');
    this.documentVersion++;
    this.width = width; this.height = height; this.frameList = frames.map(frame => this.makeFrame(frame.pixels.slice(), frame.duration));
    this.activeFrame = activeFrame; this.preview = null;
    this.stroke.clear(); this.drawing = false; this.emit(true);
  }
  sample(point: Point) {
    if (point.x < 0 || point.y < 0 || point.x >= this.width || point.y >= this.height) return null;
    const pixel = this.pixels[point.y * this.width + point.x]; return pixel & 255 ? pixelToHex(pixel) : null;
  }
  get hasArtwork() { return this.frameList.length > 1 || this.frameList.some(frame => frame.pixels.some(pixel => pixel !== 0)); }
  rgba(frameIndex = this.activeFrame) {
    const pixels = this.frameList[frameIndex].pixels, data = new Uint8ClampedArray(pixels.length * 4);
    pixels.forEach((p, i) => { data[i * 4] = p >>> 24; data[i * 4 + 1] = (p >>> 16) & 255; data[i * 4 + 2] = (p >>> 8) & 255; data[i * 4 + 3] = p & 255; });
    return data;
  }
}
