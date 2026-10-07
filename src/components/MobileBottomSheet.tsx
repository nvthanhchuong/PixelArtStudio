'use client';
import { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';
export function MobileBottomSheet({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), id = useId(), closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const elements = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]') || [])].filter(el => el.getClientRects().length);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="sheet-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) close(); }}><div ref={ref} className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby={id}><div className="sheet-handle" /><header className="sheet-header"><h2 id={id}>{title}</h2><button className="icon-button" aria-label="Close panel" onClick={close}><X size={20} /></button></header><div className="sheet-content">{children}</div></div></div>;
}
