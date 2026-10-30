"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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

/**
 * Ogni sezione ha la sua finestra (forum, utility…, che cambia contenuto
 * navigando dentro); ogni scheda personaggio ne ha una sua.
 */
function windowKey(pathname: string) {
  const prefix = MODAL_PREFIXES.find((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!prefix) return pathname;
  return prefix === "/scheda" ? pathname : prefix;
}

/* ------------------------------ Gestore delle finestre ------------------------------ */

type WindowEntry = {
  key: string;
  kind: "page" | "sheet";
  label: string;
  width: number;
  height: number;
  children: React.ReactNode;
  /** cresce a ogni nuova apertura: la finestra torna davanti */
  raise: number;
};
type Host = { register: (e: Omit<WindowEntry, "raise">) => void };
const HostContext = createContext<Host | null>(null);
type StackCtx = { id: string; close: (id: string) => void };
const ModalStackContext = createContext<StackCtx | null>(null);

/**
 * Le pagine in finestra (scheda, social, forum, messaggi, gestione…) consegnano
 * qui il loro contenuto: le finestre restano aperte insieme, anche cambiando
 * pagina o aprendone altre, e si chiudono solo con la X.
 * Ricorda anche la pagina "sotto" a cui tornare.
 */
export function ModalGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [entries, setEntries] = useState<WindowEntry[]>([]);
  // finestra dell'indirizzo attuale chiusa con la X: non si riapre finché l'indirizzo non cambia
  const closedAt = useRef<string | null>(null);
  const raiseCount = useRef(0);

  useEffect(() => {
    if (closedAt.current !== null && closedAt.current !== pathname) closedAt.current = null;
    if (isModalPath(pathname)) return;
    origin = pathname + window.location.search;
    try {
      sessionStorage.setItem(ORIGIN_KEY, origin);
    } catch {
      // archivio del browser non disponibile: si torna alla mappa
    }
  }, [pathname]);

  const host = useMemo<Host>(
    () => ({
      register: (e) => {
        if (closedAt.current === window.location.pathname) return;
        setEntries((prev) => {
          const i = prev.findIndex((x) => x.key === e.key);
          if (i < 0) return [...prev, { ...e, raise: ++raiseCount.current }];
          const old = prev[i];
          if (old.children === e.children && old.label === e.label) return prev;
          const next = [...prev];
          next[i] = { ...e, raise: ++raiseCount.current };
          return next;
        });
      },
    }),
    [],
  );

  const close = useCallback(
    (id: string) => {
      setEntries((prev) => prev.filter((e) => e.key !== id));
      // era la finestra dell'indirizzo attuale: si torna alla pagina di sotto
      if (isModalPath(window.location.pathname) && windowKey(window.location.pathname) === id) {
        closedAt.current = window.location.pathname;
        const target = origin;
        const from = window.location.pathname + window.location.search;
        router.push(target, { scroll: false });
        // se il ritorno tarda (server lento) si riprova in silenzio
        for (const delay of [4000, 10000]) {
          setTimeout(() => {
            if (window.location.pathname + window.location.search === from) router.push(target, { scroll: false });
          }, delay);
        }
      }
    },
    [router],
  );

  return (
    <HostContext.Provider value={host}>
      {/* le pagine delle finestre non disegnano niente: consegnano il contenuto qui sotto */}
      {children}
      {entries.map((e, i) => (
        <ModalStackContext.Provider key={e.key} value={{ id: e.key, close }}>
          {e.kind === "sheet" ? (
            <FloatingWindow label="Scheda personaggio" onClose={() => close(e.key)} initialWidth={900} initialHeight={620} chromeless raiseKey={e.raise} offset={(i % 6) * 28}>
              {e.children}
            </FloatingWindow>
          ) : (
            <FloatingWindow label={e.label} onClose={() => close(e.key)} initialWidth={e.width} initialHeight={e.height} raiseKey={e.raise} offset={(i % 6) * 28}>
              {e.children}
            </FloatingWindow>
          )}
        </ModalStackContext.Provider>
      ))}
    </HostContext.Provider>
  );
}

/** Consegna il contenuto della pagina al gestore delle finestre */
function useRegisterWindow(entry: Omit<WindowEntry, "key" | "raise">) {
  const host = useContext(HostContext);
  const pathname = usePathname();
  const { kind, label, width, height, children } = entry;
  useEffect(() => {
    host?.register({ key: windowKey(pathname), kind, label, width, height, children });
  }, [host, pathname, kind, label, width, height, children]);
  return host !== null;
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

/** Chiude la finestra in cui si è (se è quella dell'indirizzo attuale, si torna alla pagina di sotto) */
export function useCloseModal() {
  const ctx = useContext(ModalStackContext);
  const router = useRouter();
  return useCallback(() => {
    if (ctx) return ctx.close(ctx.id);
    router.push(origin, { scroll: false });
  }, [ctx, router]);
}

/** Finestra trascinabile e ridimensionabile con dentro una pagina del gioco */
export function PageModal({ label, children, width = 820, height = 600 }: { label: string; children: React.ReactNode; width?: number; height?: number }) {
  const hosted = useRegisterWindow({ kind: "page", label, width, height, children });
  const close = useCloseModal();
  if (hosted) return null;
  // fuori dal gioco (senza gestore): finestra semplice
  return (
    <FloatingWindow label={label} onClose={close} initialWidth={width} initialHeight={height}>
      {children}
    </FloatingWindow>
  );
}

/** Finestra 900x620 della scheda del personaggio */
export function SheetWindow({ children }: { children: React.ReactNode }) {
  const hosted = useRegisterWindow({ kind: "sheet", label: "Scheda personaggio", width: 900, height: 620, children });
  const close = useCloseModal();
  if (hosted) return null;
  return (
    <FloatingWindow label="Scheda personaggio" onClose={close} initialWidth={900} initialHeight={620} chromeless>
      {children}
    </FloatingWindow>
  );
}
