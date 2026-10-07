import { normalizeDraft, parseProject, serializeProject, type ProjectData } from './project';
export { validDraft } from './project';
export type Draft = ProjectData;
export const BACKUP_KEY = 'pixel-studio:draft-backup';
export const RECOVERY_KEY = 'pixel-studio:recovery-draft';
export class CorruptDraftError extends Error {}

let database: Promise<IDBDatabase> | undefined;
let mode: 'indexeddb' | 'localStorage' | null = null;
let protectPrimary = false, protectBackup = false, backupKey = BACKUP_KEY;
export function storageMode() { return mode; }

function open(): Promise<IDBDatabase> {
  if (database) return database;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Browser database unavailable.')); return; }
    let settled = false;
    const timeout = setTimeout(() => { settled = true; reject(new Error('Browser database did not respond.')); }, 3500);
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open('pixel-studio', 1); }
    catch (error) { clearTimeout(timeout); reject(error); return; }
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('projects')) request.result.createObjectStore('projects'); };
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (settled) { request.result.close(); return; }
      settled = true;
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
    request.onerror = () => { clearTimeout(timeout); settled = true; reject(request.error); };
    request.onblocked = () => { clearTimeout(timeout); settled = true; reject(new Error('Browser database is blocked by another tab.')); };
  });
  database = opening;
  void opening.catch(() => { if (database === opening) database = undefined; });
  return opening;
}
async function readPrimary(): Promise<Draft | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = db.transaction('projects'); } catch (error) { reject(error); return; }
    const timeout = setTimeout(() => { tx.abort(); reject(new Error('Browser database did not respond.')); }, 3500);
    const request = tx.objectStore('projects').get('draft');
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (request.result === undefined || request.result === null) { resolve(null); return; }
      try { resolve(normalizeDraft(request.result)); }
      catch { reject(new CorruptDraftError('The saved draft could not be read. Its original data has been preserved.')); }
    };
    request.onerror = () => { clearTimeout(timeout); reject(request.error); };
    tx.onabort = () => { clearTimeout(timeout); reject(tx.error); };
  });
}
function readBackup(key: string): Draft | null {
  const text = localStorage.getItem(key);
  if (text === null) return null;
  try { return parseProject(text); }
  catch { throw new CorruptDraftError('A local backup could not be read. Its original data has been preserved.'); }
}
export async function readDraft(): Promise<Draft | null> {
  let primary: Draft | null = null, primaryError: unknown, backupError: unknown;
  try { primary = await readPrimary(); mode = 'indexeddb'; }
  catch (error) { primaryError = error; mode = null; if (error instanceof CorruptDraftError) { protectPrimary = true; backupKey = RECOVERY_KEY; } }
  const candidates = primary ? [primary] : [];
  for (const key of [BACKUP_KEY, RECOVERY_KEY]) {
    try { const backup = readBackup(key); if (backup) candidates.push(backup); }
    catch (error) {
      backupError = error;
      if (error instanceof CorruptDraftError) { backupKey = RECOVERY_KEY; if (key === RECOVERY_KEY) protectBackup = true; }
    }
  }
  if (candidates.length) {
    if (!mode || protectPrimary) mode = 'localStorage';
    return candidates.reduce((latest, draft) => draft.savedAt >= latest.savedAt ? draft : latest);
  }
  if (primaryError instanceof CorruptDraftError || backupError instanceof CorruptDraftError) {
    throw new CorruptDraftError('The saved draft could not be read. Original data is preserved; your new artwork will use a separate recovery draft.');
  }
  if (primaryError && backupError) throw new Error('Local saving is unavailable in this browser. Use Save Project to keep your work.');
  if (primaryError) mode = 'localStorage';
  return null;
}
// Synchronous safety journal: one checkpoint per completed stroke, plus pagehide.
// Regular database writes stay debounced; wheel/pointer moves never serialize pixels.
export function backupDraft(draft: Draft): boolean {
  if (protectBackup) return false;
  try { localStorage.setItem(backupKey, serializeProject(draft)); return true; }
  catch { return false; }
}
export async function writeDraft(draft: Draft): Promise<void> {
  const backedUp = backupDraft(draft);
  if (!protectPrimary) {
    try {
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('projects', 'readwrite');
        const timeout = setTimeout(() => { tx.abort(); reject(new Error('Browser database did not respond.')); }, 3500);
        tx.objectStore('projects').put(draft, 'draft');
        tx.oncomplete = () => { clearTimeout(timeout); resolve(); };
        tx.onerror = tx.onabort = () => { clearTimeout(timeout); reject(tx.error); };
      });
      mode = 'indexeddb'; return;
    } catch { /* The safety journal is also the fallback when IndexedDB fails. */ }
  }
  if (backedUp) { mode = 'localStorage'; return; }
  mode = null; throw new Error('Local saving is unavailable. Use Save Project to keep your work.');
}
