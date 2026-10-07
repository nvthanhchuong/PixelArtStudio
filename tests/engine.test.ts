import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PixelEngine } from '../src/lib/engine';
import { families, generateShades, hexToPixel } from '../src/lib/colors';
import { zoomAt, toPixel } from '../src/lib/coordinates';
import { validDraft } from '../src/lib/storage';

test('a fast stroke is continuous and undo/redo acts on the entire stroke', () => {
  const engine = new PixelEngine();
  engine.begin(); engine.paint({ x: 0, y: 8 }, { x: 31, y: 8 }, '#FF0088', 1); engine.commit();
  assert.equal(engine.history.past.length, 1);
  for (let x = 0; x < 32; x++) assert.equal(engine.sample({ x, y: 8 }), '#FF0088');
  engine.undo(); assert.equal(engine.hasArtwork, false);
  engine.redo(); assert.equal(engine.pixels.filter(Boolean).length, 32);
});
test('grid-snapped strokes clip partial edge cells and erase stays undoable', () => {
  const engine = new PixelEngine(); engine.reset(17, 19);
  engine.begin(); engine.paint({ x: 16, y: 18 }, { x: 16, y: 18 }, '#123456', 8); engine.commit();
  assert.equal(engine.pixels.filter(Boolean).length, 3);
  engine.begin(); engine.paint({ x: 16, y: 18 }, { x: 16, y: 18 }, null, 8); engine.commit();
  assert.equal(engine.hasArtwork, false); engine.undo(); assert.equal(engine.pixels.filter(Boolean).length, 3);
});
test('switching to two fingers cancels tentative marks and preserves prior artwork', () => {
  const engine = new PixelEngine();
  engine.begin(); engine.paint({ x: 5, y: 5 }, { x: 5, y: 5 }, '#ABCDEF', 1); engine.commit();
  engine.begin(); engine.paint({ x: 5, y: 5 }, { x: 20, y: 5 }, '#112233', 1); engine.cancel();
  assert.equal(engine.sample({ x: 5, y: 5 }), '#ABCDEF');
  assert.equal(engine.pixels.filter(Boolean).length, 1); assert.equal(engine.history.past.length, 1);
});
test('history stores original values across repeated paint and invalidates redo on new edits', () => {
  const engine = new PixelEngine(); engine.begin();
  engine.paint({ x: 1, y: 1 }, { x: 1, y: 1 }, '#FF0000', 1);
  engine.paint({ x: 1, y: 1 }, { x: 1, y: 1 }, '#00FF00', 1); engine.commit(); engine.undo();
  assert.equal(engine.hasArtwork, false);
  engine.begin(); engine.paint({ x: 2, y: 2 }, { x: 2, y: 2 }, '#FF0000', 1); engine.commit();
  assert.equal(engine.redo(), false);
});
test('zoom retains the artwork point under the gesture anchor', () => {
  const camera = { scale: 4, x: 30, y: 20 }, anchor = { x: 130, y: 120 };
  assert.deepEqual(toPixel(anchor, zoomAt(camera, anchor, 16)), toPixel(anchor, camera));
});
test('each family produces 100 distinct valid shades with broad contrast', () => {
  for (const family of families) {
    const shades = generateShades(family.name);
    assert.equal(new Set(shades).size, 100, family.name);
    assert(shades.every(s => /^#[0-9A-F]{6}$/.test(s)));
    assert.notEqual(shades[0], shades[99]);
  }
});
test('RGBA preserves exact color and transparent untouched pixels', () => {
  const engine = new PixelEngine(); engine.pixels[0] = hexToPixel('#123456');
  assert.deepEqual([...engine.rgba().slice(0, 8)], [18, 52, 86, 255, 0, 0, 0, 0]);
});
test('restored drafts reject malformed buffers and unsafe dimensions', () => {
  const draft = { version: 1, width: 32, height: 32, pixels: new Uint32Array(1024), preferences: { color: '#AABBCC', recent: [], family: 'Blue', gridSize: 1, gridVisible: true, theme: 'dark', zoom: 4 }, savedAt: Date.now() };
  assert.equal(validDraft(draft), true);
  assert.equal(validDraft({ ...draft, pixels: new Uint32Array(3) }), false);
  assert.equal(validDraft({ ...draft, width: 99999 }), false);
  assert.equal(validDraft({ ...draft, preferences: { ...draft.preferences, gridSize: 0 } }), false);
  assert.equal(validDraft({ ...draft, preferences: { ...draft.preferences, centerAxesVisible: true } }), true);
  assert.equal(validDraft({ ...draft, preferences: { ...draft.preferences, centerAxesVisible: 'true' } }), false);
});
