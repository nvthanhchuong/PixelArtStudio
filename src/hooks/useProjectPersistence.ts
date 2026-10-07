'use client';
import { useEffect, useRef, useState } from 'react';
import type { PixelEngine } from '@/lib/engine';
import { preferences, useEditor } from '@/lib/store';
import { snapshotProject, type ProjectData } from '@/lib/project';
import { backupDraft, readDraft, storageMode, writeDraft } from '@/lib/storage';

export function useProjectPersistence(engine: PixelEngine, apply: (project: ProjectData) => void) {
  const [ready, setReady] = useState(false), [notice, setNotice] = useState('');
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true;
    readDraft().then(project => {
      if (!alive) return;
      if (project) apply(project);
      useEditor.getState().set({ hydrated: true, storageMode: storageMode(), saveStatus: 'saving' });
      setReady(true);
    }).catch(error => {
      if (!alive) return;
      setNotice(error instanceof Error ? error.message : 'Could not restore local data. Use Save Project to keep your artwork.');
      useEditor.getState().set({ hydrated: true, saveStatus: 'error' }); setReady(true);
    });
    return () => { alive = false; };
  }, [apply]);
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout>, generation = 0, active = true;
    const snapshot = () => snapshotProject(engine, preferences());
    const signature = () => JSON.stringify([useEditor.getState().revision, preferences()]);
    let previous = signature(), previousRevision = useEditor.getState().revision;
    function flush() {
      clearTimeout(timer);
      const id = ++generation, project = snapshot();
      // This part completes synchronously even when the tab is about to close.
      useEditor.getState().set({ saveStatus: 'saving' });
      void writeDraft(project).then(() => {
        if (active && id === generation) useEditor.getState().set({ saveStatus: 'saved', storageMode: storageMode() });
      }).catch(() => {
        if (active && id === generation) useEditor.getState().set({ saveStatus: 'error', storageMode: null });
      });
    }
    function queue(checkpoint: boolean) {
      clearTimeout(timer); ++generation;
      if (checkpoint) backupDraft(snapshot());
      useEditor.getState().set({ saveStatus: 'saving' }); timer = setTimeout(flush, 800);
    }
    const unsubscribe = useEditor.subscribe(state => {
      const next = signature();
      if (next === previous) return;
      const checkpoint = state.revision !== previousRevision;
      previous = next; previousRevision = state.revision; queue(checkpoint);
    });
    function leave() {
      engine.stopPlayback();
      if (engine.isDrawing && engine.commit()) useEditor.getState().changed();
      flush();
    }
    function visibility() { if (document.visibilityState === 'hidden') leave(); }
    flushRef.current = flush;
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', leave);
    queue(false);
    return () => {
      active = false; clearTimeout(timer); unsubscribe();
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', leave);
      flushRef.current = () => {};
    };
  }, [ready, engine]);
  return { ready, notice, dismissNotice: () => setNotice(''), flush: () => flushRef.current() };
}
