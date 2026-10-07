import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

async function saved(page: Page) { await expect(page.getByRole('status').filter({ hasText: 'All changes saved locally' })).toBeVisible(); }
async function draft(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('pixel-studio', 1); r.onsuccess = () => resolve(r.result); });
    const result = await new Promise<{ width: number; height: number; pixels: Uint32Array; preferences: Record<string, unknown> }>(resolve => { const r = db.transaction('projects').objectStore('projects').get('draft'); r.onsuccess = () => resolve(r.result); });
    db.close(); return { ...result, pixels: [...result.pixels] };
  });
}
async function projects(page: Page) {
  const desktop = page.getByRole('button', { name: 'Save or open project', exact: true });
  if (await desktop.isVisible()) await desktop.click(); else await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  return page.getByRole('dialog');
}
async function dot(page: Page, offset = 0) {
  const box = (await page.getByTestId('pixel-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 15 + offset);
}
test('Save/Open Project restores every editable pixel and setting; invalid files preserve artwork; scaled PNG stays exact', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await saved(page);
  await page.getByRole('button', { name: 'Canvas settings', exact: true }).filter({ visible: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('switch', { name: 'Show center axes' }).click();
  await dialog.getByRole('button', { name: 'New canvas', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Width', { exact: true }).fill('17'); await dialog.getByLabel('Height', { exact: true }).fill('19');
  await dialog.getByRole('button', { name: 'Create canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.getByRole('button', { name: 'Open colors', exact: true }).filter({ visible: true }).click();
  dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Cyan family' }).click(); await dialog.getByRole('button', { name: /^Cyan shade 45 / }).click();
  await dialog.getByRole('button', { name: 'Close panel' }).click(); await dot(page); await saved(page);
  const original = await draft(page);
  dialog = await projects(page);
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('link', { name: 'Save Project', exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.pixelart$/);
  const text = await readFile((await download.path())!, 'utf8'), file = JSON.parse(text);
  expect(file.format).toBe('pixel-studio'); expect(file.version).toBe(3);
  expect(file.frames[file.activeFrame].pixels).toEqual(original.pixels); expect(file.preferences).toEqual(original.preferences);
  await dialog.getByTestId('open-project-input').setInputFiles({ name: 'broken.pixelart', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(dialog.getByRole('alert')).toContainText('not valid JSON'); expect((await draft(page)).pixels).toEqual(original.pixels);
  await dialog.getByTestId('open-project-input').setInputFiles({ name: 'saved.pixelart', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(dialog.getByRole('button', { name: 'Replace artwork & open' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel import' }).click(); expect((await draft(page)).pixels).toEqual(original.pixels);
  await dialog.getByRole('button', { name: 'New canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Create canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Replace artwork & create' }).click(); await saved(page);
  expect((await draft(page)).pixels.every(pixel => pixel === 0)).toBe(true);
  dialog = await projects(page); await dialog.getByTestId('open-project-input').setInputFiles({ name: 'saved.pixelart', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByRole('dialog')).toHaveCount(0); await saved(page);
  const restored = await draft(page);
  expect([restored.width, restored.height]).toEqual([17, 19]); expect(restored.pixels).toEqual(original.pixels); expect(restored.preferences).toEqual(original.preferences);
  await page.reload(); await saved(page); await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await draft(page)).pixels).toEqual(original.pixels); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await dot(page, 35); await saved(page); expect((await draft(page)).pixels).not.toEqual(original.pixels);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await saved(page); expect((await draft(page)).pixels).toEqual(original.pixels);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await saved(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await saved(page);
  await dot(page, -35); await saved(page); await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await saved(page);
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Export at 4x', exact: true }).click();
  await expect(dialog.getByRole('link', { name: 'Download PNG' })).toHaveAttribute('download', 'pixel-studio-68x76.png');
  const [pngFile] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('link', { name: 'Download PNG' }).click()]);
  const png = PNG.sync.read(await readFile((await pngFile.path())!)); expect([png.width, png.height]).toEqual([68, 76]);
  for (let y = 0; y < 76; y++) for (let x = 0; x < 68; x++) {
    const pixel = original.pixels[Math.floor(y / 4) * 17 + Math.floor(x / 4)], index = (y * 68 + x) * 4;
    expect([...png.data.slice(index, index + 4)]).toEqual([pixel >>> 24, (pixel >>> 16) & 255, (pixel >>> 8) & 255, pixel & 255]);
  }
  await dialog.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Reset zoom to 100%' }).click(); await expect(page.getByTestId('zoom')).toHaveText('100%');
  expect((await draft(page)).pixels).toEqual(original.pixels);
  await page.screenshot({ path: `test-results/${info.project.name}-v2.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
});

test('zoom then middle-button pan preserves coordinates; eyedropper returns to pencil and multiple strokes undo/redo', async ({ page }) => {
  await page.goto('/'); await saved(page);
  await page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
  const scale = Math.pow(1.25, 7);
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const box = (await page.getByTestId('pixel-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'middle' }); await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 55); await page.mouse.up({ button: 'middle' });
  const click = async (x: number, y: number) => page.mouse.click(box.x + box.width / 2 + (x + .5 - 16) * scale + 25, box.y + box.height / 2 + (y + .5 - 31) * scale + 55);
  await click(11, 12); await saved(page);
  const first = await draft(page); expect(first.pixels.filter(Boolean)).toHaveLength(1); expect(first.pixels[12 * 32 + 11]).toBe(0x8061DBFF);
  await page.getByRole('button', { name: 'Open colors', exact: true }).filter({ visible: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Blue family' }).click(); await page.getByRole('dialog').getByRole('button', { name: /^Blue shade 65 / }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Eyedropper', exact: true }).filter({ visible: true }).click(); await click(11, 12);
  await expect(page.getByRole('button', { name: 'Pencil', exact: true }).filter({ visible: true })).toHaveAttribute('aria-pressed', 'true');
  await click(20, 12); await click(21, 14); await saved(page);
  const three = await draft(page); expect(three.pixels.filter(Boolean)).toHaveLength(3);
  for (const index of [12 * 32 + 11, 12 * 32 + 20, 14 * 32 + 21]) expect(three.pixels[index]).toBe(0x8061DBFF);
  expect(three.preferences.recent).toEqual(['#8061DB', ...(three.preferences.recent as string[]).filter(color => color !== '#8061DB')]);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Undo', exact: true }).click(); await saved(page);
  expect((await draft(page)).pixels.filter(Boolean)).toHaveLength(0);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Redo', exact: true }).click(); await saved(page);
  expect((await draft(page)).pixels).toEqual(three.pixels);
});

test('export failure stays inside the export panel and drawing still works', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-desktop');
  await page.goto('/'); await saved(page);
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = () => { throw new DOMException('Export disabled', 'NotSupportedError'); }; });
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Export disabled');
  await page.getByRole('button', { name: 'Close panel' }).click(); await dot(page); await saved(page); expect((await draft(page)).pixels.filter(Boolean)).toHaveLength(1);
});

test('older saved Zoom settings restore two-finger pan without clicking or changing artwork', async ({ page }, info) => {
  await page.goto('/'); await saved(page); const canvas = page.getByTestId('pixel-canvas');
  await dot(page); await saved(page); const original = await draft(page);
  await page.goto('/favicon.svg');
  await page.evaluate(async () => {
    localStorage.removeItem('pixel-studio:draft-backup'); localStorage.removeItem('pixel-studio:recovery-draft');
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('pixel-studio', 1); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>(resolve => {
      const tx = db.transaction('projects', 'readwrite'), store = tx.objectStore('projects'), read = store.get('draft');
      read.onsuccess = () => { const project = read.result; project.preferences.wheelBehavior = 'zoom'; store.put(project, 'draft'); };
      tx.oncomplete = () => resolve();
    }); db.close();
  });
  await page.goto('/'); await saved(page);
  expect((await draft(page)).preferences.wheelBehavior).toBe('pan');
  const box = (await canvas.boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2 - 15;
  async function pan(dx: number, dy: number) {
    const before = await page.getByTestId('zoom').textContent(), image = await canvas.evaluate(c => (c as HTMLCanvasElement).toDataURL());
    if (info.project.name.startsWith('webkit') && info.project.name !== 'webkit-desktop') {
      await canvas.evaluate((element, args) => element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: args.x, clientY: args.y, deltaX: args.dx, deltaY: args.dy })), { x, y, dx, dy });
    } else { await page.mouse.move(x, y); await page.mouse.wheel(dx, dy); }
    await expect.poll(() => canvas.evaluate(c => (c as HTMLCanvasElement).toDataURL())).not.toBe(image);
    await expect(page.getByTestId('zoom')).toHaveText(before!);
  }
  await pan(0, 72);
  await page.mouse.click(x, y - 72); await saved(page); expect((await draft(page)).pixels).toEqual(original.pixels);
  const dialog = await projects(page);
  const oldFile = { ...original, format: 'pixel-studio', version: 2, preferences: { ...original.preferences, wheelBehavior: 'zoom' } };
  await dialog.getByTestId('open-project-input').setInputFiles({ name: 'older.pixelart', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(oldFile)) });
  await dialog.getByRole('button', { name: 'Replace artwork & open' }).click(); await saved(page);
  expect((await draft(page)).preferences.wheelBehavior).toBe('pan');
  await pan(36, 24); expect((await draft(page)).pixels).toEqual(original.pixels);
});

test('IndexedDB failure falls back to local backup and restores a stroke even before debounce', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-desktop');
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: undefined }));
  await page.goto('/'); await saved(page); await expect(page.getByRole('status')).toContainText('backup storage');
  await dot(page);
  const pixels = await page.evaluate(() => { const project = JSON.parse(localStorage.getItem('pixel-studio:draft-backup')!); return project.frames[project.activeFrame].pixels as number[]; });
  expect(pixels.filter(Boolean)).toHaveLength(1);
  await page.reload(); await saved(page); await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => { const project = JSON.parse(localStorage.getItem('pixel-studio:draft-backup')!); return project.frames[project.activeFrame].pixels; })).toEqual(pixels);
});

test('corrupted IndexedDB data is preserved while new artwork saves to a separate recovery draft', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-desktop');
  await page.goto('/'); await saved(page); await page.goto('/favicon.svg');
  await page.evaluate(async () => {
    localStorage.removeItem('pixel-studio:draft-backup'); localStorage.removeItem('pixel-studio:recovery-draft');
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('pixel-studio', 1); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put({ version: 1, width: 999, original: 'preserve-me' }, 'draft'); tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.goto('/'); await expect(page.locator('.recovery-notice')).toContainText('Original data is preserved'); await saved(page);
  await dot(page); await saved(page);
  const stored = await page.evaluate(() => { const project = JSON.parse(localStorage.getItem('pixel-studio:recovery-draft')!); return project.frames[project.activeFrame].pixels; });
  expect(stored.filter(Boolean)).toHaveLength(1);
  await page.reload(); await saved(page);
  expect(await page.evaluate(() => { const project = JSON.parse(localStorage.getItem('pixel-studio:recovery-draft')!); return project.frames[project.activeFrame].pixels; })).toEqual(stored);
  expect(await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('pixel-studio', 1); r.onsuccess = () => resolve(r.result); });
    const value = await new Promise(resolve => { const r = db.transaction('projects').objectStore('projects').get('draft'); r.onsuccess = () => resolve(r.result); }); db.close(); return value;
  })).toEqual({ version: 1, width: 999, original: 'preserve-me' });
});

test('when all local storage is denied, drawing and project download still work', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-desktop');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined });
    Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new DOMException('Denied', 'SecurityError'); };
  });
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('Autosave unavailable'); await dot(page);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  const dialog = await projects(page);
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('link', { name: 'Save Project', exact: true }).click()]);
  const project = JSON.parse(await readFile((await download.path())!, 'utf8')); expect(project.frames[project.activeFrame].pixels.filter(Boolean)).toHaveLength(1);
});
