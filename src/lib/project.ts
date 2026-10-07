import type { PixelEngine } from './engine';
import type { Preferences } from './store';
import { families } from './colors';
import { MAX_ZOOM, MIN_ZOOM } from './coordinates';
import { DEFAULT_FRAME_DURATION, MAX_FRAMES, MAX_ANIMATION_PIXELS, validDuration, validFrames, type FrameData } from './animation';

export const PROJECT_FORMAT = 'pixel-studio';
export const PROJECT_VERSION = 3;
export const MAX_PROJECT_BYTES = 32 * 1024 * 1024;
export type ProjectData = { version: 1; width: number; height: number; pixels: Uint32Array; frames?: FrameData[]; activeFrame?: number; preferences: Preferences; savedAt: number };
type LegacyPreferences = Omit<Preferences, 'centerAxesVisible' | 'wheelBehavior'> & { centerAxesVisible?: boolean; wheelBehavior?: 'pan' | 'zoom' };
type StoredDraft = Omit<ProjectData, 'preferences'> & { preferences: LegacyPreferences };

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function dimension(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 256; }
export function normalizePreferences(value: unknown): Preferences {
  if (!record(value)) throw new Error('Editor settings are missing.');
  const p = value;
  if (typeof p.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(p.color)
    || !Array.isArray(p.recent) || p.recent.length > 20 || !p.recent.every(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))
    || !families.some(f => f.name === p.family) || !dimension(p.gridSize) || typeof p.gridVisible !== 'boolean'
    || (p.centerAxesVisible !== undefined && typeof p.centerAxesVisible !== 'boolean')
    || (p.wheelBehavior !== undefined && p.wheelBehavior !== 'pan' && p.wheelBehavior !== 'zoom')
    || (p.theme !== 'light' && p.theme !== 'dark') || typeof p.zoom !== 'number' || !Number.isFinite(p.zoom) || p.zoom < MIN_ZOOM || p.zoom > MAX_ZOOM) {
    throw new Error('Editor settings are invalid.');
  }
  return {
    color: p.color.toUpperCase(), recent: [...new Set((p.recent as string[]).map(c => c.toUpperCase()))],
    family: p.family as Preferences['family'], gridSize: p.gridSize, gridVisible: p.gridVisible,
    // Older V2 drafts may store "zoom"; restoring one must not disable touchpad pan.
    centerAxesVisible: p.centerAxesVisible ?? false, wheelBehavior: 'pan', theme: p.theme, zoom: p.zoom,
  };
}
export function validDraft(value: unknown): value is StoredDraft {
  if (!record(value)) return false;
  if (value.version !== 1 || !dimension(value.width) || !dimension(value.height)
    || !(value.pixels instanceof Uint32Array) || value.pixels.length !== value.width * value.height) return false;
  if (value.frames !== undefined) {
    if (!validFrames(value.frames, value.width, value.height, value.activeFrame)) return false;
    const selected = value.frames[value.activeFrame as number].pixels;
    if (!selected.every((pixel, index) => pixel === (value.pixels as Uint32Array)[index])) return false;
  }
  try { normalizePreferences(value.preferences); return true; } catch { return false; }
}
export function normalizeDraft(value: unknown): ProjectData {
  if (!validDraft(value)) throw new Error('The locally saved project is corrupted.');
  const frames = value.frames?.map(frame => ({ pixels: frame.pixels.slice(), duration: frame.duration }));
  return {
    version: 1, width: value.width, height: value.height, pixels: frames ? frames[value.activeFrame!].pixels : value.pixels.slice(),
    ...(frames ? { frames, activeFrame: value.activeFrame } : {}),
    preferences: normalizePreferences(value.preferences), savedAt: Number.isFinite(value.savedAt) ? value.savedAt : 0,
  };
}
export function snapshotProject(engine: PixelEngine, preferences: Preferences): ProjectData {
  const frames = engine.snapshotFrames();
  return { version: 1, width: engine.width, height: engine.height, pixels: frames[engine.activeFrame].pixels, frames, activeFrame: engine.activeFrame, preferences: { ...preferences, recent: [...preferences.recent] }, savedAt: Date.now() };
}
export function serializeProject(project: ProjectData): string {
  const frames = project.frames ?? [{ pixels: project.pixels, duration: DEFAULT_FRAME_DURATION }];
  return JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION, width: project.width, height: project.height,
    frames: frames.map(frame => ({ pixels: Array.from(frame.pixels), duration: frame.duration })), activeFrame: project.activeFrame ?? 0,
    preferences: project.preferences, savedAt: project.savedAt });
}
export function parseProject(text: string): ProjectData {
  if (text.length > MAX_PROJECT_BYTES) throw new Error('Project files must be smaller than 32 MB.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('This file is not valid JSON. Choose a .pixelart project file.'); }
  if (!record(value) || value.format !== PROJECT_FORMAT) throw new Error('This is not a Pixel Studio project file.');
  if (value.version !== 2 && value.version !== PROJECT_VERSION) throw new Error('This project file version is not supported.');
  if (!dimension(value.width) || !dimension(value.height)) throw new Error('Canvas dimensions must be between 1 and 256 pixels.');
  const pixelCount = value.width * value.height;
  function pixels(data: unknown): Uint32Array {
    if (!Array.isArray(data) || data.length !== pixelCount || !data.every(p => typeof p === 'number' && Number.isInteger(p) && p >= 0 && p <= 0xFFFFFFFF)) {
      throw new Error('Pixel data is corrupted or does not match the canvas dimensions.');
    }
    return Uint32Array.from(data);
  }
  let frames: FrameData[] | undefined, activeFrame = 0;
  if (value.version === PROJECT_VERSION) {
    if (!Array.isArray(value.frames) || !value.frames.length || value.frames.length > MAX_FRAMES || value.frames.length * pixelCount > MAX_ANIMATION_PIXELS) throw new Error('Animation has too many frames or is too large.');
    if (typeof value.activeFrame !== 'number' || !Number.isInteger(value.activeFrame) || value.activeFrame < 0 || value.activeFrame >= value.frames.length) throw new Error('Selected animation frame is invalid.');
    activeFrame = value.activeFrame;
    frames = value.frames.map(frame => {
      if (!record(frame) || !validDuration(frame.duration)) throw new Error('Frame duration must be between 20 and 10000 milliseconds.');
      return { pixels: pixels(frame.pixels), duration: frame.duration };
    });
  }
  const currentPixels = frames ? frames[activeFrame].pixels : pixels(value.pixels);
  return {
    version: 1, width: value.width, height: value.height, pixels: currentPixels,
    ...(frames ? { frames, activeFrame } : {}),
    preferences: normalizePreferences(value.preferences), savedAt: typeof value.savedAt === 'number' && Number.isFinite(value.savedAt) ? value.savedAt : 0,
  };
}
