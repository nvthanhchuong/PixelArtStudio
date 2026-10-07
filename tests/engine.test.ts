import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PixelEngine } from '../src/lib/engine';
import { families, generateShades, hexToPixel } from '../src/lib/colors';
import { zoomAt, toPixel } from '../src/lib/coordinates';
import { validDraft } from '../src/lib/storage';
import { parseProject, serializeProject, MAX_PROJECT_BYTES, snapshotProject, normalizeDraft } from '../src/lib/project';
import { preferences } from '../src/lib/store';
import { History, HISTORY_LIMIT, HISTORY_PIXEL_BUDGET } from '../src/lib/history';
import { MAX_FRAMES, MAX_ANIMATION_PIXELS } from '../src/lib/animation';

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
  const committed = engine.pixels.slice();
  engine.begin(); engine.paint({ x: 5, y: 5 }, { x: 20, y: 5 }, '#112233', 1);
  assert.deepEqual(snapshotProject(engine, preferences()).pixels, committed);
  engine.cancel();
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

test('painting replaces one cell, while same-color repeats leave storage, history and repaint unchanged', () => {
  const engine = new PixelEngine(); engine.reset(4, 4);
  const point = { x: 1, y: 1 }, buffer = engine.pixels;
  let repaints = 0;
  engine.subscribe(() => repaints++);
  for (const color of ['#00FF00', '#FFFF00']) {
    engine.begin(); engine.paint(point, point, color, 1); assert.equal(engine.commit(), true);
  }
  const rgba = engine.rgba(), revision = engine.frames[0].revision, updates = repaints;
  const snapshot = snapshotProject(engine, preferences());
  for (let i = 0; i < 1000; i++) {
    engine.begin(); engine.paint(point, point, '#FFFF00', 1); assert.equal(engine.commit(), false);
  }
  assert.equal(engine.pixels, buffer);
  assert.equal(buffer.byteLength, 4 * 4 * 4);
  assert.equal(buffer.filter(Boolean).length, 1);
  assert.equal(engine.sample(point), '#FFFF00');
  assert.deepEqual([...rgba.slice(20, 24)], [255, 255, 0, 255]);
  assert.deepEqual(engine.rgba(), rgba);
  assert.equal(engine.history.past.length, 2);
  assert.equal(engine.frames[0].revision, revision);
  assert.equal(repaints, updates);
  const repeated = snapshotProject(engine, preferences());
  repeated.savedAt = snapshot.savedAt;
  assert.equal(serializeProject(repeated), serializeProject(snapshot));
  assert.equal(engine.undo(), true); assert.equal(engine.sample(point), '#00FF00');
  engine.begin(); engine.paint(point, point, '#00FF00', 1); assert.equal(engine.commit(), false);
  assert.equal(engine.redo(), true); assert.equal(engine.sample(point), '#FFFF00');
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
  const restored = normalizeDraft(draft);
  assert.equal(restored.preferences.centerAxesVisible, false);
  assert.equal(restored.preferences.wheelBehavior, 'pan');
  const oldZoomDraft = normalizeDraft({ ...draft, preferences: { ...draft.preferences, wheelBehavior: 'zoom' } });
  assert.equal(oldZoomDraft.preferences.wheelBehavior, 'pan');
  assert.deepEqual(oldZoomDraft.pixels, draft.pixels);
});

