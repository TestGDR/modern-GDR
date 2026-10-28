"use client";

import { FloatingWindow } from "@/components/floating-window";
import { useCloseModal } from "@/components/game/page-modal";

/**
 * Finestra 800x550 per la scheda del personaggio, aperta sopra la pagina in cui si è.
 * Chiudendola si torna alla pagina che c'era sotto.
 */
export function SheetModal({ children }: { children: React.ReactNode }) {
  const close = useCloseModal();
  return (
    <FloatingWindow label="Scheda personaggio" onClose={close} initialWidth={800} initialHeight={550} chromeless>
      {children}
    </FloatingWindow>
  );
}

/** Segnaposto mentre la scheda arriva dal database */
export function SheetModalLoading() {
  return (
    <div className="flex h-full flex-col">
      <div data-window-drag="" className="h-12 shrink-0 cursor-grab border-b border-white/10" />
      <div className="grid flex-1 place-items-center text-sm text-muted-foreground">Caricamento della scheda…</div>
    </div>
  );
}
