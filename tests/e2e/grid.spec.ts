import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

async function saved(page: Page) { await expect(page.getByRole('status').filter({ hasText: 'All changes saved locally' })).toBeVisible(); }
async function openGrid(page: Page) { await page.getByRole('button', { name: 'Canvas settings', exact: true }).filter({ visible: true }).click(); return page.getByRole('dialog'); }
async function centerPixels(page: Page) {
  return page.getByTestId('pixel-canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement, dpr = devicePixelRatio;
    return [...canvas.getContext('2d')!.getImageData(Math.round(canvas.width / 2 - 6 * dpr), Math.round(canvas.height / 2 - 21 * dpr), Math.round(12 * dpr), Math.round(12 * dpr)).data];
  });
}

test('center axes render independently, persist, preserve old drafts, and stay out of PNG', async ({ page }, info) => {
  await page.goto('/'); await saved(page);
  let dialog = await openGrid(page);
  await expect(dialog.getByRole('switch', { name: 'Show center axes' })).toHaveAttribute('aria-checked', 'false');
  await dialog.getByRole('switch', { name: 'Show pixel grid' }).click();
  await dialog.getByRole('button', { name: 'Close panel' }).click();
  await saved(page); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const withoutAxes = await centerPixels(page);
  dialog = await openGrid(page); await dialog.getByRole('switch', { name: 'Show center axes' }).click();
  await dialog.getByRole('button', { name: 'Close panel' }).click(); await saved(page);
  await expect.poll(() => centerPixels(page)).not.toEqual(withoutAxes);
  await page.screenshot({ path: `test-results/${info.project.name}-center-axes-light.png` });
  await page.getByRole('button', { name: 'Switch to dark theme' }).click(); await saved(page);
  await page.screenshot({ path: `test-results/${info.project.name}-center-axes-dark.png` });
  await page.reload(); await saved(page);
  dialog = await openGrid(page);
  await expect(dialog.getByRole('switch', { name: 'Show center axes' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByRole('switch', { name: 'Show pixel grid' })).toHaveAttribute('aria-checked', 'false');
  await dialog.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Export PNG' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download PNG' }).click()]);
  const png = PNG.sync.read(await readFile((await download.path())!));
  expect([png.width, png.height]).toEqual([32, 32]); expect([...png.data].every(value => value === 0)).toBe(true);
  await page.getByRole('button', { name: 'Close panel' }).click();
  // Simulate a pre-update draft: the newly added preference is absent.
  await page.goto('/favicon.svg');
  await page.evaluate(async () => {
    localStorage.removeItem('pixel-studio:draft-backup'); localStorage.removeItem('pixel-studio:recovery-draft');
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('pixel-studio', 1); request.onsuccess = () => resolve(request.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite'), store = tx.objectStore('projects'), request = store.get('draft');
      request.onsuccess = () => { const draft = request.result; delete draft.preferences.centerAxesVisible; delete draft.preferences.wheelBehavior; store.put(draft, 'draft'); };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); db.close();
  });
  await page.goto('/'); await saved(page);
  dialog = await openGrid(page); await expect(dialog.getByRole('switch', { name: 'Show center axes' })).toHaveAttribute('aria-checked', 'false');
});
