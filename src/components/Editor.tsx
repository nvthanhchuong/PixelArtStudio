'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Circle, Download, FileImage, Plus, RotateCcw, Share2, Sparkles, AlertCircle, HardDrive, Pencil, ArrowRight } from 'lucide-react';
import { PixelEngine } from '@/lib/engine';
import { useEditor, preferences } from '@/lib/store';
import { readDraft, writeDraft, type Draft } from '@/lib/storage';
import { exportPng } from '@/lib/export';
import { PixelCanvas } from './PixelCanvas';
import { TopBar, DesktopToolbar, MobileToolbar } from './Toolbars';
import { ColorPalette } from './ColorPalette';
import { CanvasSettings } from './CanvasSettings';
import { MobileBottomSheet } from './MobileBottomSheet';

function NewCanvas({ engine, close }: { engine: PixelEngine; close: () => void }) {
  const [width, setWidth] = useState('32'), [height, setHeight] = useState('32'), [confirm, setConfirm] = useState(false);
  const w = Number(width), h = Number(height), valid = Number.isInteger(w) && Number.isInteger(h) && w >= 1 && w <= 256 && h >= 1 && h <= 256;
  function create() {
    if (!valid) return;
    if (engine.hasArtwork && !confirm) { setConfirm(true); return; }
    engine.reset(w, h); useEditor.getState().set({ width: w, height: h, tool: 'pencil' }); useEditor.getState().changed(); close();
  }
  return <form onSubmit={e => { e.preventDefault(); create(); }}>
    <div className="dialog-illustration"><GridMark /></div><h3 className="dialog-title">A fresh start, pixel by pixel.</h3><p className="dialog-description">Choose your canvas size. Small ideas welcome.</p>
    <div className="size-presets">{[16, 32, 64, 128, 256].map(size => <button type="button" key={size} className={width === String(size) && height === String(size) ? 'selected' : ''} onClick={() => { setWidth(String(size)); setHeight(String(size)); setConfirm(false); }}>{size} × {size}</button>)}</div>
    <div className="dimension-fields"><label>Width <div><input aria-label="Width" autoComplete="off" inputMode="numeric" type="number" min="1" max="256" value={width} onChange={e => { setWidth(e.target.value); setConfirm(false); }} required /><span aria-hidden="true">px</span></div></label><span>×</span><label>Height <div><input aria-label="Height" autoComplete="off" inputMode="numeric" type="number" min="1" max="256" value={height} onChange={e => { setHeight(e.target.value); setConfirm(false); }} required /><span aria-hidden="true">px</span></div></label></div><p className="field-hint">Custom size: 1–256 pixels in each direction.</p>
    {confirm && <div role="alert" className="warning-box"><AlertCircle size={19} /><span>Your current artwork will be replaced. Export it first if you want to keep it.</span></div>}
    <button className={`primary-button full-width ${confirm ? 'danger-button' : ''}`} type="submit" disabled={!valid}><Plus size={17} />{confirm ? 'Replace artwork & create' : 'Create canvas'}</button>
    {confirm && <button className="secondary-button full-width" type="button" onClick={() => useEditor.getState().set({ panel: 'export' })}><Download size={16} /> Export current artwork</button>}
    <button className="text-button full-width" type="button" onClick={() => useEditor.getState().set({ panel: 'help' })}>View gestures & keyboard shortcuts <ArrowRight size={14} /></button>
  </form>;
}
function GridMark() { return <span className="grid-mark">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>; }
function ExportPanel({ engine }: { engine: PixelEngine }) {
  const [url, setUrl] = useState(''), [blob, setBlob] = useState<Blob | null>(null), [error, setError] = useState(''), [shareable, setShareable] = useState(false);
  const filename = `pixel-studio-${engine.width}x${engine.height}.png`;
  useEffect(() => {
    let alive = true, objectUrl = '';
    exportPng(engine).then(result => {
      if (!alive) return;
      objectUrl = URL.createObjectURL(result); setUrl(objectUrl); setBlob(result);
      setShareable(!!navigator.canShare?.({ files: [new File([result], filename, { type: 'image/png' })] }));
    }).catch(() => setError('Could not create the PNG. Close this panel and try again.'));
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [engine, filename]);
  async function share() {
    if (!blob) return;
    try { await navigator.share({ files: [new File([blob], filename, { type: 'image/png' })], title: 'My pixel art' }); }
    catch (error) { if ((error as DOMException).name !== 'AbortError') setError('Sharing is unavailable. Use Download PNG or Open image instead.'); }
  }
  return <div><div className="export-preview">{url ? <img src={url} alt="Your artwork, ready to export" /> : <FileImage size={36} />}</div><h3 className="dialog-title">A little art. Ready to go.</h3><p className="dialog-description">{engine.width} × {engine.height} pixels · PNG · Transparent background</p><p className="field-hint">Original pixels, with no grid or interface.</p>{url && <><a className="primary-button full-width" href={url} download={filename}><Download size={17} />Download PNG</a><div className="export-options"><a className="secondary-button" href={url} target="_blank" rel="noopener noreferrer"><FileImage size={16} />Open image</a>{shareable && <button className="secondary-button" onClick={share}><Share2 size={16} />Share / Save</button>}</div></>}{error && <p role="alert" className="warning-box">{error}</p>}<div className="ios-note"><span>On iPhone</span><p>Use Share / Save, or open the image and touch & hold it to save to Photos.</p></div></div>;
}
function HelpPanel() {
  return <div className="help-panel"><div className="help-callout"><Pencil size={22} /><div><strong>Your next little masterpiece.</strong><p>Pick a color, then make your first mark.</p></div></div><h3>Touch gestures</h3><p>One finger draws. Two fingers move and pinch to zoom. Use Pan to move with one finger. Pick samples a painted pixel and returns to Pencil.</p><h3>Keyboard shortcuts</h3><dl>{[['Pencil', 'B'], ['Eraser', 'E'], ['Eyedropper', 'I'], ['Pan', 'H'], ['Undo', 'Ctrl / ⌘ Z'], ['Redo', 'Ctrl / ⌘ Shift Z'], ['Quick erase', 'Right click'], ['Quick sample', 'Alt + click'], ['Pan canvas', 'Space + drag'], ['Zoom', 'Mouse wheel']].map(([label, key]) => <div key={label}><dt>{label}</dt><dd><kbd>{key}</kbd></dd></div>)}</dl><h3>Made to stay on your device</h3><p>Autosave keeps one local draft in this browser. Reopening offers to restore it. Export PNGs to keep additional artworks.</p></div>;
}

export function Editor() {
  const [engine] = useState(() => new PixelEngine());
  const state = useEditor();
  const [draft, setDraft] = useState<Draft | null>(null), [ready, setReady] = useState(false), [loadError, setLoadError] = useState(false);
  const flushRef = useRef<() => void>(() => {});
  const restore = () => {
    if (!draft) return;
    engine.reset(draft.width, draft.height, draft.pixels);
    state.set({ ...draft.preferences, width: draft.width, height: draft.height });
    setDraft(null); setReady(true); state.changed();
  };
  useEffect(() => { document.documentElement.dataset.theme = state.theme; }, [state.theme]);
  useEffect(() => {
    let alive = true;
    readDraft().then(saved => {
      if (!alive) return;
      if (saved) { setDraft(saved); useEditor.getState().set({ theme: saved.preferences.theme, saveStatus: 'saved' }); }
      else { setReady(true); useEditor.getState().set({ saveStatus: 'saved' }); }
    }).catch(() => { if (alive) { setLoadError(true); useEditor.getState().set({ saveStatus: 'error' }); } });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout>, generation = 0, active = true;
    function signature() { return JSON.stringify([useEditor.getState().revision, preferences()]); }
    let previous = signature();
    function flush() {
      clearTimeout(timer);
      const id = ++generation;
      const snapshot: Draft = { version: 1, width: engine.width, height: engine.height, pixels: engine.pixels.slice(), preferences: preferences(), savedAt: Date.now() };
      useEditor.getState().set({ saveStatus: 'saving' });
      writeDraft(snapshot).then(() => { if (active && id === generation) useEditor.getState().set({ saveStatus: 'saved' }); })
        .catch(() => { if (active && id === generation) useEditor.getState().set({ saveStatus: 'error' }); });
    }
    function queue() { clearTimeout(timer); useEditor.getState().set({ saveStatus: 'saving' }); timer = setTimeout(flush, 800); }
    const unsubscribe = useEditor.subscribe(() => { const next = signature(); if (next !== previous) { previous = next; queue(); } });
    function visibility() { if (document.visibilityState === 'hidden') flush(); }
    flushRef.current = flush;
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', flush); queue();
    return () => { active = false; clearTimeout(timer); unsubscribe(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', flush); };
  }, [ready, engine]);
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.matches('input,textarea,select') || target.isContentEditable || useEditor.getState().panel || draft) return;
      const state = useEditor.getState(), key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key === 'z' || key === 'y') { event.preventDefault(); if (key === 'y' || event.shiftKey ? engine.redo() : engine.undo()) state.changed(); } return;
      }
      if (event.altKey) return;
      const tool = ({ b: 'pencil', e: 'eraser', i: 'eyedropper', h: 'pan' } as const)[key as 'b' | 'e' | 'i' | 'h'];
      if (tool) state.set({ tool });
    }
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [engine, draft]);
  const close = () => state.set({ panel: null });
  const panelTitles = { colors: 'Choose a color', grid: 'Canvas settings', new: 'New canvas', export: 'Export artwork', help: 'A little help' };
  return <main className="editor-app">
    <TopBar engine={engine} />
    <div className="editor-body"><DesktopToolbar /><div className="canvas-column"><div className="canvas-topline"><div><span className="canvas-tab"><span className="tab-dot" /> Untitled artwork</span><span className="canvas-type">PIXEL CANVAS</span></div><span className="canvas-meta">{state.width} × {state.height} px <span>•</span> Transparent</span></div><PixelCanvas engine={engine} /><div className="canvas-status"><div><span className="status-color" style={{ background: state.color }} /><span>{state.tool === 'eyedropper' ? 'Eyedropper' : state.tool[0].toUpperCase() + state.tool.slice(1)}</span><span className="status-divider" /><span>{state.gridSize} px grid</span></div><span><Circle size={11} />{state.width * state.height} pixels of possibility</span></div></div><aside className="right-panel"><ColorPalette /><CanvasSettings /><div className="sidebar-note"><Sparkles size={15} /><span>Big ideas start with a tiny pixel.</span></div></aside></div>
    <MobileToolbar />
    <footer className="app-footer"><span className={`save-state ${state.saveStatus}`} role="status">{state.saveStatus === 'saved' ? <Check size={13} /> : state.saveStatus === 'error' ? <AlertCircle size={13} /> : <HardDrive size={13} />}{state.saveStatus === 'saved' ? 'All changes saved locally' : state.saveStatus === 'saving' ? 'Saving your artwork…' : state.saveStatus === 'error' ? 'Autosave unavailable — export to keep your work' : 'Checking local draft…'}{state.saveStatus === 'error' && ready && <button className="retry-save" onClick={() => flushRef.current()}>Retry</button>}</span><span>Made for small moments of creativity <span className="footer-dot">✦</span></span><button onClick={() => state.set({ panel: 'help' })}>Shortcuts <kbd>?</kbd></button></footer>
    {state.panel && <MobileBottomSheet key={state.panel} title={panelTitles[state.panel]} close={close}>{state.panel === 'colors' ? <ColorPalette /> : state.panel === 'grid' ? <CanvasSettings /> : state.panel === 'new' ? <NewCanvas engine={engine} close={close} /> : state.panel === 'export' ? <ExportPanel engine={engine} /> : <HelpPanel />}</MobileBottomSheet>}
    {draft && <MobileBottomSheet title="Welcome back" close={restore}><div className="dialog-illustration"><RotateCcw size={28} /></div><h3 className="dialog-title">Your canvas is waiting.</h3><p className="dialog-description">A {draft.width} × {draft.height} draft was saved on this device.<br />Restore it and pick up where you left off.</p><button className="primary-button full-width" onClick={restore}><RotateCcw size={17} />Restore artwork</button><button className="secondary-button full-width" onClick={() => { if (window.confirm('Discard the saved draft and start a blank canvas? This cannot be undone.')) { setDraft(null); setReady(true); } }}>Start fresh</button></MobileBottomSheet>}
    {loadError && <MobileBottomSheet title="Local draft unavailable" close={() => setLoadError(false)}><div className="warning-box"><AlertCircle size={20} /><p>We could not read this browser’s draft. You can still draw and export PNGs. The existing draft will be preserved.</p></div><button className="primary-button full-width" onClick={() => setLoadError(false)}>Continue without autosave</button><button className="secondary-button full-width" onClick={() => window.location.reload()}>Try again</button></MobileBottomSheet>}
  </main>;
}
