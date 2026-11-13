"use client";

import { useEffect, useRef } from "react";

// Dal Westeros (use-resync.ts). Ricontrolla i dati quando gli avvisi in tempo
// reale possono essersi persi: si torna sulla scheda del sito, torna la rete,
// o comunque ogni 5 minuti con la pagina in primo piano.
// Al massimo una volta ogni 45 secondi, e solo se la scheda è visibile
// (ogni richiesta finisce nei log di Supabase).
export function useResync(fn: () => void, everyMs = 300_000) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    let last = Date.now();
    const run = (force = false) => {
      if (document.visibilityState !== "visible") return;
      if (!force && Date.now() - last < 45_000) return;
      last = Date.now();
      ref.current();
    };
    const onVisible = () => run();
    const onOnline = () => run(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onOnline);
    const t = setInterval(() => run(true), everyMs);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onOnline);
      clearInterval(t);
    };
  }, [everyMs]);
}
