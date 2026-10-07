import type { PixelEngine } from './engine';
export async function exportPng(engine: PixelEngine, scale: 1 | 2 | 4 | 8 = 1): Promise<Blob> {
  const source = document.createElement('canvas'); source.width = engine.width; source.height = engine.height;
  const sourceContext = source.getContext('2d');
  if (!sourceContext) return Promise.reject(new Error('Canvas export is unavailable in this browser.'));
  sourceContext.putImageData(new ImageData(engine.rgba(), engine.width, engine.height), 0, 0);
  const output = scale === 1 ? source : document.createElement('canvas');
  if (scale !== 1) {
    output.width = engine.width * scale; output.height = engine.height * scale;
    const context = output.getContext('2d');
    if (!context) return Promise.reject(new Error('Canvas export is unavailable in this browser.'));
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, output.width, output.height);
  }
  return new Promise((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create PNG')), 'image/png'));
}
