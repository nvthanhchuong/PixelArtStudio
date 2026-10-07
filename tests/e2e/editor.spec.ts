import { test, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { readFile } from 'node:fs/promises';

async function draftPixels(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('pixel-studio', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const d = await new Promise<{ pixels: Uint32Array; width: number; height: number; preferences: { color: string; theme: string; recent: string[] } }>((resolve, reject) => { const r = db.transaction('projects').objectStore('projects').get('draft'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    db.close(); return { count: [...d.pixels].filter(Boolean).length, pixels: [...d.pixels], width: d.width, height: d.height, preferences: d.preferences };
  });
}
async function saved(page: Page) { await expect(page.getByRole('status').filter({ hasText: 'All changes saved locally' })).toBeVisible(); }
async function stroke(page: Page, yOffset = 0) {
  const box = (await page.getByTestId('pixel-canvas').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2 - 15 + yOffset;
  await page.mouse.move(x - 35, y); await page.mouse.down(); await page.mouse.move(x + 35, y, { steps: 1 }); await page.mouse.up();
  await saved(page);
}
async function openColors(page: Page) {
  await page.getByRole('button', { name: 'Open colors', exact: true }).filter({ visible: true }).click();
  return page.getByRole('dialog');
}
test.beforeEach(async ({ page }) => { await page.goto('/'); await saved(page); });

test('draw, undo, redo, erase, sample, export exact transparent PNG and restore', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await stroke(page);
  const painted = await draftPixels(page); expect(painted.count).toBeGreaterThan(1);
  expect(painted.count).toBeLessThan(32);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await saved(page); expect((await draftPixels(page)).count).toBe(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await saved(page); expect((await draftPixels(page)).pixels).toEqual(painted.pixels);
  await page.getByRole('button', { name: 'Eraser', exact: true }).filter({ visible: true }).click(); await stroke(page); expect((await draftPixels(page)).count).toBe(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await saved(page);
  const dialog = await openColors(page); await dialog.getByRole('button', { name: 'Blue family' }).click();
  await dialog.getByRole('button', { name: /^Blue shade 65 / }).click(); await dialog.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Eyedropper', exact: true }).filter({ visible: true }).click();
  const box = (await page.getByTestId('pixel-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 15); await saved(page);
  expect((await draftPixels(page)).preferences.color).toBe('#8061DB');
  await page.getByRole('button', { name: 'Export PNG' }).click();
  const exportDialog = page.getByRole('dialog'); await expect(exportDialog.getByRole('link', { name: 'Download PNG' })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), exportDialog.getByRole('link', { name: 'Download PNG' }).click()]);
  const png = PNG.sync.read(await readFile((await download.path())!)); expect(png.width).toBe(32); expect(png.height).toBe(32);
  const count = Array.from({ length: 1024 }, (_, i) => png.data[i * 4 + 3]).filter(Boolean).length;
  expect(count).toBe(painted.count); expect(png.data[3]).toBe(0);
  await exportDialog.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click(); await saved(page);
  await page.screenshot({ path: `test-results/${info.project.name}-dark.png` });
  await page.reload(); await page.getByRole('button', { name: 'Restore artwork' }).click(); await saved(page);
  expect((await draftPixels(page)).pixels).toEqual(painted.pixels); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(errors).toEqual([]);
});
test('responsive tools, 100 accessible shades, grid, sheets and custom canvas stay in viewport', async ({ page }, info) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const canvas = (await page.getByTestId('pixel-canvas').boundingBox())!;
  expect(canvas.width).toBeGreaterThan(280); expect(canvas.height).toBeGreaterThan(info.project.name.includes('landscape') ? 260 : 450);
  await page.screenshot({ path: `test-results/${info.project.name}-light.png` });
  const dialog = await openColors(page); await expect(dialog.getByRole('button', { name: /Purple shade/ })).toHaveCount(100);
  if (info.project.name !== 'chromium-desktop') {
    const size = (await dialog.getByRole('button', { name: /^Purple shade 1 / }).boundingBox())!; expect(size.width).toBeGreaterThanOrEqual(44); expect(size.height).toBeGreaterThanOrEqual(44);
  }
  await dialog.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Canvas settings', exact: true }).filter({ visible: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '4 px', exact: true }).click();
  await page.getByRole('dialog').getByRole('switch', { name: 'Show pixel grid' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'New canvas', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Width', { exact: true }).fill('17'); await page.getByRole('dialog').getByLabel('Height', { exact: true }).fill('19');
  await page.getByRole('button', { name: 'Create canvas', exact: true }).click(); await saved(page);
  const draft = await draftPixels(page); expect([draft.width, draft.height]).toEqual([17, 19]);
  await stroke(page); const before = (await draftPixels(page)).pixels;
  await page.getByRole('button', { name: 'Canvas settings', exact: true }).filter({ visible: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'New canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Create canvas', exact: true }).click(); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('will be replaced');
  await page.getByRole('button', { name: 'Close panel' }).click(); expect((await draftPixels(page)).pixels).toEqual(before);
});
test('zoom, pan and two-pointer gestures preserve artwork', async ({ page }, info) => {
  await stroke(page); const before = (await draftPixels(page)).pixels;
  const zoomBefore = await page.getByTestId('zoom').textContent();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click(); expect(await page.getByTestId('zoom').textContent()).not.toEqual(zoomBefore);
  await page.getByRole('button', { name: 'Pan', exact: true }).filter({ visible: true }).click(); await stroke(page, 12);
  expect((await draftPixels(page)).pixels).toEqual(before);
  await page.getByRole('button', { name: 'Pencil', exact: true }).filter({ visible: true }).click();
  const box = (await page.getByTestId('pixel-canvas').boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2 - 15;
  const initialZoom = await page.getByTestId('zoom').textContent();
  if (info.project.name === 'chromium-mobile') {
    const session = await page.context().newCDPSession(page);
    const touch = (points: {x:number; y:number; id:number}[], type: 'touchStart' | 'touchMove' | 'touchEnd') => session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    await touch([{ x: x - 20, y, id: 1 }], 'touchStart');
    await touch([{ x: x - 20, y, id: 1 }, { x: x + 20, y, id: 2 }], 'touchStart');
    await touch([{ x: x - 50, y: y + 20, id: 1 }, { x: x + 70, y: y + 20, id: 2 }], 'touchMove');
    await touch([], 'touchEnd'); await session.detach();
  } else {
    // WebKit/desktop: exercise the same Pointer Events path with explicit two pointers.
    await page.getByTestId('pixel-canvas').evaluate((canvas, { x, y }) => {
      const fire = (type: string, id: number, px: number, py: number) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'touch', clientX: px, clientY: py, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
      fire('pointerdown', 101, x - 20, y); fire('pointerdown', 102, x + 20, y);
      fire('pointermove', 101, x - 50, y + 20); fire('pointermove', 102, x + 70, y + 20);
      fire('pointerup', 101, x - 50, y + 20); fire('pointerup', 102, x + 70, y + 20);
    }, { x, y });
  }
  await saved(page); expect((await draftPixels(page)).pixels).toEqual(before); expect(await page.getByTestId('zoom').textContent()).not.toEqual(initialZoom);
});
test('real touch tap draws a pixel and toolbar remains operable', async ({ page }, info) => {
  test.skip(info.project.name === 'chromium-desktop');
  const box = (await page.getByTestId('pixel-canvas').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2 - 15); await saved(page);
  expect((await draftPixels(page)).count).toBe(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).tap(); await saved(page); expect((await draftPixels(page)).count).toBe(0);
});

test('desktop shortcuts, right-click eraser, Alt sample, Space pan and wheel zoom', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-desktop');
  await stroke(page); const before = (await draftPixels(page)).pixels;
  await page.keyboard.press('Control+z'); await saved(page); expect((await draftPixels(page)).count).toBe(0);
  await page.keyboard.press('Control+y'); await saved(page); expect((await draftPixels(page)).pixels).toEqual(before);
  await page.keyboard.press('e'); await expect(page.getByRole('button', { name: 'Eraser', exact: true }).filter({ visible: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('b');
  const box = (await page.getByTestId('pixel-canvas').boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2 - 15;
  await page.mouse.click(x, y, { button: 'right' }); await saved(page); expect((await draftPixels(page)).count).toBe(before.filter(Boolean).length - 1);
  await page.keyboard.press('Control+z'); await saved(page);
  await page.keyboard.down('Alt'); await page.mouse.click(x, y); await page.keyboard.up('Alt'); await saved(page);
  expect((await draftPixels(page)).preferences.color).toBe('#8061DB');
  await page.keyboard.down('Space'); await stroke(page, 8); await page.keyboard.up('Space'); expect((await draftPixels(page)).pixels).toEqual(before);
  const zoomBefore = await page.getByTestId('zoom').textContent(); await page.mouse.wheel(0, -150);
  await expect(page.getByTestId('zoom')).not.toHaveText(zoomBefore!);
});
