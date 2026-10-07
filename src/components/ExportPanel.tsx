'use client';
import { useEffect, useState } from 'react';
import { Download, FileImage, Share2 } from 'lucide-react';
import type { PixelEngine } from '@/lib/engine';
import { exportPng } from '@/lib/export';

export function ExportPanel({ engine }: { engine: PixelEngine }) {
  const [scale, setScale] = useState<1 | 2 | 4 | 8>(1);
  const [output, setOutput] = useState<{ url: string; blob: Blob; filename: string; shareable: boolean } | null>(null);
  const [error, setError] = useState('');
  const filename = `pixel-studio-${engine.width * scale}x${engine.height * scale}.png`;
  useEffect(() => {
    let alive = true, url = '';
    setOutput(null); setError('');
    void exportPng(engine, scale).then(blob => {
      if (!alive) return;
      url = URL.createObjectURL(blob);
      let shareable = false;
      try { shareable = !!navigator.canShare?.({ files: [new File([blob], filename, { type: 'image/png' })] }); } catch { /* Download remains available. */ }
      setOutput({ url, blob, filename, shareable });
    }).catch(error => { if (alive) setError(error instanceof Error ? error.message : 'Could not create the PNG. Please try again.'); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [engine, filename, scale]);
  async function share() {
    if (!output) return;
    try { await navigator.share({ files: [new File([output.blob], output.filename, { type: 'image/png' })], title: 'My pixel art' }); }
    catch (error) { if ((error as DOMException).name !== 'AbortError') setError('Sharing is unavailable. Use Download PNG or Open image instead.'); }
  }
  return <div>
    <div className="export-preview">{output ? <img src={output.url} alt="Your artwork, ready to export" /> : <FileImage size={36} />}</div>
    <p className="dialog-description">{engine.width * scale} × {engine.height * scale} pixels · PNG · Transparent background</p>
    <div className="export-scale"><span>Export scale</span><div className="grid-presets">{([1, 2, 4, 8] as const).map(value => <button key={value} aria-label={`Export at ${value}x`} aria-pressed={scale === value} className={scale === value ? 'selected' : ''} onClick={() => setScale(value)}>{value}×</button>)}</div></div>
    <p className="field-hint">{engine.frames.length > 1 ? `Frame ${engine.activeFrame + 1} of ${engine.frames.length}. Save Project keeps the whole animation.` : scale === 1 ? 'Original pixels, with no grid or interface.' : 'Crisp pixels, scaled without smoothing.'}</p>
    {output && <><a className="primary-button full-width" href={output.url} download={output.filename}><Download size={17} />Download PNG</a><div className="export-options"><a className="secondary-button" href={output.url} target="_blank" rel="noopener noreferrer"><FileImage size={16} />Open image</a>{output.shareable && <button className="secondary-button" onClick={share}><Share2 size={16} />Share / Save</button>}</div></>}
    {error && <p role="alert" className="warning-box">{error}</p>}
    <div className="ios-note"><span>On iPhone</span><p>Use Share / Save, or open the image and touch & hold it to save to Photos.</p></div>
  </div>;
}
