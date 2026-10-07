import type { Preferences } from './store';
import { families } from './colors';
export type Draft = { version: 1; width: number; height: number; pixels: Uint32Array; preferences: Preferences; savedAt: number };
// Version 1 drafts created before center guides remain readable.
type StoredDraft = Omit<Draft, 'preferences'> & { preferences: Omit<Preferences, 'centerAxesVisible'> & { centerAxesVisible?: boolean } };
let database: Promise<IDBDatabase> | undefined;
function open() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('pixel-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  }); return database;
}
export function validDraft(value: unknown): value is StoredDraft {
  if (!value || typeof value !== 'object') return false;
  const d = value as StoredDraft, p = d.preferences;
  return d.version === 1 && Number.isInteger(d.width) && d.width > 0 && d.width <= 256 && Number.isInteger(d.height) && d.height > 0 && d.height <= 256
    && d.pixels instanceof Uint32Array && d.pixels.length === d.width * d.height && !!p
    && /^#[0-9a-f]{6}$/i.test(p.color) && Array.isArray(p.recent) && p.recent.length <= 20 && p.recent.every(c => /^#[0-9a-f]{6}$/i.test(c))
    && families.some(f => f.name === p.family) && Number.isInteger(p.gridSize) && p.gridSize >= 1 && p.gridSize <= 256
    && typeof p.gridVisible === 'boolean' && (p.centerAxesVisible === undefined || typeof p.centerAxesVisible === 'boolean')
    && ['light', 'dark'].includes(p.theme) && Number.isFinite(p.zoom) && p.zoom >= .5 && p.zoom <= 64;
}
export async function readDraft(): Promise<Draft | null> {
  const db = await open(); return new Promise((resolve, reject) => {
    const request = db.transaction('projects').objectStore('projects').get('draft');
    request.onsuccess = () => {
      const stored: unknown = request.result;
      if (validDraft(stored)) resolve({ ...stored, preferences: { ...stored.preferences, centerAxesVisible: stored.preferences.centerAxesVisible ?? false } });
      else if (stored) reject(new Error('Invalid draft'));
      else resolve(null);
    };
    request.onerror = () => reject(request.error);
  });
}
export async function writeDraft(draft: Draft) {
  const db = await open(); return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite'); transaction.objectStore('projects').put(draft, 'draft');
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  });
}
