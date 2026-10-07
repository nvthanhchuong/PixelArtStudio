'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, Download, Plus, AlertCircle, HardDrive, X } from 'lucide-react';
import { PixelEngine } from '@/lib/engine';
import { useEditor } from '@/lib/store';
import type { ProjectData } from '@/lib/project';
import { useProjectPersistence } from '@/hooks/useProjectPersistence';
import { PixelCanvas } from './PixelCanvas';
import { TopBar, DesktopToolbar, MobileToolbar } from './Toolbars';
import { ColorPalette } from './ColorPalette';
import { CanvasSettings } from './CanvasSettings';
import { MobileBottomSheet } from './MobileBottomSheet';
import { ExportPanel } from './ExportPanel';
import { ProjectPanel } from './ProjectPanel';
import { AnimationTimeline } from './AnimationTimeline';

function NewCanvas({ engine, close }: { engine: PixelEngine; close: () => void }) {
  const [width, setWidth] = useState('32'), [height, setHeight] = useState('32'), [confirm, setConfirm] = useState(false);
  const w = Number(width), h = Number(height), valid = Number.isInteger(w) && Number.isInteger(h) && w >= 1 && w <= 256 && h >= 1 && h <= 256;
  function create() {
    if (!valid) return;
    if (engine.hasArtwork && !confirm) { setConfirm(true); return; }
    engine.reset(w, h); useEditor.getState().set({ width: w, height: h, tool: 'pencil' }); useEditor.getState().changed(); close();
  }
  return <form onSubmit={e => { e.preventDefault(); create(); }}>
    <div className="size-presets">{[16, 32, 64, 128, 256].map(size => <button type="button" key={size} className={width === String(size) && height === String(size) ? 'selected' : ''} onClick={() => { setWidth(String(size)); setHeight(String(size)); setConfirm(false); }}>{size} × {size}</button>)}</div>
    <div className="dimension-fields"><label>Width <div><input aria-label="Width" autoComplete="off" inputMode="numeric" type="number" min="1" max="256" value={width} onChange={e => { setWidth(e.target.value); setConfirm(false); }} required /><span aria-hidden="true">px</span></div></label><span>×</span><label>Height <div><input aria-label="Height" autoComplete="off" inputMode="numeric" type="number" min="1" max="256" value={height} onChange={e => { setHeight(e.target.value); setConfirm(false); }} required /><span aria-hidden="true">px</span></div></label></div><p className="field-hint">Custom size: 1–256 pixels in each direction.</p>
    {confirm && <div role="alert" className="warning-box"><AlertCircle size={19} /><span>Your current artwork will be replaced. Save a project file or export it first to keep a copy.</span></div>}
    <button className={`primary-button full-width ${confirm ? 'danger-button' : ''}`} type="submit" disabled={!valid}><Plus size={17} />{confirm ? 'Replace artwork & create' : 'Create canvas'}</button>
    {confirm && <button className="secondary-button full-width" type="button" onClick={() => useEditor.getState().set({ panel: 'export' })}><Download size={16} /> Export current artwork</button>}
    {confirm && <button className="secondary-button full-width" type="button" onClick={() => useEditor.getState().set({ panel: 'project' })}><HardDrive size={16} /> Save current project</button>}
  </form>;
}
function HelpPanel() {
  return <div className="help-panel"><h3>Touch & touchpad</h3><p>One finger draws on a touchscreen. On a touchpad, glide two fingers to pan without clicking; pinch to zoom. On a touchscreen, use two fingers to pan and pinch. Use Pan to move with one finger. Pick samples a painted pixel and returns to Pencil.</p><h3>Keyboard shortcuts</h3><dl>{[['Pencil', 'B'], ['Eraser', 'E'], ['Eyedropper', 'I'], ['Pan', 'H'], ['Undo', 'Ctrl / ⌘ Z'], ['Redo', 'Ctrl / ⌘ Shift Z'], ['Quick erase', 'Right click'], ['Quick sample', 'Alt + click'], ['Pan canvas', 'Space + drag'], ['Touchpad pan', 'Two-finger scroll'], ['Zoom', 'Pinch / Ctrl / ⌘ + scroll']].map(([label, key]) => <div key={label}><dt>{label}</dt><dd><kbd>{key}</kbd></dd></div>)}</dl><h3>Files & autosave</h3><p>Autosave restores your local project. Save / Open keeps every frame in a .pixelart file. Export PNG saves the selected frame. Click the zoom percentage to reset to 100%.</p></div>;
}

