'use client';
import { Plus, ChevronRight } from 'lucide-react';
import { useId } from 'react';
import { useEditor } from '@/lib/store';

export function CanvasSettings() {
  const state = useEditor(), inputId = useId();
  return <section className="canvas-settings">
    <div className="panel-heading"><h2>Canvas</h2></div>
    <div className="setting-line"><span>Pixel grid</span><button role="switch" aria-checked={state.gridVisible} aria-label="Show pixel grid" className={`switch ${state.gridVisible ? 'on' : ''}`} onClick={() => state.set({ gridVisible: !state.gridVisible })}><span /></button></div>
    <div className="setting-line"><span>Center axes</span><button role="switch" aria-checked={state.centerAxesVisible} aria-label="Show center axes" title="Horizontal and vertical center guides" className={`switch ${state.centerAxesVisible ? 'on' : ''}`} onClick={() => state.set({ centerAxesVisible: !state.centerAxesVisible })}><span /></button></div>
    <div className="setting-line"><label htmlFor={inputId}>Grid cell size</label><div className="number-with-unit"><input id={inputId} aria-label="Grid cell size" type="number" min={1} max={256} value={state.gridSize} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 256) state.set({ gridSize: n }); }} /><span>px</span></div></div>
    <div className="grid-presets">{[1, 2, 4, 8].map(size => <button key={size} className={state.gridSize === size ? 'selected' : ''} onClick={() => state.set({ gridSize: size })}>{size} px</button>)}</div>
    <div className="canvas-size-line"><strong>{state.width} × {state.height} <small>px</small></strong></div>
    <button className="new-canvas-button" onClick={() => state.set({ panel: 'new' })}><Plus size={16} /> New canvas <ChevronRight size={15} /></button>
  </section>;
}
