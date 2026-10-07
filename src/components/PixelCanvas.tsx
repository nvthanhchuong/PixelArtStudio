'use client';
import { useEffect, useRef } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { PixelEngine } from '@/lib/engine';
import { toPixel, zoomAt, type Camera, type Point } from '@/lib/coordinates';
import { useEditor } from '@/lib/store';

export function PixelCanvas({ engine }: { engine: PixelEngine }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controls = useRef<{ fit: () => void; zoom: (factor: number) => void } | null>(null);
  const zoom = useEditor(s => s.zoom), tool = useEditor(s => s.tool);
  useEffect(() => {
    const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!;
    const buffer = document.createElement('canvas'), bufferContext = buffer.getContext('2d')!;
    let camera: Camera = { scale: 1, x: 0, y: 0 }, width = 0, height = 0, frame = 0, dirty = true;
    let documentWidth = engine.width, documentHeight = engine.height, documentVersion = engine.documentVersion, space = false;
    let last: Point | null = null, mode: 'draw' | 'pan' | 'pick' | 'gesture' | null = null;
    let strokeColor: string | null = null, strokeSize = 1;
    let previousGesture: { midpoint: Point; distance: number } | null = null;
    const pointers = new Map<number, Point>();
    function schedule() { if (!frame) frame = requestAnimationFrame(render); }
    function render() {
      frame = 0;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      if (dirty) {
        buffer.width = engine.width; buffer.height = engine.height;
        bufferContext.putImageData(new ImageData(engine.rgba(), engine.width, engine.height), 0, 0); dirty = false;
      }
      const bw = engine.width * camera.scale, bh = engine.height * camera.scale;
      const theme = useEditor.getState().theme;
      ctx.save(); ctx.shadowColor = theme === 'dark' ? '#00000070' : '#28234518'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 8;
      ctx.fillStyle = theme === 'dark' ? '#292a34' : '#ffffff'; ctx.fillRect(camera.x, camera.y, bw, bh); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(camera.x, camera.y, bw, bh); ctx.clip();
      const tile = Math.max(8, camera.scale * 2);
      ctx.fillStyle = theme === 'dark' ? '#323440' : '#f0f0f5';
      const colStart = Math.max(0, Math.floor(-camera.x / tile)), rowStart = Math.max(0, Math.floor(-camera.y / tile));
      const colEnd = Math.min(Math.ceil(bw / tile), Math.ceil((width - camera.x) / tile));
      const rowEnd = Math.min(Math.ceil(bh / tile), Math.ceil((height - camera.y) / tile));
      for (let y = rowStart; y < rowEnd; y++) for (let x = colStart; x < colEnd; x++) if ((x + y) % 2 === 0) ctx.fillRect(camera.x + x * tile, camera.y + y * tile, tile, tile);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(buffer, camera.x, camera.y, bw, bh);
      const { gridSize, gridVisible, centerAxesVisible } = useEditor.getState();
      if (gridVisible && camera.scale * gridSize >= 4) {
        const deviceLineWidth = Math.max(1, Math.round(dpr));
        const align = (value: number) => (Math.round(value * dpr) + (deviceLineWidth % 2) / 2) / dpr;
        ctx.beginPath(); ctx.strokeStyle = theme === 'dark' ? '#ffffff52' : '#3f36575c'; ctx.lineWidth = deviceLineWidth / dpr;
        for (let x = 0; x <= engine.width; x += gridSize) { const px = align(camera.x + x * camera.scale); if (px >= 0 && px <= width) { ctx.moveTo(px, camera.y); ctx.lineTo(px, camera.y + bh); } }
        for (let y = 0; y <= engine.height; y += gridSize) { const py = align(camera.y + y * camera.scale); if (py >= 0 && py <= height) { ctx.moveTo(camera.x, py); ctx.lineTo(camera.x + bw, py); } }
        ctx.stroke();
      }
      if (centerAxesVisible) {
        // Geometric center: odd dimensions correctly place guides through a pixel's center.
        const cx = camera.x + bw / 2, cy = camera.y + bh / 2;
        ctx.save(); ctx.setLineDash([7, 5]);
        const guide = (from: Point, to: Point, color: string) => {
          ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
          ctx.strokeStyle = theme === 'dark' ? '#17171ddd' : '#ffffffdd'; ctx.lineWidth = 4; ctx.stroke();
          ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
        };
        guide({ x: camera.x, y: cy }, { x: camera.x + bw, y: cy }, theme === 'dark' ? '#F391BE' : '#CB477F');
        guide({ x: cx, y: camera.y }, { x: cx, y: camera.y + bh }, theme === 'dark' ? '#91B9FF' : '#4678CF');
        ctx.setLineDash([]); ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = theme === 'dark' ? '#17171d' : '#ffffff'; ctx.fill();
        ctx.strokeStyle = theme === 'dark' ? '#C8AEFF' : '#7759D9'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      }
      ctx.restore(); ctx.strokeStyle = theme === 'dark' ? '#ffffff20' : '#b8b5c5'; ctx.lineWidth = 1; ctx.strokeRect(camera.x, camera.y, bw, bh);
    }
    function publishZoom() { useEditor.getState().set({ zoom: camera.scale }); }
    function fit() {
      const shortLandscape = window.matchMedia('(max-width: 899px) and (orientation: landscape) and (max-height: 500px)').matches;
      const scale = Math.max(.5, Math.min(16, (width - 64) / engine.width, (height - (shortLandscape ? 48 : 110)) / engine.height));
      camera = { scale, x: (width - engine.width * scale) / 2, y: (height - engine.height * scale) / 2 - 15 };
      publishZoom(); schedule();
    }
    function resize() {
      const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      width = rect.width; height = rect.height; canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); fit();
    }
    function location(event: PointerEvent | WheelEvent) { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
    function gesture() {
      const [a, b] = [...pointers.values()];
      return { midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) };
    }
    function down(event: PointerEvent) {
      if (event.button !== 0 && event.button !== 2 && event.button !== 1) return;
      event.preventDefault();
      try { canvas.setPointerCapture(event.pointerId); } catch { /* Synthetic events have no active native pointer. */ }
      const point = location(event); pointers.set(event.pointerId, point);
      if (pointers.size >= 2) {
        if (mode === 'draw') engine.cancel();
        mode = 'gesture'; last = null; previousGesture = gesture(); return;
      }
      const state = useEditor.getState(); last = point;
      if (space || state.tool === 'pan' || event.button === 1) { mode = 'pan'; return; }
      if (event.altKey || state.tool === 'eyedropper') {
        mode = 'pick'; const color = engine.sample(toPixel(point, camera));
        if (color) { state.chooseColor(color); if (!event.altKey) state.set({ tool: 'pencil' }); } return;
      }
      mode = 'draw'; strokeColor = state.tool === 'eraser' || event.button === 2 ? null : state.color; strokeSize = state.gridSize;
      engine.begin(); const pixel = toPixel(point, camera); engine.paint(pixel, pixel, strokeColor, strokeSize);
    }
    function move(event: PointerEvent) {
      if (!pointers.has(event.pointerId)) return;
      event.preventDefault(); const point = location(event); pointers.set(event.pointerId, point);
      if (mode === 'gesture' && pointers.size >= 2) {
        const next = gesture();
        if (previousGesture) {
          camera = zoomAt(camera, previousGesture.midpoint, camera.scale * next.distance / previousGesture.distance);
          camera.x += next.midpoint.x - previousGesture.midpoint.x; camera.y += next.midpoint.y - previousGesture.midpoint.y;
        }
        previousGesture = next; schedule(); return;
      }
      if (mode === 'pan' && last) { camera.x += point.x - last.x; camera.y += point.y - last.y; schedule(); }
      if (mode === 'draw' && last) {
        const samples = event.getCoalescedEvents?.() || [];
        for (const sample of samples.length ? samples : [event]) {
          const next = location(sample);
          engine.paint(toPixel(last, camera), toPixel(next, camera), strokeColor, strokeSize); last = next;
        }
      }
      last = point;
    }
    function finish() {
      if (mode === 'draw' && engine.commit()) useEditor.getState().changed();
      if (mode === 'pan' || mode === 'gesture') publishZoom();
      mode = null; last = null; previousGesture = null;
    }
    function up(event: PointerEvent) {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (mode === 'gesture') { publishZoom(); if (!pointers.size) finish(); return; }
      finish();
    }
    function wheel(event: WheelEvent) {
      event.preventDefault(); camera = zoomAt(camera, location(event), camera.scale * Math.exp(-event.deltaY * .002)); publishZoom(); schedule();
    }
    function key(event: KeyboardEvent) {
      if ((event.target as HTMLElement).matches('input,textarea,select') || useEditor.getState().panel) return;
      if (event.code === 'Space') { event.preventDefault(); space = event.type === 'keydown'; }
    }
    function blur() { pointers.clear(); finish(); space = false; }
    function visibility() { if (document.visibilityState === 'hidden') blur(); }
    function contextMenu(event: MouseEvent) { event.preventDefault(); }
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    const unsubscribeEngine = engine.subscribe(() => {
      dirty = true;
      if (documentVersion !== engine.documentVersion) { documentVersion = engine.documentVersion; pointers.clear(); mode = null; fit(); }
      schedule();
    });
    const unsubscribeUI = useEditor.subscribe(state => {
      if (documentWidth !== state.width || documentHeight !== state.height) {
        documentWidth = state.width; documentHeight = state.height;
        pointers.clear(); mode = null; fit();
      } else if (Math.abs(state.zoom - camera.scale) > .0001) {
        camera = zoomAt(camera, { x: width / 2, y: height / 2 }, state.zoom);
      }
      schedule();
    });
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', contextMenu);
    window.addEventListener('keydown', key); window.addEventListener('keyup', key); window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    controls.current = { fit, zoom: factor => { camera = zoomAt(camera, { x: width / 2, y: height / 2 }, camera.scale * factor); publishZoom(); schedule(); } };
    return () => {
      observer.disconnect(); unsubscribeEngine(); unsubscribeUI(); cancelAnimationFrame(frame); controls.current = null;
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up); canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('contextmenu', contextMenu);
      window.removeEventListener('keydown', key); window.removeEventListener('keyup', key); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
    };
  }, [engine]);
  return <div className={`workspace tool-${tool}`}>
    <div className="workspace-label"><span className="tiny-dot" /> YOUR CANVAS <span>Let a little idea become something.</span></div>
    <canvas ref={canvasRef} aria-label="Pixel drawing canvas" data-testid="pixel-canvas" />
    <div className="zoom-controls"><button aria-label="Zoom out" title="Zoom out" onClick={() => controls.current?.zoom(.8)}><Minus size={16} /></button><span data-testid="zoom">{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" title="Zoom in" onClick={() => controls.current?.zoom(1.25)}><Plus size={16} /></button><i /><button aria-label="Fit canvas" title="Fit canvas" onClick={() => controls.current?.fit()}><Maximize size={16} /></button></div>
    <div className="gesture-hint"><span className="desktop-hint">Scroll to zoom <b>·</b> Space + drag to pan</span><span className="mobile-hint">One finger to draw <b>·</b> Two fingers to zoom & pan</span></div>
  </div>;
}
