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

// Evento della X: la finestra sparisce subito, anche prima che la pagina cambi
const CLOSE_EVENT = "gdr:chiudi-finestra";

/** Ricorda la pagina sotto le finestre e mostra lo slot solo sugli indirizzi delle finestre */
export function ModalGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const modal = isModalPath(pathname);
  // Finestra chiusa con la X su questo indirizzo: resta nascosta finché l'indirizzo non cambia
  const [hiddenAt, setHiddenAt] = useState<string | null>(null);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setHiddenAt(null);
  }
  useEffect(() => {
    const onClose = () => setHiddenAt(window.location.pathname);
    window.addEventListener(CLOSE_EVENT, onClose);
    return () => window.removeEventListener(CLOSE_EVENT, onClose);
  }, []);
  useEffect(() => {
    if (modal) return;
    origin = pathname + window.location.search;
    try {
      sessionStorage.setItem(ORIGIN_KEY, origin);
    } catch {
      // archivio del browser non disponibile: si torna alla mappa
    }
  }, [pathname, modal]);
  return modal && hiddenAt !== pathname ? children : null;
}

// Finestra da riaprire dopo essere tornati alla pagina di sotto
let reopen: string | null = null;
let reopenFinished = false;

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
    if (!startedOnModal || done || reopenFinished) return;
    if (isModalPath(pathname)) {
      if (reopen) return; // già in corso
      reopen = pathname + window.location.search;
      origin = savedOrigin();
      router.replace(origin, { scroll: false });
      return;
    }
    // arrivati alla pagina di sotto: si riapre la finestra (una volta sola)
    const target = reopen;
    reopen = null;
    reopenFinished = true;
    if (target) router.push(target, { scroll: false });
    setTimeout(() => setDone(true), 0);
  }, [pathname, router, startedOnModal, done]);

  if (!startedOnModal || done) return null;
  return <div aria-hidden className="fixed inset-x-0 bottom-0 top-[calc(5rem+env(safe-area-inset-top))] z-20 bg-background lg:top-24 lg:left-72" />;
}

/** Chiude la finestra tornando alla pagina che c'era sotto */
export function useCloseModal() {
  const router = useRouter();
  return useCallback(() => {
    const target = origin;
    const from = window.location.pathname + window.location.search;
    window.dispatchEvent(new Event(CLOSE_EVENT));
    router.push(target, { scroll: false });
    // La finestra è già sparita: se il ritorno tarda (server lento) si riprova
    // in silenzio, senza mai ricaricare la pagina
    const still = () => window.location.pathname + window.location.search === from;
    for (const delay of [4000, 10000]) {
      setTimeout(() => {
        if (still()) router.push(target, { scroll: false });
      }, delay);
    }
  }, [router]);
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
