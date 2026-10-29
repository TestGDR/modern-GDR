"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FloatingWindow } from "@/components/floating-window";

// Pagine che, cliccate dentro il gioco, si aprono in una finestra sopra la
// pagina in cui si è (rotte intercettate in src/app/(gioco)/@modal).
// Aprendo o ricaricando l'indirizzo di una finestra, si torna alla pagina che
// c'era sotto (o alla mappa) e la finestra si riapre sopra (ModalReopen).
export const MODAL_PREFIXES = ["/scheda", "/social", "/forum", "/messaggi", "/ticket", "/gestione", "/utility", "/telefono"];

export function isModalPath(pathname: string) {
  return MODAL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Ultima pagina "sotto" le finestre: chiudendo una finestra si torna lì
// (anche dopo aver navigato dentro la finestra, es. forum → discussione).
let origin = "/mappa";
// La stessa pagina, ricordata anche dopo un ricaricamento
const ORIGIN_KEY = "gdr_pagina_sotto";

function savedOrigin() {
  try {
    const v = sessionStorage.getItem(ORIGIN_KEY);
    return v && v.startsWith("/") && !isModalPath(v.split("?")[0]) ? v : "/mappa";
  } catch {
    return "/mappa";
  }
}

/** Ricorda la pagina sotto le finestre e mostra lo slot solo sugli indirizzi delle finestre */
export function ModalGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const modal = isModalPath(pathname);
  useEffect(() => {
    if (modal) return;
    origin = pathname + window.location.search;
    try {
      sessionStorage.setItem(ORIGIN_KEY, origin);
    } catch {
      // archivio del browser non disponibile: si torna alla mappa
    }
  }, [pathname, modal]);
  return modal ? children : null;
}

// Finestra da riaprire dopo essere tornati alla pagina di sotto
let reopen: string | null = null;

/**
 * Pagina caricata direttamente su una finestra (link, F5, ricaricamento):
 * torna alla pagina di sotto e riapre la finestra sopra, invece di mostrarla
 * a pagina intera. Nel frattempo copre l'area centrale.
 */
export function ModalReopen() {
  const pathname = usePathname();
  const router = useRouter();
  const [startedOnModal] = useState(() => isModalPath(pathname));
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!startedOnModal || done) return;
    if (isModalPath(pathname)) {
      if (reopen) return; // già in corso
      reopen = pathname + window.location.search;
      origin = savedOrigin();
      router.replace(origin, { scroll: false });
      return;
    }
    // arrivati alla pagina di sotto: si riapre la finestra
    const target = reopen;
    reopen = null;
    const t = setTimeout(() => setDone(true), 0);
    if (target) router.push(target, { scroll: false });
    return () => clearTimeout(t);
  }, [pathname, router, startedOnModal, done]);

  if (!startedOnModal || done) return null;
  return <div aria-hidden className="fixed inset-x-0 bottom-0 top-[calc(5rem+env(safe-area-inset-top))] z-20 bg-background lg:top-24 lg:left-72" />;
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
