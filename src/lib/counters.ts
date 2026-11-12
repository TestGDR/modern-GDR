"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { playEvent } from "@/lib/notify-sound";
import type { PhoneState } from "@/lib/phone";
import { createClient } from "@/lib/supabase/client";

// Tutti i contatori delle icone in UNA chiamata (RPC my_counters), condivisi
// da tutti i componenti: meno richieste e meno log delle API di Supabase.
// - cache di 45 secondi: chi lo chiede di nuovo prima riceve i numeri già letti
// - gli avvisi in tempo reale (Realtime) fanno partire una sola chiamata entro
//   1,5 secondi, anche se arrivano in tanti insieme
// - con la scheda nascosta si aggiorna subito solo per messaggi, telefono e
//   ticket (servono per i suoni); il resto aspetta il ritorno sulla scheda
// - in più un ricontrollo ogni 3 minuti, solo a scheda visibile

export type Counters = {
  off: number;
  phone: PhoneState;
  forum_unread: number;
  social: { dms: number; activity: number };
  tickets: string[];
  news: number;
  news_seen_at: string | null;
  absences: number;
  play_requests: number;
  gossip: number;
  /** voci (pettegolezzi approvati) dopo l'ultima apertura */
  gossip_new: number;
  /** eventi del calendario creati da altri dopo l'ultima apertura */
  calendar_new: number;
  /** articoli e podcast usciti dopo l'ultima apertura del giornale */
  press_new: number;
  /** pezzi in redazione da pubblicare (solo per chi pubblica) */
  press_review: number;
  /** legami cercati da altri dopo l'ultima apertura di Cerca legami */
  bond_new: number;
};

export const EMPTY_COUNTERS: Counters = {
  off: 0,
  phone: { unread: 0, call: null },
  forum_unread: 0,
  social: { dms: 0, activity: 0 },
  tickets: [],
  news: 0,
  news_seen_at: null,
  absences: 0,
  play_requests: 0,
  gossip: 0,
  gossip_new: 0,
  calendar_new: 0,
  press_new: 0,
  press_review: 0,
  bond_new: 0,
};

const CACHE_MS = 45_000;
const DEBOUNCE_MS = 1_500;
const RESYNC_MS = 180_000;

let state: Counters = EMPTY_COUNTERS;
let fetchedAt = 0;
let inflight: Promise<void> | null = null;
// richiesta forzata arrivata durante una lettura: se ne fa un'altra subito dopo
let again = false;
let debounce: ReturnType<typeof setTimeout> | null = null;
// avvisi arrivati con la scheda nascosta: si aggiorna al ritorno
let staleWhileHidden = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Rilegge i contatori (con force anche se la cache è fresca); una chiamata alla volta */
export function refreshCounters(force = false): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!force && Date.now() - fetchedAt < CACHE_MS) return Promise.resolve();
  if (inflight) {
    // la lettura in corso può avere i numeri di prima (es. messaggio appena letto)
    if (force) again = true;
    return inflight;
  }
  inflight = (async () => {
    try {
      const { data, error } = await createClient().rpc("my_counters");
      if (!error && data) {
        state = { ...EMPTY_COUNTERS, ...(data as Partial<Counters>) };
        fetchedAt = Date.now();
        emit();
      }
    } finally {
      inflight = null;
      if (again) {
        again = false;
        void refreshCounters(true);
      }
    }
  })();
  return inflight;
}

/** È cambiato qualcosa: una sola rilettura entro 1,5 secondi (urgent: anche a scheda nascosta) */
export function requestCounters(urgent = false) {
  if (typeof document === "undefined") return;
  if (!urgent && document.visibilityState !== "visible") {
    staleWhileHidden = true;
    return;
  }
  if (debounce) return;
  debounce = setTimeout(() => {
    debounce = null;
    refreshCounters(true);
  }, DEBOUNCE_MS);
}

/* ---------- Avvisi in tempo reale e ricontrollo: una sola volta per tutto il sito ---------- */

let users = 0;
let stop: (() => void) | null = null;

