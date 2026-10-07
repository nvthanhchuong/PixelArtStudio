import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

async function saved(page: Page) { await expect(page.getByRole('status').filter({ hasText: 'All changes saved locally' })).toBeVisible(); }
async function project(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('pixel-studio', 1); r.onsuccess = () => resolve(r.result); });
    const stored = await new Promise<{ activeFrame: number; frames: { duration: number; pixels: Uint32Array }[]; savedAt: number }>(resolve => { const r = db.transaction('projects').objectStore('projects').get('draft'); r.onsuccess = () => resolve(r.result); });
    db.close(); return { activeFrame: stored.activeFrame, savedAt: stored.savedAt, frames: stored.frames.map(frame => ({ duration: frame.duration, pixels: [...frame.pixels] })) };
  });
}
async function projects(page: Page) {
  const desktop = page.getByRole('button', { name: 'Save or open project', exact: true });
  await (await desktop.isVisible() ? desktop : page.getByRole('button', { name: 'Open menu', exact: true })).click();
  return page.getByRole('dialog');
}
async function dot(page: Page, offset = 0) {
  const canvas = (await page.getByTestId('pixel-canvas').boundingBox())!;
  await page.mouse.click(canvas.x + canvas.width / 2 + offset, canvas.y + canvas.height / 2 - 15);
}

test('top timeline adds and edits isolated frames, times playback, and restores the complete animation from autosave and project files', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await saved(page);
  await expect(page.getByRole('tab', { name: 'Frame 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play animation' })).toBeDisabled();
  const timeline = (await page.getByRole('region', { name: 'Animation timeline' }).boundingBox())!;
  const canvas = (await page.getByTestId('pixel-canvas').boundingBox())!; expect(timeline.y + timeline.height).toBeLessThanOrEqual(canvas.y + 1);
  await dot(page); await page.getByLabel('Frame duration (milliseconds)').fill('300'); await saved(page);
  const first = (await project(page)).frames[0]; expect(first.pixels.filter(Boolean)).toHaveLength(1);
  await page.getByRole('button', { name: 'Add frame', exact: true }).click(); await saved(page);
  expect((await project(page)).frames[1].pixels.every(pixel => pixel === 0)).toBe(true);
  await expect(page.getByRole('tab', { name: 'Frame 2', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Open colors', exact: true }).filter({ visible: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Red family' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Red shade 65 / }).click(); await page.getByRole('button', { name: 'Close panel' }).click();
  await dot(page, 30); await page.getByLabel('Frame duration (milliseconds)').fill('900'); await saved(page);
  const second = (await project(page)).frames[1]; expect(second.pixels.filter(Boolean)).toHaveLength(1); expect(second.pixels).not.toEqual(first.pixels);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await saved(page);
  expect((await project(page)).frames[1].pixels.every(pixel => pixel === 0)).toBe(true); expect((await project(page)).frames[0]).toEqual(first);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('tab', { name: 'Frame 1', exact: true }).click(); await saved(page);
  await expect(page.getByLabel('Frame duration (milliseconds)')).toHaveValue('300');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await saved(page);
  expect((await project(page)).frames[0].pixels.every(pixel => pixel === 0)).toBe(true); expect((await project(page)).frames[1]).toEqual(second);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await saved(page);
  const original = await project(page);
  await page.getByRole('button', { name: 'Play animation', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Frame 2', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Frame duration (milliseconds)')).toBeDisabled();
  await dot(page, -25);
  expect(await project(page)).toEqual(original); // Playback and pointer input create no autosave or pixel edits.
  await page.getByRole('tab', { name: 'Frame 2', exact: true }).click(); await saved(page);
  await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
  await expect(page.getByLabel('Frame duration (milliseconds)')).toHaveValue('900');
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const [pngDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('link', { name: 'Download PNG' }).click()]);
  const png = PNG.sync.read(await readFile((await pngDownload.path())!));
  const expected = second.pixels.flatMap(pixel => [pixel >>> 24, (pixel >>> 16) & 255, (pixel >>> 8) & 255, pixel & 255]);
  expect([...png.data]).toEqual(expected); await page.getByRole('button', { name: 'Close panel' }).click();
  let dialog = await projects(page);
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('link', { name: 'Save Project', exact: true }).click()]);
  const text = await readFile((await download.path())!, 'utf8'), file = JSON.parse(text);
  expect(file.frames).toEqual([first, second]); expect(file.activeFrame).toBe(1);
  const bad = { ...file, activeFrame: 0, frames: [{ ...file.frames[0], duration: -1 }] };
  await dialog.getByTestId('open-project-input').setInputFiles({ name: 'broken-animation.pixelart', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(dialog.getByRole('alert')).toContainText('Frame duration'); expect((await project(page)).frames).toEqual([first, second]);
  await dialog.getByRole('button', { name: 'Close panel' }).click(); await page.reload(); await saved(page);
  expect((await project(page)).frames).toEqual([first, second]); await expect(page.getByRole('tab', { name: 'Frame 2', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Duplicate frame' }).click(); await saved(page); expect((await project(page)).frames).toEqual([first, second, second]);
  await dot(page, -30); await saved(page); expect((await project(page)).frames[1]).toEqual(second);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Delete frame' }).click(); await saved(page);
  expect((await project(page)).frames).toEqual([first, second]);
  dialog = await projects(page); await dialog.getByRole('button', { name: 'New canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Create canvas', exact: true }).click(); await page.getByRole('button', { name: 'Replace artwork & create' }).click(); await saved(page);
  expect((await project(page)).frames).toHaveLength(1);
  dialog = await projects(page); await dialog.getByTestId('open-project-input').setInputFiles({ name: 'animation.pixelart', mimeType: 'application/json', buffer: Buffer.from(text) }); await saved(page);
  expect((await project(page)).frames).toEqual([first, second]); await expect(page.getByRole('tab', { name: 'Frame 2', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: `test-results/${info.project.name}-animation.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
});
