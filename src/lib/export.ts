import type { PixelEngine } from './engine';
export function exportPng(engine: PixelEngine): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = engine.width; canvas.height = engine.height;
  const context = canvas.getContext('2d')!; context.imageSmoothingEnabled = false;
  context.putImageData(new ImageData(engine.rgba(), engine.width, engine.height), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create PNG')), 'image/png'));
}