test('project files round-trip every packed RGBA pixel and all preferences without changing the engine', () => {
  const engine = new PixelEngine(); engine.reset(17, 19);
  engine.pixels[0] = 0x123456FF; engine.pixels[1] = 0xFEDCBA80; engine.pixels[2] = 0xFFFFFFFF;
  const settings = { ...preferences(), color: '#112233', recent: ['#112233', '#ABCDEF'], theme: 'dark' as const, centerAxesVisible: true, wheelBehavior: 'pan' as const, zoom: .25 };
  const snapshot = snapshotProject(engine, settings), imported = parseProject(serializeProject(snapshot));
  assert.deepEqual(imported, snapshot);
  const oldFile = JSON.parse(serializeProject(snapshot)); oldFile.preferences.wheelBehavior = 'zoom';
  assert.deepEqual(parseProject(JSON.stringify(oldFile)), snapshot);
  imported.pixels[0] = 0; assert.equal(engine.pixels[0], 0x123456FF);
});
test('project import rejects invalid JSON, incompatible versions, incorrect lengths, pixel overflow and invalid settings', () => {
  const project = JSON.parse(serializeProject(snapshotProject(new PixelEngine(), preferences())));
  const badPixels = (pixels: number[]) => ({ ...project, frames: [{ ...project.frames[0], pixels }] });
  for (const value of [
    { ...project, format: 'other-app' }, { ...project, version: 999 }, { ...project, width: 0 },
    badPixels([0]), badPixels([...project.frames[0].pixels.slice(0, -1), -1]),
    badPixels([...project.frames[0].pixels.slice(0, -1), 0x100000000]),
    badPixels([...project.frames[0].pixels.slice(0, -1), 1.5]),
    { ...project, preferences: { ...project.preferences, zoom: 0 } },
    { ...project, preferences: { ...project.preferences, wheelBehavior: 'invalid' } },
  ]) assert.throws(() => parseProject(JSON.stringify(value)));
  assert.throws(() => parseProject('not json'));
  assert.throws(() => parseProject(' '.repeat(MAX_PROJECT_BYTES + 1)));
});

test('frames keep separate pixels and undo histories; duplicate is independent and playback does not select or edit frames', () => {
  const engine = new PixelEngine(); engine.begin(); engine.paint({ x: 1, y: 1 }, { x: 1, y: 1 }, '#123456', 1); engine.commit();
  const first = engine.pixels.slice(); assert(engine.addFrame()); assert.equal(engine.hasArtwork, true); assert.equal(engine.pixels.some(Boolean), false);
  engine.begin(); engine.paint({ x: 3, y: 2 }, { x: 3, y: 2 }, '#ABCDEF', 1); engine.commit(); const second = engine.pixels.slice();
  assert(engine.undo()); assert.equal(engine.pixels.some(Boolean), false); assert(engine.redo());
  assert(engine.selectFrame(0)); assert.deepEqual(engine.pixels, first); assert(engine.undo()); assert.deepEqual(engine.frames[1].pixels, second); assert(engine.redo());
  assert(engine.startPlayback()); engine.advancePlayback(); assert.equal(engine.displayFrame, 1); assert.equal(engine.activeFrame, 0); assert.deepEqual(engine.pixels, first); assert.equal(engine.undo(), false);
  engine.stopPlayback(); assert.equal(engine.displayFrame, 0); assert(engine.addFrame(true)); engine.pixels[0] = 0xFF0000FF; assert.equal(engine.frames[0].pixels[0], 0);
  assert(engine.deleteFrame()); assert.equal(engine.frames.length, 2); assert(engine.deleteFrame()); assert.equal(engine.deleteFrame(), false);
});

test('animation project round-trips all frame durations, active frame and pixels, and old V2 projects still open', () => {
  const engine = new PixelEngine(); engine.setFrameDuration(300); engine.pixels[0] = 0x123456FF;
  engine.addFrame(); engine.setFrameDuration(700); engine.pixels[1] = 0xAABBCCFF;
  const snapshot = snapshotProject(engine, preferences()), restored = parseProject(serializeProject(snapshot));
  assert.deepEqual(restored, snapshot); const loaded = new PixelEngine(); loaded.resetAnimation(restored.width, restored.height, restored.frames!, restored.activeFrame);
  assert.equal(loaded.activeFrame, 1); assert.deepEqual(loaded.snapshotFrames(), snapshot.frames); loaded.pixels[0] = 255; assert.equal(snapshot.pixels[0], 0);
  const legacy = { format: 'pixel-studio', version: 2, width: 32, height: 32, pixels: [...snapshot.pixels], preferences: snapshot.preferences, savedAt: snapshot.savedAt };
  const old = parseProject(JSON.stringify(legacy)); assert.deepEqual(old.pixels, snapshot.pixels); assert.equal(old.frames, undefined);
});

