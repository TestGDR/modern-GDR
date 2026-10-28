"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FloatingWindow } from "@/components/floating-window";

// Pagine che, cliccate dentro il gioco, si aprono in una finestra sopra la
// pagina in cui si è (rotte intercettate in src/app/(gioco)/@modal).
// Aprendo l'indirizzo direttamente si vede invece la pagina intera.
export const MODAL_PREFIXES = ["/scheda", "/social", "/forum", "/messaggi", "/gestione"];

export function isModalPath(pathname: string) {
  return MODAL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Ultima pagina "sotto" le finestre: chiudendo una finestra si torna lì
// (anche dopo aver navigato dentro la finestra, es. forum → discussione).
let origin = "/mappa";

/** Ricorda la pagina sotto le finestre e mostra lo slot solo sugli indirizzi delle finestre */
export function ModalGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const modal = isModalPath(pathname);
  useEffect(() => {
    if (!modal) origin = pathname;
  }, [pathname, modal]);
  return modal ? children : null;
}

/** Chiude la finestra tornando alla pagina che c'era sotto */
export function useCloseModal() {
  const router = useRouter();
  return useCallback(() => router.push(origin, { scroll: false }), [router]);
}

/** Finestra trascinabile e ridimensionabile con dentro una pagina del gioco */
export function PageModal({ label, children, width = 820, height = 600 }: { label: string; children: React.ReactNode; width?: number; height?: number }) {
  const close = useCloseModal();
  return (
    <FloatingWindow label={label} onClose={close} initialWidth={width} initialHeight={height}>
      {children}
    </FloatingWindow>
  );
}