function start() {
  const supabase = createClient();
  let disposed = false;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  supabase.auth.getSession().then(({ data }) => {
    const me = data.session?.user.id;
    if (disposed || !me) return;
    const urgent = () => requestCounters(true);
    const later = () => requestCounters(false);
    channel = supabase
      .channel(`contatori:${me}`)
      // messaggi OFF (anche letti da un'altra scheda), gruppi, messaggi a tutti, SISTEMA
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "private_messages", filter: `recipient_id=eq.${me}` }, urgent)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "private_messages", filter: `recipient_id=eq.${me}` }, later)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "off_group_messages" }, urgent)
      .on("postgres_changes", { event: "*", schema: "public", table: "off_group_members" }, later)
      .on("postgres_changes", { event: "*", schema: "public", table: "off_broadcasts" }, urgent)
      .on("postgres_changes", { event: "*", schema: "public", table: "off_broadcast_reads", filter: `user_id=eq.${me}` }, later)
      .on("postgres_changes", { event: "*", schema: "public", table: "system_messages", filter: `user_id=eq.${me}` }, urgent)
      // telefono
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "phone_messages" }, urgent)
      .on("postgres_changes", { event: "*", schema: "public", table: "phone_members" }, later)
      .on("postgres_changes", { event: "*", schema: "public", table: "phone_calls" }, urgent)
      // ticket
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, urgent)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages" }, urgent)
      // forum, social, annunci, comunità
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "forum_posts" }, later)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "social_dms" }, later)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "social_notifications" }, later)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "news" }, later)
      .on("postgres_changes", { event: "*", schema: "public", table: "absences" }, later)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "play_requests" }, later)
      .on("postgres_changes", { event: "*", schema: "public", table: "gossip_reports" }, later)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calendar_events" }, later)
      // giornale: uscite e pezzi mandati in redazione
      .on("postgres_changes", { event: "*", schema: "public", table: "press_items" }, later)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bond_searches" }, later)
      .subscribe();
  });

  // tornando sulla scheda (al massimo ogni 45 s, o subito se sono arrivati avvisi), tornando in rete, ogni 3 minuti
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    refreshCounters(staleWhileHidden);
    staleWhileHidden = false;
  };
  const onOnline = () => refreshCounters(true);
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") refreshCounters(true);
  }, RESYNC_MS);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  window.addEventListener("online", onOnline);
  refreshCounters();

  return () => {
    disposed = true;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
    window.removeEventListener("online", onOnline);
    if (channel) supabase.removeChannel(channel);
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** I contatori condivisi; il primo componente che li usa accende avvisi e ricontrollo */
export function useCounters(): Counters {
  useEffect(() => {
    users += 1;
    if (users === 1) stop = start();
    return () => {
      users -= 1;
      if (users === 0 && stop) {
        stop();
        stop = null;
      }
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY_COUNTERS,
  );
}

/** Contatori con il segno «visto»: il simbolo si illumina finché non si apre la sezione */
export type SeenKind = "absences" | "play_requests" | "gossip_new" | "calendar_new" | "press_new" | "bond_new";
const SEEN_TABLE: Record<SeenKind, string> = {
  absences: "absences_seen",
  play_requests: "play_requests_seen",
  gossip_new: "gossip_seen",
  calendar_new: "calendar_seen",
  press_new: "press_seen",
  bond_new: "bond_seen",
};

/** Quante novità e il segno «visto» (aperto qui: zero subito, poi si rilegge); sound = suono alle novità */
export function useSeenCounter(kind: SeenKind, sound = true) {
  const counters = useCounters();
  const [seenBase, setSeenBase] = useState<Counters | null>(null);
  const n = seenBase === counters ? 0 : counters[kind];
  const previous = useRef(counters[kind]);
  useEffect(() => {
    if (sound && counters[kind] > previous.current) playEvent("off");
    previous.current = counters[kind];
  }, [counters, kind, sound]);
  const markSeen = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const me = data.session?.user.id;
    if (!me) return;
    setSeenBase(counters);
    await supabase.from(SEEN_TABLE[kind]).upsert({ user_id: me, seen_at: new Date().toISOString() });
    refreshCounters(true);
  }, [counters, kind]);
  return { n, markSeen };
}
