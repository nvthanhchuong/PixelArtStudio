'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, Plus, Share2 } from 'lucide-react';
import type { PixelEngine } from '@/lib/engine';
import { useEditor, preferences } from '@/lib/store';
import { MAX_PROJECT_BYTES, parseProject, serializeProject, snapshotProject, type ProjectData } from '@/lib/project';

export function ProjectPanel({ engine, apply, close }: { engine: PixelEngine; apply: (project: ProjectData) => void; close: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ project: ProjectData; filename: string } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [download, setDownload] = useState<{ url: string; file: File; shareable: boolean } | null>(null);
  const active = useRef(true), generation = useRef(0);
  useEffect(() => {
    active.current = true; let url = '';
    try {
      const json = serializeProject(snapshotProject(engine, preferences()));
      const file = new File([json], `pixel-studio-${engine.width}x${engine.height}.pixelart`, { type: 'application/json' });
      url = URL.createObjectURL(file);
      let shareable = false;
      try { shareable = !!navigator.canShare?.({ files: [file] }); } catch { /* Download is the fallback. */ }
      setDownload({ url, file, shareable });
    } catch { setError('Could not prepare the project file. Close this panel and try again.'); }
    return () => { active.current = false; ++generation.current; if (url) URL.revokeObjectURL(url); };
  }, [engine]);
  async function open(file: File) {
    setError(''); setPending(null); setBusy(true);
    const id = ++generation.current;
    try {
      if (file.size > MAX_PROJECT_BYTES) throw new Error('Project files must be smaller than 32 MB.');
      const project = parseProject(await file.text());
      if (!active.current || generation.current !== id) return;
      if (engine.hasArtwork) setPending({ project, filename: file.name });
      else { apply(project); close(); }
    } catch (error) { if (active.current && generation.current === id) setError(error instanceof Error ? error.message : 'Could not read the project file.'); }
    finally { if (active.current && generation.current === id) setBusy(false); }
  }
  async function share() {
    if (!download) return;
    try { await navigator.share({ files: [download.file], title: 'My editable pixel art project' }); }
    catch (error) { if ((error as DOMException).name !== 'AbortError') setError('Sharing is unavailable. Use Save Project instead.'); }
  }
  return <div className="project-panel">
    <p className="dialog-description">.pixelart · All frames and settings</p>
    {download && <a className="primary-button full-width" href={download.url} download={download.file.name}><Download size={17} />Save Project</a>}
    {download?.shareable && <button className="secondary-button full-width" onClick={share}><Share2 size={16} />Share project file</button>}
    <button className="secondary-button full-width" disabled={busy} onClick={() => input.current?.click()}><FolderOpen size={17} />{busy ? 'Reading project…' : 'Open Project'}</button>
    <input ref={input} type="file" accept=".pixelart,.json,application/json" className="file-input" data-testid="open-project-input" aria-label="Choose project file" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void open(file); }} />
    {error && <p role="alert" className="warning-box">{error}</p>}
    {pending && <div className="import-confirmation"><p className="warning-box" role="alert">Opening {pending.filename} will replace your current artwork. Save Project first to keep it.</p><button className="primary-button full-width" onClick={() => { apply(pending.project); close(); }}>Replace artwork & open</button><button className="secondary-button full-width" onClick={() => setPending(null)}>Cancel import</button></div>}
    <button className="text-button full-width" onClick={() => useEditor.getState().set({ panel: 'new' })}><Plus size={16} />New canvas</button>
  </div>;
}
