"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FloatingWindow } from "@/components/floating-window";

/**
 * Finestra 800x550 per la scheda del personaggio, aperta sopra la pagina in cui si è.
 * Chiuderla torna indietro di un passo nella cronologia (l'indirizzo torna quello di prima).
 */
export function SheetModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const close = useCallback(() => router.back(), [router]);

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

/**
 * Mostra lo slot delle finestre solo sugli indirizzi delle schede:
 * cambiando pagina (mappa, chat…) la finestra si chiude da sola.
 */
export function ModalGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return pathname === "/scheda" || pathname.startsWith("/scheda/") ? children : null;
}
