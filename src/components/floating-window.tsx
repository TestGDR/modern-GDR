"use client";

import { useEffect, useRef, useState } from "react";
import { GripHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Rect = { x: number; y: number; w: number; h: number | null };
type Gesture = { pointerX: number; pointerY: number; start: Rect; startH: number };

const MIN_W = 300;
const MIN_H = 260;
const MARGIN = 8;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

type FloatingWindowProps = {
  /** Testo per i lettori di schermo */
  label: string;
  onClose: () => void;
  /** Contenuto della parte alta, da cui si trascina la finestra */
  header?: React.ReactNode;
  children: React.ReactNode;
  initialWidth?: number;
  /** Se indicata, la finestra parte con questa altezza (e centrata) */
  initialHeight?: number;
  /**
   * Senza intestazione né margini: il contenuto riempie la finestra
   * e si trascina dagli elementi con l'attributo `data-window-drag`.
   */
  chromeless?: boolean;
  className?: string;
};

/**
 * Finestra modale che si sposta trascinandola dalla parte alta
 * e si ridimensiona dall'angolo in basso a destra (mouse e touch).
 * Si chiude con la X, con Esc o cliccando fuori.
 * All'apertura è centrata con il CSS (funziona anche se arriva dal server);
 * la posizione in pixel si calcola al primo spostamento.
 */
export function FloatingWindow({
  label,
  onClose,
  header,
  children,
  initialWidth = 400,
  initialHeight,
  chromeless = false,
  className,
}: FloatingWindowProps) {
  const [rect, setRect] = useState<Rect | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Gesture | null>(null);
  const resize = useRef<Gesture | null>(null);

  // Esc chiude; il focus entra nella finestra all'apertura
  useEffect(() => {
    windowRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Posizione attuale: quella salvata o, la prima volta, quella misurata sullo schermo */
  function currentRect(): Rect {
    if (rect) return rect;
    const box = windowRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0, w: initialWidth, h: initialHeight ?? null };
    return { x: box.left, y: box.top, w: box.width, h: initialHeight ? box.height : null };
  }

  function begin(e: React.PointerEvent<HTMLElement>, target: React.RefObject<Gesture | null>) {
    // I pulsanti e i campi dentro la barra restano cliccabili
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = currentRect();
    setRect(start);
    target.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      start,
      startH: windowRef.current?.offsetHeight ?? MIN_H,
    };
  }

  function onDragMove(e: React.PointerEvent) {
    const g = drag.current;
    if (!g) return;
    setRect((r) => {
      const base = r ?? g.start;
      return {
        ...base,
        // Almeno 80px della finestra restano sempre sullo schermo
        x: clamp(g.start.x + e.clientX - g.pointerX, 80 - base.w, window.innerWidth - 80),
        y: clamp(g.start.y + e.clientY - g.pointerY, 0, window.innerHeight - 56),
      };
    });
  }

  function onResizeMove(e: React.PointerEvent) {
    const g = resize.current;
    if (!g) return;
    setRect((r) => {
      const base = r ?? g.start;
      return {
        ...base,
        w: clamp(g.start.w + e.clientX - g.pointerX, MIN_W, window.innerWidth - base.x - MARGIN),
        h: clamp(g.startH + e.clientY - g.pointerY, MIN_H, window.innerHeight - base.y - MARGIN),
      };
    });
  }

  const end = () => {
    drag.current = null;
    resize.current = null;
  };

  // Prima del primo spostamento: centrata con il CSS
  const style: React.CSSProperties = rect
    ? {
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h ?? undefined,
        maxHeight: rect.h ? undefined : `calc(100dvh - ${rect.y + MARGIN}px)`,
      }
    : initialHeight
      ? {
          left: "50%",
          top: "50%",
          translate: "-50% -50%",
          width: `min(${initialWidth}px, calc(100vw - ${MARGIN * 3}px))`,
          height: `min(${initialHeight}px, calc(100dvh - ${MARGIN * 2}px))`,
        }
      : {
          left: "50%",
          top: "max(16px, 10vh)",
          translate: "-50% 0",
          width: `min(${initialWidth}px, calc(100vw - ${MARGIN * 3}px))`,
          maxHeight: `calc(90dvh - ${MARGIN}px)`,
        };

  // In modalità chromeless si trascina dagli elementi marcati con data-window-drag
  const chromelessDrag = chromeless
    ? {
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
          if ((e.target as HTMLElement).closest("[data-window-drag]")) begin(e, drag);
        },
        onPointerMove: onDragMove,
        onPointerUp: end,
        onPointerCancel: end,
      }
    : {};

  return (
    <div className="fixed inset-0 z-50">
      {/* Sfondo: un clic fuori chiude */}
      <div className="absolute inset-0 bg-night/45" onClick={onClose} aria-hidden="true" />

      <div
        ref={windowRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={style}
        className={cn(
          "absolute flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-night/75 shadow-2xl outline-none backdrop-blur-2xl backdrop-saturate-150 animate-in fade-in-0 zoom-in-95 sm:bg-night/65",
          className,
        )}
        {...chromelessDrag}
      >
        {chromeless ? (
          children
        ) : (
          <>
            {/* Barra per trascinare */}
            <div
              className="relative shrink-0 cursor-grab touch-none select-none px-6 pt-3 active:cursor-grabbing sm:px-8"
              onPointerDown={(e) => begin(e, drag)}
              onPointerMove={onDragMove}
              onPointerUp={end}
              onPointerCancel={end}
            >
              <GripHorizontal className="mx-auto size-5 text-white/30" aria-hidden="true" />
              <button
                type="button"
                onClick={onClose}
                className="absolute top-2.5 right-3 rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Chiudi"
              >
                <X className="size-5" />
              </button>
              {header}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 sm:px-8 sm:pb-8">{children}</div>
          </>
        )}

        {/* Maniglia per ridimensionare (spostata verso l'interno: l'angolo è arrotondato) */}
        <div
          className="absolute right-1.5 bottom-1.5 z-20 grid size-7 cursor-nwse-resize touch-none place-items-center rounded-full hover:bg-white/10"
          onPointerDown={(e) => {
            e.stopPropagation();
            begin(e, resize);
          }}
          onPointerMove={onResizeMove}
          onPointerUp={end}
          onPointerCancel={end}
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="size-6 text-white/40">
            <path d="M20 10 L10 20 M20 15 L15 20" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
