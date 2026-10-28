"use client";

import { useState } from "react";
import { FloatingWindow } from "@/components/floating-window";
import { cn } from "@/lib/utils";

/** Pulsante che apre una finestra trascinabile con un contenuto */
export function WindowButton({
  label,
  title,
  icon,
  children,
  className,
  showLabel = true,
  shortLabel,
  width = 520,
}: {
  label: string;
  /** Titolo della finestra (se diverso dall'etichetta) */
  title?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  showLabel?: boolean;
  /** Etichetta corta sui telefoni (senza: sempre quella intera) */
  shortLabel?: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} aria-label={label} title={label}>
        {icon}
        {showLabel && shortLabel && <span className="sm:hidden">{shortLabel}</span>}
        {showLabel && <span className={shortLabel === undefined ? undefined : "hidden sm:inline"}>{label}</span>}
      </button>
      {open && (
        <FloatingWindow
          label={title ?? label}
          onClose={() => setOpen(false)}
          initialWidth={width}
          header={<h2 className="pb-4 font-heading text-3xl tracking-wide">{title ?? label}</h2>}
        >
          {children}
        </FloatingWindow>
      )}
    </>
  );
}

/** Contenuto delle funzioni che arriveranno nelle prossime fasi */
export function ComingSoon({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground")}>
      {children}
      <p className="mt-2 w-fit rounded-full bg-peach/15 px-3 py-1 text-xs text-peach">In arrivo</p>
    </div>
  );
}
