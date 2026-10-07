'use client';
import { useEffect, useRef } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { PixelEngine } from '@/lib/engine';
import { MIN_ZOOM, toPixel, zoomAt, type Camera, type Point } from '@/lib/coordinates';
import { useEditor } from '@/lib/store';
import { drawPixelGrid, drawCenterAxes } from '@/lib/canvasGuides';

export function PixelCanvas({ engine }: { engine: PixelEngine }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controls = useRef<{ fit: () => void; reset: () => void; zoom: (factor: number) => void } | null>(null);
  const zoom = useEditor(s => s.zoom), tool = useEditor(s => s.tool), hydrated = useEditor(s => s.hydrated);
  useEffect(() => {
    const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!;
    const buffer = document.createElement('canvas'), bufferContext = buffer.getContext('2d')!;
    let camera: Camera = { scale: 1, x: 0, y: 0 }, width = 0, height = 0, frame = 0, dirty = true;
    let documentWidth = engine.width, documentHeight = engine.height, documentVersion = engine.documentVersion, space = false;
    let last: Point | null = null, mode: 'draw' | 'pan' | 'pick' | 'gesture' | null = null;
    let strokeColor: string | null = null, strokeSize = 1;
    let previousGesture: { midpoint: Point; distance: number } | null = null;
    let trackpadGesture: { camera: Camera; anchor: Point; scale: number } | null = null;
    const pointers = new Map<number, Point>();
    function schedule() { if (!frame) frame = requestAnimationFrame(render); }
    function render() {
      frame = 0;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      if (dirty) {
        if (buffer.width !== engine.width) buffer.width = engine.width;
        if (buffer.height !== engine.height) buffer.height = engine.height;
        bufferContext.putImageData(new ImageData(engine.rgba(engine.displayFrame), engine.width, engine.height), 0, 0); dirty = false;
      }
      const bw = engine.width * camera.scale, bh = engine.height * camera.scale;
      const theme = useEditor.getState().theme;
      ctx.save(); ctx.shadowColor = theme === 'dark' ? '#00000070' : '#28234518'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 8;
      ctx.fillStyle = theme === 'dark' ? '#252730' : '#ffffff'; ctx.fillRect(camera.x, camera.y, bw, bh); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(camera.x, camera.y, bw, bh); ctx.clip();
      const tile = Math.max(8, camera.scale * 4);
      ctx.fillStyle = theme === 'dark' ? '#2c2e38' : '#f5f5f9';
      const colStart = Math.max(0, Math.floor(-camera.x / tile)), rowStart = Math.max(0, Math.floor(-camera.y / tile));
      const colEnd = Math.min(Math.ceil(bw / tile), Math.ceil((width - camera.x) / tile));
      const rowEnd = Math.min(Math.ceil(bh / tile), Math.ceil((height - camera.y) / tile));
      for (let y = rowStart; y < rowEnd; y++) for (let x = colStart; x < colEnd; x++) if ((x + y) % 2 === 0) ctx.fillRect(camera.x + x * tile, camera.y + y * tile, tile, tile);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(buffer, camera.x, camera.y, bw, bh);
      const { gridSize, gridVisible, centerAxesVisible } = useEditor.getState();
      if (gridVisible) drawPixelGrid(ctx, camera, engine.width, engine.height, gridSize, theme === 'dark', dpr, width, height);
      if (centerAxesVisible) drawCenterAxes(ctx, camera, engine.width, engine.height, theme === 'dark', dpr);
      ctx.restore(); ctx.strokeStyle = theme === 'dark' ? '#b5a9d040' : '#9d94b166'; ctx.lineWidth = 1 / dpr; ctx.strokeRect(camera.x, camera.y, bw, bh);
    }
    function publishZoom() { useEditor.getState().set({ zoom: camera.scale }); }
    function fit() {
      const shortLandscape = window.matchMedia('(max-width: 899px) and (orientation: landscape) and (max-height: 500px)').matches;
      const scale = Math.max(MIN_ZOOM, Math.min(16, (width - 64) / engine.width, (height - (shortLandscape ? 48 : 110)) / engine.height));
      camera = { scale, x: (width - engine.width * scale) / 2, y: (height - engine.height * scale) / 2 - 15 };
      publishZoom(); schedule();
    }
    function resize() {
      const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      if (width === rect.width && height === rect.height && canvas.width === Math.round(rect.width * dpr) && canvas.height === Math.round(rect.height * dpr)) return;
      width = rect.width; height = rect.height; canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); fit();
    }
    function location(event: PointerEvent | WheelEvent) { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
    function gesture() {
      const [a, b] = [...pointers.values()];
      return { midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) };
    }
    function down(event: PointerEvent) {
      if (!useEditor.getState().hydrated || engine.playing) return;
      if (event.button !== 0 && event.button !== 2 && event.button !== 1) return;
      event.preventDefault();
      canvas.focus({ preventScroll: true });
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
      if (mode === 'draw' && engine.commit()) {
        const state = useEditor.getState();
        if (strokeColor && state.recent[0] !== strokeColor) state.chooseColor(strokeColor);
        state.changed();
      }
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
      event.preventDefault();
      if (!useEditor.getState().hydrated || pointers.size || trackpadGesture) return;
      // Touchpads report two-finger movement as wheel events without a mouse press.
      // Use modifiers for zoom rather than guessing the input device from delta values.
      const unit = event.deltaMode;
      const dx = event.deltaX * (unit === 1 ? 16 : unit === 2 ? width : 1);
      const dy = event.deltaY * (unit === 1 ? 16 : unit === 2 ? height : 1);
      if (event.ctrlKey || event.metaKey) {
        camera = zoomAt(camera, location(event), camera.scale * Math.exp(-dy * .002));
        publishZoom();
      } else {
        camera.x -= event.shiftKey && dx === 0 ? dy : dx;
        camera.y -= event.shiftKey && dx === 0 ? 0 : dy;
      }
      schedule();
    }
    type SafariGesture = Event & { scale?: number; clientX?: number; clientY?: number };
    function nativeGestureStart(event: SafariGesture) {
      event.preventDefault();
      if (!useEditor.getState().hydrated || pointers.size) return; // Touchscreen pinch is already handled by Pointer Events.
      const rect = canvas.getBoundingClientRect();
      const anchor = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
        ? { x: event.clientX! - rect.left, y: event.clientY! - rect.top }
        : { x: width / 2, y: height / 2 };
      trackpadGesture = { camera: { ...camera }, anchor, scale: event.scale && event.scale > 0 ? event.scale : 1 };
    }
    function nativeGestureChange(event: SafariGesture) {
      event.preventDefault();
      if (!trackpadGesture || pointers.size || !Number.isFinite(event.scale) || event.scale! <= 0) return;
      camera = zoomAt(trackpadGesture.camera, trackpadGesture.anchor, trackpadGesture.camera.scale * event.scale! / trackpadGesture.scale);
      schedule();
    }
    function nativeGestureEnd(event: Event) {
      event.preventDefault();
      if (trackpadGesture) { trackpadGesture = null; publishZoom(); schedule(); }
    }
    function blockCanvasShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'x'].includes(event.key.toLowerCase())) event.preventDefault();
    }
    function key(event: KeyboardEvent) {
      if ((event.target as HTMLElement).matches('input,textarea,select') || useEditor.getState().panel) return;
      if (event.code === 'Space') { event.preventDefault(); space = event.type === 'keydown'; }
    }
    function blur() { pointers.clear(); finish(); if (trackpadGesture) { trackpadGesture = null; publishZoom(); } space = false; }
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
        pointers.clear(); mode = null;
      }
      if (!trackpadGesture && mode !== 'gesture' && Math.abs(state.zoom - camera.scale) > .0001) {
        camera = zoomAt(camera, { x: width / 2, y: height / 2 }, state.zoom);
      }
      schedule();
    });
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', contextMenu);
    canvas.addEventListener('keydown', blockCanvasShortcut);
    canvas.addEventListener('gesturestart', nativeGestureStart, { passive: false });
    canvas.addEventListener('gesturechange', nativeGestureChange, { passive: false });
    canvas.addEventListener('gestureend', nativeGestureEnd, { passive: false });
    window.addEventListener('keydown', key); window.addEventListener('keyup', key); window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    controls.current = {
      fit,
      reset: () => { camera = { scale: 1, x: (width - engine.width) / 2, y: (height - engine.height) / 2 - 15 }; publishZoom(); schedule(); },
      zoom: factor => { camera = zoomAt(camera, { x: width / 2, y: height / 2 }, camera.scale * factor); publishZoom(); schedule(); },
    };
    resize();
    return () => {
      observer.disconnect(); unsubscribeEngine(); unsubscribeUI(); cancelAnimationFrame(frame); controls.current = null;
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up); canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('contextmenu', contextMenu);
      canvas.removeEventListener('keydown', blockCanvasShortcut);
      canvas.removeEventListener('gesturestart', nativeGestureStart);
      canvas.removeEventListener('gesturechange', nativeGestureChange);
      canvas.removeEventListener('gestureend', nativeGestureEnd);
      window.removeEventListener('keydown', key); window.removeEventListener('keyup', key); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
    };
  }, [engine]);
  return <div className={`workspace tool-${tool}`} onContextMenu={e => e.preventDefault()} onDragStart={e => e.preventDefault()} onCopy={e => e.preventDefault()} onCut={e => e.preventDefault()}>
    <canvas ref={canvasRef} tabIndex={0} draggable={false} aria-busy={!hydrated} aria-label="Pixel drawing canvas" data-testid="pixel-canvas" />
    <div className="zoom-controls"><button disabled={!hydrated} aria-label="Zoom out" title="Zoom out" onClick={() => controls.current?.zoom(.8)}><Minus size={16} /></button><button className="zoom-percentage" disabled={!hydrated} data-testid="zoom" aria-label="Reset zoom to 100%" title="Reset zoom to 100%" onClick={() => controls.current?.reset()}>{Math.round(zoom * 100)}%</button><button disabled={!hydrated} aria-label="Zoom in" title="Zoom in" onClick={() => controls.current?.zoom(1.25)}><Plus size={16} /></button><i /><button disabled={!hydrated} aria-label="Fit canvas" title="Fit canvas" onClick={() => controls.current?.fit()}><Maximize size={16} /></button></div>
  </div>;
}
