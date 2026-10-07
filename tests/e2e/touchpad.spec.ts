import { test, expect, type Page } from '@playwright/test';

async function saved(page: Page) { await expect(page.getByRole('status').filter({ hasText: 'All changes saved locally' })).toBeVisible(); }
async function paintedPixels(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('pixel-studio', 1); r.onsuccess = () => resolve(r.result); });
    const pixels = await new Promise<number[]>(resolve => { const r = db.transaction('projects').objectStore('projects').get('draft'); r.onsuccess = () => resolve([...r.result.pixels]); });
    db.close(); return pixels;
  });
}

test('two-finger wheel pans without clicking, pinch zooms, and browser overlays stay blocked in canvas', async ({ page }, info) => {
  await page.goto('/'); await saved(page);
  const canvas = page.getByTestId('pixel-canvas'), box = (await canvas.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2 - 15;
  async function wheel(dx: number, dy: number, ctrlKey = false) {
    if (info.project.name.startsWith('webkit') && info.project.name !== 'webkit-desktop') {
      // Playwright mobile WebKit has no native wheel API; exercise its event path explicitly.
      const cancelled = await canvas.evaluate((element, delta) => {
        const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: delta.dx, deltaY: delta.dy, ctrlKey: delta.ctrlKey, clientX: delta.x, clientY: delta.y });
        element.dispatchEvent(event); return event.defaultPrevented;
      }, { dx, dy, ctrlKey, x, y });
      expect(cancelled).toBe(true);
    } else {
      if (ctrlKey) await page.keyboard.down('Control');
      await page.mouse.wheel(dx, dy);
      if (ctrlKey) await page.keyboard.up('Control');
    }
  }
  await page.mouse.click(x, y); await saved(page);
  const before = await paintedPixels(page); expect(before.filter(Boolean)).toHaveLength(1);
  const scale = await page.getByTestId('zoom').textContent();
  const image = await canvas.evaluate(c => (c as HTMLCanvasElement).toDataURL());
  await wheel(36, 24);
  await expect.poll(() => canvas.evaluate(c => (c as HTMLCanvasElement).toDataURL())).not.toBe(image);
  await expect(page.getByTestId('zoom')).toHaveText(scale!);
  // The same artwork pixel has moved left/up, proving pan changes coordinates without zoom.
  await page.mouse.click(x - 36, y - 24); await saved(page);
  expect(await paintedPixels(page)).toEqual(before);
  await wheel(0, -150, true);
  await expect(page.getByTestId('zoom')).not.toHaveText(scale!);
  const wheelScale = parseInt((await page.getByTestId('zoom').textContent())!);
  const cancelledGestures = await canvas.evaluate((element, anchor) => {
    return ['gesturestart', 'gesturechange', 'gestureend'].map((name, i) => {
      const event = new Event(name, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { scale: { value: i === 0 ? 1 : 1.2 }, clientX: { value: anchor.x }, clientY: { value: anchor.y } });
      element.dispatchEvent(event); return event.defaultPrevented;
    });
  }, { x, y });
  expect(cancelledGestures).toEqual([true, true, true]);
  await expect.poll(async () => parseInt((await page.getByTestId('zoom').textContent())!)).toBeGreaterThan(wheelScale);
  await saved(page); expect(await paintedPixels(page)).toEqual(before);
  const prevented = await canvas.evaluate(element => {
    const results = ['contextmenu', 'dragstart', 'copy', 'cut'].map(name => {
      const event = new Event(name, { bubbles: true, cancelable: true }); element.dispatchEvent(event); return event.defaultPrevented;
    });
    for (const key of ['a', 'c', 'x']) {
      const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true }); element.dispatchEvent(event); results.push(event.defaultPrevented);
    }
    return { results, userSelect: getComputedStyle(element).userSelect, browserScale: visualViewport?.scale ?? 1 };
  });
  expect(prevented.results.every(Boolean)).toBe(true); expect(prevented.userSelect).toBe('none'); expect(prevented.browserScale).toBe(1);
  await page.getByRole('button', { name: 'Open colors', exact: true }).filter({ visible: true }).click();
  const hexCopyBlocked = await page.getByRole('dialog').locator('.current-color strong').evaluate(element => {
    const event = new Event('copy', { bubbles: true, cancelable: true }); element.dispatchEvent(event); return event.defaultPrevented;
  });
  expect(hexCopyBlocked).toBe(false);
});
