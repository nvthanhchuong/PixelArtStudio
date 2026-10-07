export type Point = { x: number; y: number };
export type Camera = { scale: number; x: number; y: number };
export function toPixel(point: Point, camera: Camera): Point { return { x: Math.floor((point.x - camera.x) / camera.scale), y: Math.floor((point.y - camera.y) / camera.scale) }; }
export function zoomAt(camera: Camera, point: Point, scale: number): Camera {
  const next = Math.max(.5, Math.min(64, scale)), ratio = next / camera.scale;
  return { scale: next, x: point.x - (point.x - camera.x) * ratio, y: point.y - (point.y - camera.y) * ratio };
}
export function line(from: Point, to: Point, visit: (x: number, y: number) => void) {
  let x = from.x, y = from.y;
  const dx = Math.abs(to.x - x), dy = -Math.abs(to.y - y), sx = x < to.x ? 1 : -1, sy = y < to.y ? 1 : -1;
  let error = dx + dy;
  while (true) {
    visit(x, y);
    if (x === to.x && y === to.y) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
}
