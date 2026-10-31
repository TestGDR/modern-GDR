"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutExpired, logoutIdle } from "@/lib/actions/auth";
import { useResync } from "@/lib/use-resync";

// Due controlli del sito che girano nel browser (dal Westeros):
// - banner "Aggiorna" quando è stata pubblicata una nuova versione;
// - uscita automatica dopo il tempo di inattività, con avviso 5 minuti prima;
// - uscita alla fine della durata massima della sessione.

/** Banner "nuova versione": confronta la propria versione con /api/versione ogni 10 minuti */
export function VersionBanner() {
  const [outdated, setOutdated] = useState(false);
  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/versione", { cache: "no-store" });
      const { v } = (await res.json()) as { v: string };
      const mine = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
      if (v !== "dev" && mine !== "dev" && v !== mine) setOutdated(true);
    } catch {
      // senza rete si riprova al prossimo giro
    }
  }, []);
  useResync(check, 10 * 60_000);
  if (!outdated) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 bg-flamingo px-4 py-2 text-sm font-medium text-white shadow-lg">
      È disponibile una nuova versione del sito.
      <Button type="button" size="sm" variant="secondary" onClick={() => window.location.reload()} className="rounded-full">
        <RefreshCw /> Aggiorna
      </Button>
    </div>
  );
}

const KEY = "moderngdr-ultima-attivita";
const EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "pointerdown", "scroll"] as const;
const WARN_BEFORE_MS = 5 * 60_000;

function readLast() {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
function writeLast(t: number) {
  try {
    localStorage.setItem(KEY, String(t));
  } catch {
    // senza localStorage vale solo questa scheda
  }
}

/**
 * Uscita dopo `minutes` minuti senza attività. Conta come attività muovere il
 * mouse, cliccare, scrivere, toccare lo schermo, cambiare pagina. Le schede
 * aperte contano insieme: l'ultima attività sta nel browser (localStorage).
 */
export function IdleLogout({ minutes }: { minutes: number }) {
  const idleMs = minutes * 60_000;
  const pathname = usePathname();
  const last = useRef(0);
  const leaving = useRef(false);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);

  const touch = useCallback(() => {
    const now = Date.now();
    if (now - last.current > 15_000) writeLast(now);
    last.current = now;
  }, []);

  useEffect(() => {
    // all'apertura: un'attività vecchia di una sessione precedente non conta
    const stored = readLast();
    if (!stored || Date.now() - stored >= idleMs) writeLast(Date.now());
    touch();
    for (const e of EVENTS) window.addEventListener(e, touch, { passive: true, capture: true });
    const check = setInterval(() => {
      if (leaving.current) return;
      const idle = Date.now() - Math.max(last.current, readLast());
      if (idle >= idleMs) {
        leaving.current = true;
        logoutIdle();
      } else if (idle >= idleMs - WARN_BEFORE_MS) {
        setMinutesLeft(Math.max(1, Math.ceil((idleMs - idle) / 60_000)));
      } else {
        setMinutesLeft(null);
      }
    }, 10_000);
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, touch, { capture: true });
      clearInterval(check);
    };
  }, [idleMs, touch]);

  // cambiare pagina è attività
  useEffect(() => {
    touch();
  }, [pathname, touch]);

  if (minutesLeft === null) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-night/70 p-4">
      <div className="glass w-full max-w-sm rounded-3xl p-6 text-center">
        <Clock className="mx-auto mb-3 size-8 text-peach" />
        <h2 className="font-heading text-3xl tracking-wide">Sei ancora qui?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Per inattività verrai disconnesso tra {minutesLeft} {minutesLeft === 1 ? "minuto" : "minuti"}.
        </p>
        <Button
          type="button"
          onClick={() => {
            touch();
            writeLast(Date.now());
            setMinutesLeft(null);
          }}
          className="mt-4 rounded-full"
        >
          Resto collegato
        </Button>
      </div>
    </div>
  );
}

/**
 * Durata massima della sessione: a `endsAt` (ms) si esce anche se si sta giocando,
 * con un avviso 5 minuti prima. L'ora d'ingresso la scrive il server al login.
 */
export function SessionExpiry({ endsAt }: { endsAt: number }) {
  const leaving = useRef(false);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const tick = () => {
      if (leaving.current) return;
      const left = endsAt - Date.now();
      if (left <= 0) {
        leaving.current = true;
        logoutExpired();
      } else if (left <= WARN_BEFORE_MS) {
        setMinutesLeft(Math.max(1, Math.ceil(left / 60_000)));
      }
    };
    tick();
    const check = setInterval(tick, 10_000);
    return () => clearInterval(check);
  }, [endsAt]);

  if (minutesLeft === null || hidden) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-[70] mx-auto flex w-[min(28rem,calc(100vw-2rem))] items-center gap-3 rounded-2xl border border-peach/40 bg-night/95 px-4 py-3 text-sm shadow-xl backdrop-blur">
      <Clock className="size-5 shrink-0 text-peach" />
      <span className="flex-1">
        La sessione scade tra {minutesLeft} {minutesLeft === 1 ? "minuto" : "minuti"}: salva quello che stai scrivendo, poi dovrai rientrare.
      </span>
      <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={() => setHidden(true)}>
        Ok
      </Button>
    </div>
  );
}
