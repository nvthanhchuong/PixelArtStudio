'use client';
import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Plus, Play, Pause, Copy, Trash2 } from 'lucide-react';
import type { PixelEngine, PixelFrame } from '@/lib/engine';
import { useEditor } from '@/lib/store';
import { MIN_FRAME_DURATION, MAX_FRAME_DURATION } from '@/lib/animation';

const FrameThumbnail = memo(function FrameThumbnail({ engine, frame }: { engine: PixelEngine; frame: PixelFrame; revision: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current!, context = element.getContext('2d');
    if (!context) return;
    element.width = engine.width; element.height = engine.height;
    const data = new Uint8ClampedArray(frame.pixels.length * 4);
    frame.pixels.forEach((pixel, index) => { data[index * 4] = pixel >>> 24; data[index * 4 + 1] = (pixel >>> 16) & 255; data[index * 4 + 2] = (pixel >>> 8) & 255; data[index * 4 + 3] = pixel & 255; });
    context.putImageData(new ImageData(data, engine.width, engine.height), 0, 0);
  });
  return <canvas ref={canvas} aria-hidden="true" />;
});

export function AnimationTimeline({ engine }: { engine: PixelEngine }) {
  useSyncExternalStore(engine.subscribe, () => engine.animationVersion, () => 0);
  const hydrated = useEditor(state => state.hydrated), panel = useEditor(state => state.panel);
  const selected = engine.frames[engine.activeFrame];
  const [duration, setDuration] = useState(String(selected.duration));
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { setDuration(String(selected.duration)); }, [selected.id, selected.duration]);
  useEffect(() => { scroll.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [engine.displayFrame, engine.frames.length]);
  useEffect(() => {
    if (!engine.playing) return;
    const timer = setTimeout(() => engine.advancePlayback(), engine.frames[engine.displayFrame].duration);
    return () => clearTimeout(timer);
  }, [engine, engine.animationVersion]);
  useEffect(() => {
    function hide() { if (document.hidden) engine.stopPlayback(); }
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); engine.stopPlayback(); };
  }, [engine]);
  useEffect(() => { if (panel) engine.stopPlayback(); }, [panel, engine]);
  function changed(action: () => boolean) { if (action()) useEditor.getState().changed(); }
  function setTime(text: string) {
    setDuration(text); const value = Number(text);
    if (Number.isInteger(value) && value >= MIN_FRAME_DURATION && value <= MAX_FRAME_DURATION) changed(() => engine.setFrameDuration(value));
  }
  const index = engine.displayFrame;
  return <section className="animation-timeline" aria-label="Animation timeline" data-playing={engine.playing} data-display-frame={engine.displayFrame}>
    <button className={`animation-play ${engine.playing ? 'is-playing' : ''}`} aria-label={engine.playing ? 'Pause animation' : 'Play animation'} title={engine.playing ? 'Pause animation' : 'Play animation'} disabled={!hydrated || engine.frames.length < 2} onClick={() => engine.playing ? engine.stopPlayback() : engine.startPlayback()}>{engine.playing ? <Pause size={17} /> : <Play size={17} />}<span>{engine.playing ? 'Pause' : 'Play'}</span></button>
    <div className="frame-strip" ref={scroll} role="tablist" aria-label="Animation frames" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !hydrated) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? engine.frames.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : engine.frames.length - 1)) % engine.frames.length;
      changed(() => engine.selectFrame(next)); scroll.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }}>{engine.frames.map((frame, frameIndex) => <button role="tab" key={frame.id} tabIndex={index === frameIndex ? 0 : -1} className={`frame-item ${index === frameIndex ? 'selected' : ''}`} aria-label={`Frame ${frameIndex + 1}`} aria-selected={index === frameIndex} title={`Frame ${frameIndex + 1} · ${frame.duration} ms`} disabled={!hydrated} onClick={() => changed(() => engine.selectFrame(frameIndex))}><span className="frame-thumbnail"><FrameThumbnail engine={engine} frame={frame} revision={frame.revision} /></span><span className="frame-number">{frameIndex + 1}</span></button>)}</div>
    <button className="frame-add" aria-label="Add frame" title="Add a blank frame" disabled={!hydrated || !engine.canAddFrame} onClick={() => changed(() => engine.addFrame())}><Plus size={18} /></button>
    <div className="frame-timing"><label htmlFor="frame-duration">Time <span className="frame-timing-caption">/ frame</span></label><div><input id="frame-duration" aria-label="Frame duration (milliseconds)" type="number" inputMode="numeric" min={MIN_FRAME_DURATION} max={MAX_FRAME_DURATION} step={10} disabled={!hydrated || engine.playing} value={duration} onChange={event => setTime(event.target.value)} onBlur={() => setDuration(String(selected.duration))} /><span>ms</span></div></div>
    <div className="frame-actions"><button className="icon-button" aria-label="Duplicate frame" title="Duplicate selected frame" disabled={!hydrated || !engine.canAddFrame || engine.playing} onClick={() => changed(() => engine.addFrame(true))}><Copy size={16} /></button><button className="icon-button" aria-label="Delete frame" title="Delete selected frame" disabled={!hydrated || engine.frames.length < 2 || engine.playing} onClick={() => { if (selected.pixels.some(Boolean) && !window.confirm(`Delete frame ${engine.activeFrame + 1}? This cannot be undone.`)) return; changed(() => engine.deleteFrame()); }}><Trash2 size={16} /></button></div>
  </section>;
}
