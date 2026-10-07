export const MAX_FRAMES = 120;
export const MAX_ANIMATION_PIXELS = 2_097_152;
export const DEFAULT_FRAME_DURATION = 100;
export const MIN_FRAME_DURATION = 20;
export const MAX_FRAME_DURATION = 10_000;
export type FrameData = { pixels: Uint32Array; duration: number };

export function validDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_FRAME_DURATION && value <= MAX_FRAME_DURATION;
}
export function validFrames(frames: unknown, width: number, height: number, activeFrame: unknown): frames is FrameData[] {
  return Array.isArray(frames) && frames.length >= 1 && frames.length <= MAX_FRAMES
    && frames.length * width * height <= MAX_ANIMATION_PIXELS
    && typeof activeFrame === 'number' && Number.isInteger(activeFrame) && activeFrame >= 0 && activeFrame < frames.length
    && frames.every(frame => !!frame && validDuration(frame.duration) && frame.pixels instanceof Uint32Array && frame.pixels.length === width * height);
}
