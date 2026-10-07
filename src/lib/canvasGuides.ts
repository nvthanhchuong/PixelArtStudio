import type { Camera } from './coordinates';

const align = (value: number, dpr: number, weight: number) => (Math.round(value * dpr) + (weight % 2) / 2) / dpr;

export function drawPixelGrid(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number, size: number, dark: boolean, dpr: number, viewportWidth: number, viewportHeight: number) {
  const spacing = camera.scale * size;
  if (spacing < 4) return;
  ctx.save();
  // Fine hairlines fade as cells become small; every fourth cell adds a quiet landmark.
  ctx.globalAlpha = Math.min(1, .45 + (spacing - 4) / 12);
  for (const major of [false, true]) {
    const weight = major ? Math.max(1, Math.round(dpr * .75)) : 1;
    ctx.strokeStyle = dark ? (major ? '#d9d3ee48' : '#d9d3ee26') : (major ? '#61597340' : '#61597323');
    ctx.lineWidth = weight / dpr; ctx.beginPath();
    for (let x = size; x < width; x += size) {
      if ((x / size % 4 === 0) !== major) continue;
      const px = align(camera.x + x * camera.scale, dpr, weight);
      if (px < 0 || px > viewportWidth) continue;
      ctx.moveTo(px, camera.y); ctx.lineTo(px, camera.y + height * camera.scale);
    }
    for (let y = size; y < height; y += size) {
      if ((y / size % 4 === 0) !== major) continue;
      const py = align(camera.y + y * camera.scale, dpr, weight);
      if (py < 0 || py > viewportHeight) continue;
      ctx.moveTo(camera.x, py); ctx.lineTo(camera.x + width * camera.scale, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawCenterAxes(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number, dark: boolean, dpr: number) {
  const bw = width * camera.scale, bh = height * camera.scale, weight = Math.max(1, Math.round(dpr));
  const cx = align(camera.x + bw / 2, dpr, weight), cy = align(camera.y + bh / 2, dpr, weight);
  const gap = Math.min(4, bw / 6, bh / 6);
  ctx.save(); ctx.lineWidth = weight / dpr; ctx.strokeStyle = dark ? '#b5a0e69c' : '#7e68b98c';
  ctx.setLineDash([3, 5]); ctx.beginPath();
  ctx.moveTo(camera.x, cy); ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap, cy); ctx.lineTo(camera.x + bw, cy);
  ctx.moveTo(cx, camera.y); ctx.lineTo(cx, cy - gap);
  ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, camera.y + bh); ctx.stroke();
  // A small cross locates the exact center without a badge covering nearby pixels.
  ctx.setLineDash([]); ctx.strokeStyle = dark ? '#c4b2ef' : '#8066bd'; ctx.beginPath();
  ctx.moveTo(cx - gap / 2, cy); ctx.lineTo(cx + gap / 2, cy);
  ctx.moveTo(cx, cy - gap / 2); ctx.lineTo(cx, cy + gap / 2); ctx.stroke(); ctx.restore();
}