export function Editor() {
  const [engine] = useState(() => new PixelEngine());
  const state = useEditor();
  const applyProject = useCallback((project: ProjectData) => {
    if (project.frames) engine.resetAnimation(project.width, project.height, project.frames, project.activeFrame ?? 0); else engine.reset(project.width, project.height, project.pixels);
    useEditor.getState().set({ ...project.preferences, width: project.width, height: project.height, tool: 'pencil' });
    useEditor.getState().changed();
  }, [engine]);
  const persistence = useProjectPersistence(engine, applyProject);
  useEffect(() => { document.documentElement.dataset.theme = state.theme; }, [state.theme]);
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.matches('input,textarea,select') || target.isContentEditable || useEditor.getState().panel || !useEditor.getState().hydrated || engine.playing) return;
      const state = useEditor.getState(), key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key === 'z' || key === 'y') { event.preventDefault(); if (key === 'y' || event.shiftKey ? engine.redo() : engine.undo()) state.changed(); } return;
      }
      if (event.altKey) return;
      const tool = ({ b: 'pencil', e: 'eraser', i: 'eyedropper', h: 'pan' } as const)[key as 'b' | 'e' | 'i' | 'h'];
      if (tool) state.set({ tool });
    }
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [engine]);
  const close = () => state.set({ panel: null });
  const panelTitles = { colors: 'Choose a color', grid: 'Canvas settings', new: 'New canvas', export: 'Export artwork', project: 'Project files', help: 'Help & shortcuts' };
  return <main className="editor-app">
    <TopBar engine={engine} />
    {persistence.notice && <div className="recovery-notice" role="alert"><AlertCircle size={17} /><span>{persistence.notice}</span><button className="icon-button" aria-label="Dismiss recovery notice" onClick={persistence.dismissNotice}><X size={18} /></button></div>}
    <div className="editor-body">
      <DesktopToolbar />
      <div className="canvas-column"><AnimationTimeline engine={engine} /><PixelCanvas engine={engine} /></div>
      <aside className="right-panel"><ColorPalette /><CanvasSettings /></aside>
    </div>
    <MobileToolbar />
    <footer className="app-footer"><span className={`save-state ${state.saveStatus}`} role="status">{state.saveStatus === 'saved' ? <Check size={13} /> : state.saveStatus === 'error' ? <AlertCircle size={13} /> : <HardDrive size={13} />}{state.saveStatus === 'saved' ? `All changes saved locally${state.storageMode === 'localStorage' ? ' · backup storage' : ''}` : state.saveStatus === 'saving' ? 'Saving your artwork…' : state.saveStatus === 'error' ? 'Autosave unavailable — use Save Project' : 'Restoring local project…'}{state.saveStatus === 'error' && persistence.ready && <button className="retry-save" onClick={persistence.flush}>Retry</button>}</span><button onClick={() => state.set({ panel: 'help' })}>Shortcuts <kbd>?</kbd></button></footer>
    {state.panel && <MobileBottomSheet key={state.panel} title={panelTitles[state.panel]} close={close}>{state.panel === 'colors' ? <ColorPalette /> : state.panel === 'grid' ? <CanvasSettings /> : state.panel === 'new' ? <NewCanvas engine={engine} close={close} /> : state.panel === 'export' ? <ExportPanel engine={engine} /> : state.panel === 'project' ? <ProjectPanel engine={engine} apply={applyProject} close={close} /> : <HelpPanel />}</MobileBottomSheet>}
  </main>;
}