test('animation import rejects invalid frames, timing, selection, frame count and inconsistent draft buffers', () => {
  const snapshot = snapshotProject(new PixelEngine(), preferences()), file = JSON.parse(serializeProject(snapshot));
  for (const bad of [
    { ...file, frames: [] }, { ...file, activeFrame: 5 }, { ...file, frames: [{ ...file.frames[0], duration: 0 }] },
    { ...file, frames: [{ ...file.frames[0], duration: 10001 }] }, { ...file, frames: [{ ...file.frames[0], pixels: [] }] },
    { ...file, frames: Array(MAX_FRAMES + 1).fill(file.frames[0]) },
  ]) assert.throws(() => parseProject(JSON.stringify(bad)));
  const mismatch = { ...snapshot, pixels: snapshot.pixels.slice() }; mismatch.pixels[0] = 255; assert.equal(validDraft(mismatch), false);
  const engine = new PixelEngine(); assert.equal(engine.setFrameDuration(19), false); assert.equal(engine.selectFrame(9), false);
  for (let i = 1; i < MAX_FRAMES; i++) assert(engine.addFrame()); assert.equal(engine.addFrame(), false);
  engine.reset(256, 256); while (engine.canAddFrame) engine.addFrame(); assert(engine.frames.length * 65536 <= MAX_ANIMATION_PIXELS);
});

test('history budget applies across the whole animation', () => {
  const engine = new PixelEngine();
  for (let frame = 0; frame < 5; frame++) {
    if (frame) engine.addFrame();
    for (let x = 0; x < 30; x++) { engine.begin(); engine.paint({ x, y: 0 }, { x, y: 0 }, '#112233', 1); engine.commit(); }
  }
  const histories = engine.frames.map(frame => frame.history);
  assert(histories.reduce((sum, history) => sum + history.past.length + history.future.length, 0) <= HISTORY_LIMIT);
  assert(histories.reduce((sum, history) => sum + [...history.past, ...history.future].reduce((n, action) => n + action.length, 0), 0) <= HISTORY_PIXEL_BUDGET);
});
test('history retains at most 80 actions and bounds large strokes by changed-pixel budget', () => {
  const history = new History();
  for (let i = 0; i < 120; i++) history.push([{ index: 0, before: i, after: i + 1 }]);
  assert.equal(history.past.length, HISTORY_LIMIT);
  history.clear();
  const large = Array.from({ length: 65536 }, (_, index) => ({ index, before: 0, after: 255 }));
  for (let i = 0; i < 20; i++) history.push(large);
  assert(history.past.reduce((count, action) => count + action.length, 0) <= HISTORY_PIXEL_BUDGET);
});
test('three complete strokes can undo/redo in sequence and ongoing strokes cannot corrupt history', () => {
  const engine = new PixelEngine();
  for (let y = 0; y < 3; y++) { engine.begin(); engine.paint({ x: 0, y }, { x: 31, y }, '#ABCDEF', 1); engine.commit(); }
  const original = engine.pixels.slice();
  for (let i = 0; i < 3; i++) assert(engine.undo());
  assert.equal(engine.hasArtwork, false);
  for (let i = 0; i < 3; i++) assert(engine.redo());
  assert.deepEqual(engine.pixels, original);
  engine.begin(); engine.paint({ x: 10, y: 10 }, { x: 10, y: 10 }, '#123456', 1);
  assert.equal(engine.undo(), false); engine.cancel(); assert.deepEqual(engine.pixels, original);
});
