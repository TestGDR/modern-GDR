"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Fumetto al passaggio del mouse (o al focus da tastiera): sopra a tutto, finestre comprese,
// e sempre dentro lo schermo (si sposta di lato o sotto se non c'è spazio).

const MARGIN = 8;

export function HoverTip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !tip.current) return;
    const a = anchor.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // sopra al centro; se non c'è posto, sotto
    let top = a.top - t.height - 6;
    if (top < MARGIN) top = a.bottom + 6;
    top = Math.min(Math.max(MARGIN, top), vh - t.height - MARGIN);
    const left = Math.min(Math.max(MARGIN, a.left + a.width / 2 - t.width / 2), vw - t.width - MARGIN);
    setPos({ left, top });
  }, [open, label]);

  const show = () => setOpen(true);
  const hide = () => {
    setOpen(false);
    setPos(null);
  };

  return (
    <span ref={anchor} className={className ?? "block"} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {open &&
        createPortal(
          <span
            ref={tip}
            role="tooltip"
            style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
            className="pointer-events-none fixed z-[2147483000] max-w-[min(16rem,calc(100vw-1rem))] rounded-lg border border-peach/40 bg-night/95 px-2.5 py-1 text-xs font-medium text-foreground shadow-xl backdrop-blur"
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
