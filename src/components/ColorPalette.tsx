'use client';
import { useMemo, useState } from 'react';
import { Check, Copy, ChevronDown } from 'lucide-react';
import { families, generateShades } from '@/lib/colors';
import { useEditor } from '@/lib/store';
export function ColorFamilyPicker() {
  const family = useEditor(s => s.family), set = useEditor(s => s.set);
  return <div className="families" aria-label="Color families">{families.map(f => <button key={f.name} aria-label={`${f.name} family`} aria-pressed={family === f.name} className={family === f.name ? 'selected' : ''} onClick={() => set({ family: f.name })}><span style={{ background: f.color }} />{f.name}</button>)}</div>;
}
export function RecentColors() {
  const recent = useEditor(s => s.recent), color = useEditor(s => s.color), chooseColor = useEditor(s => s.chooseColor);
  return <div className="recent-section"><div className="section-heading">Recently used <span>{recent.length}/20</span></div><div className="recent-colors">{recent.map(c => <button key={c} style={{ background: c }} aria-label={`Recent ${c}`} title={c} onClick={() => chooseColor(c)}>{c === color && <Check size={14} color={parseInt(c.slice(1, 3), 16) > 180 ? '#27243d' : '#fff'} />}</button>)}</div></div>;
}
export function ColorPalette() {
  const family = useEditor(s => s.family), color = useEditor(s => s.color), chooseColor = useEditor(s => s.chooseColor);
  const shades = useMemo(() => generateShades(family), [family]);
  const [copied, setCopied] = useState(false), [copyError, setCopyError] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(color); setCopied(true); setCopyError(false); setTimeout(() => setCopied(false), 1800); } catch { setCopyError(true); } }
  return <div className="color-palette"><div className="panel-heading"><h2>Color palette</h2><span className="small-tag">100 shades</span></div><p className="panel-description">Find the color that feels just right.</p><div className="section-heading">COLOR FAMILY</div><ColorFamilyPicker /><div className="shade-heading"><span>{family} shades</span><span>Light <ChevronDown size={13} /> Dark</span></div><div className="shade-grid" aria-label={`${family} shades`}>{shades.map((shade, i) => <button key={`${family}-${i}`} style={{ background: shade }} aria-label={`${family} shade ${i + 1} ${shade}`} title={shade} aria-pressed={color === shade} onClick={() => chooseColor(shade)}>{color === shade && <Check size={14} />}</button>)}</div><div className="current-color"><span className="current-color-swatch" style={{ background: color }} /><div><span>Current color</span><strong>{color}</strong></div><button className="icon-button" aria-label="Copy HEX" title="Copy HEX" onClick={copy}>{copied ? <Check size={17} /> : <Copy size={17} />}</button></div>{copyError && <p role="status" className="field-hint">Select and copy the HEX code above.</p>}<RecentColors /></div>;
}
