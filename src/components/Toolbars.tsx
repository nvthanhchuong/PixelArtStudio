'use client';
import { Pencil, Eraser, Pipette, Hand, Grid2X2, Plus, Undo2, Redo2, Sun, Moon, Download, Menu, FolderOpen, CircleHelp, type LucideIcon } from 'lucide-react';
import { useEditor, type Tool } from '@/lib/store';
import type { PixelEngine } from '@/lib/engine';
import { useSyncExternalStore } from 'react';
const tools: { id: Tool; label: string; key: string; icon: LucideIcon }[] = [
  { id: 'pencil', label: 'Pencil', key: 'B', icon: Pencil }, { id: 'eraser', label: 'Eraser', key: 'E', icon: Eraser },
  { id: 'eyedropper', label: 'Eyedropper', key: 'I', icon: Pipette }, { id: 'pan', label: 'Pan', key: 'H', icon: Hand },
];
export function ThemeToggle() {
  const theme = useEditor(s => s.theme), set = useEditor(s => s.set);
  return <button className="icon-button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title="Switch theme" onClick={() => set({ theme: theme === 'light' ? 'dark' : 'light' })}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button>;
}
export function TopBar({ engine }: { engine: PixelEngine }) {
  const state = useEditor();
  const playing = useSyncExternalStore(engine.subscribe, () => engine.playing, () => false);
  const action = (redo: boolean) => { if (redo ? engine.redo() : engine.undo()) state.changed(); };
  return <header className="topbar">
    <a className="brand" href="/" aria-label="Pixel Studio"><span className="brand-symbol"><span /><span /><span /><span /></span><span>pixel<span className="brand-light">studio</span></span></a>
    <div className="top-actions">
      <div className="history-buttons"><button className="icon-button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={playing || !engine.history.past.length} onClick={() => action(false)}><Undo2 size={18} /></button><button className="icon-button" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={playing || !engine.history.future.length} onClick={() => action(true)}><Redo2 size={18} /></button></div>
      <ThemeToggle />
      <button className="project-button desktop-project" aria-label="Save or open project" title="Save / Open Project" disabled={!state.hydrated} onClick={() => state.set({ panel: 'project' })}><FolderOpen size={17} /><span>Save / Open</span></button>
      <button className="export-button" aria-label="Export PNG" title="Export PNG" onClick={() => state.set({ panel: 'export' })}><Download size={17} /><span>Export PNG</span></button>
      <button className="icon-button mobile-menu" aria-label="Open menu" disabled={!state.hydrated} onClick={() => state.set({ panel: 'project' })}><Menu size={20} /></button>
    </div>
  </header>;
}
export function DesktopToolbar() {
  const tool = useEditor(s => s.tool), set = useEditor(s => s.set), color = useEditor(s => s.color);
  return <aside className="desktop-toolbar"><div className="tool-list">{tools.map(({ id, label, key, icon: Icon }) => <button key={id} className={`tool-button ${tool === id ? 'active' : ''}`} aria-label={label} aria-pressed={tool === id} title={`${label} (${key})`} onClick={() => set({ tool: id })}><Icon size={21} /><span>{label}</span></button>)}</div><div className="toolbar-separator" /><button className="tool-button" aria-label="Canvas settings" title="Canvas settings" onClick={() => set({ panel: 'grid' })}><Grid2X2 size={21} /><span>Grid</span></button><button className="tool-button" aria-label="New canvas" title="New canvas" onClick={() => set({ panel: 'new' })}><Plus size={21} /><span>New</span></button><div className="toolbar-bottom"><button className="active-swatch" style={{ background: color }} aria-label="Open colors" title="Current color" onClick={() => set({ panel: 'colors' })} /><button className="icon-button" aria-label="Help and shortcuts" title="Help and shortcuts" onClick={() => set({ panel: 'help' })}><CircleHelp size={20} /></button></div></aside>;
}
export function MobileToolbar() {
  const tool = useEditor(s => s.tool), set = useEditor(s => s.set), color = useEditor(s => s.color);
  return <nav className="mobile-toolbar" aria-label="Drawing tools">{tools.map(({ id, label, icon: Icon }) => <button key={id} className={tool === id ? 'active' : ''} aria-label={label} aria-pressed={tool === id} onClick={() => set({ tool: id })}><Icon size={21} /><span>{id === 'eyedropper' ? 'Pick' : label}</span></button>)}<button aria-label="Open colors" onClick={() => set({ panel: 'colors' })}><span className="mobile-swatch" style={{ background: color }} /><span>Color</span></button><button aria-label="Canvas settings" onClick={() => set({ panel: 'grid' })}><Grid2X2 size={21} /><span>Grid</span></button></nav>;
}
