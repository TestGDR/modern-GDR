"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAvailability, type Availability } from "@/lib/availability";
import { firstName } from "@/lib/format";
import { readLastActivity, writeLastActivity } from "@/lib/last-activity";
import { createClient } from "@/lib/supabase/client";

// Presenti online (dal Westeros: presence.ts).
// - canale "online" di Supabase: chi entra o esce fa rileggere l'elenco (al massimo ogni 30 s)
// - segnale nel database (touch_online) solo se c'è stata attività, al massimo ogni 3 minuti, a scheda visibile
// - elenco riletto dal database (recent_online) ogni 3 minuti, a scheda visibile
// Pochi controlli: ogni richiesta finisce nei log di Supabase (quota del piano Free).
// Online = ha fatto un'azione nel sito entro il tempo dell'uscita per inattività (2 ore). Si sparisce subito solo con Esci.
// Nome e ritratto li mette il database: il browser manda solo posto e disponibilità.

export type OnlinePlayer = {
  userId: string;
  name: string;
  avatar: string | null;
  characterId: string | null;
  levelName: string | null;
  levelColor: string | null;
  levelIcon: string | null;
  availability: Availability;
  place: string;
  placeKey: string;
  /** Messaggio OFF scritto dal giocatore */
  note: string;
  /** sotto-tag della chat in cui si trova (se ne ha scelto uno) */
  subTag: string;
  invisible: boolean;
};

export type PresenceInfo = { availability: Availability; place: string; placeKey: string; note?: string; subTag?: string };

/** Ogni quanto si guarda se mandare il segnale */
const TICK_MS = 60_000;
/** Al massimo un segnale ogni 5 minuti (online = un'azione nelle ultime 2 ore) */
const HEARTBEAT_MS = 300_000;
/** Rilettura dell'elenco a scheda visibile */
const POLL_MS = 300_000;
/** Riletture dopo gli avvisi: al massimo una ogni 90 secondi */
const REFRESH_GAP_MS = 90_000;
const RETRY_MS = 4_000;

type Row = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  character_id: string | null;
  level_name: string | null;
  level_color: string | null;
  level_icon?: string | null;
  info: Partial<PresenceInfo> | null;
  invisible: boolean;
};

// Chi è "in cerca di gioco" va in cima, poi in ordine alfabetico
const byAvailabilityThenName = (a: OnlinePlayer, b: OnlinePlayer) =>
  (a.availability === "cerca" ? 0 : 1) - (b.availability === "cerca" ? 0 : 1) || a.name.localeCompare(b.name);

export function usePresence(info: PresenceInfo) {
  const supabase = useMemo(() => createClient(), []);
  const [players, setPlayers] = useState<OnlinePlayer[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const payload = JSON.stringify(info);
  const latest = useRef(payload);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    latest.current = payload;
  }, [payload]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.rpc("recent_online");
    if (!data) return;
    setPlayers(
      (data as Row[])
        .map((r) => ({
          userId: r.user_id,
          // fuori dalla scheda si mostra solo il nome
          name: firstName(r.name),
          avatar: r.avatar_url,
          characterId: r.character_id,
          levelName: r.level_name,
          levelColor: r.level_color,
          levelIcon: r.level_icon ?? null,
          availability: isAvailability(r.info?.availability) ? r.info.availability : "disponibile",
          place: r.info?.place ?? "",
          placeKey: r.info?.placeKey ?? "",
          note: r.info?.note ?? "",
          subTag: r.info?.subTag ?? "",
          invisible: r.invisible,
        }))
        .sort(byAvailabilityThenName),
    );
  }, [supabase]);

  // Riletture raggruppate: al massimo una ogni 90 secondi, con un piccolo ritardo
  // a caso perché non partano tutti insieme quando qualcuno entra o esce
  const lastRefresh = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const softRefresh = useCallback(() => {
    if (pending.current) return;
    const wait = Math.max(0, lastRefresh.current + REFRESH_GAP_MS - Date.now()) + 1000 + Math.random() * 4000;
    pending.current = setTimeout(() => {
      pending.current = null;
      if (document.visibilityState !== "visible") return;
      lastRefresh.current = Date.now();
      refresh();
    }, wait);
  }, [refresh]);
  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
  }, []);

  // Chi sono (serve come chiave del canale)
  useEffect(() => {
    // dalla sessione nel browser: niente chiamata al server
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
  }, [supabase]);

  // --- Tempo reale: entrate e uscite subito ---
  useEffect(() => {
    if (!userId) return;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const ch = supabase.channel("online", { config: { presence: { key: userId } } });
    channelRef.current = ch;
    ch.on("presence", { event: "sync" }, () => {
      // qualcuno è entrato o uscito: rileggo l'elenco dal database (raggruppato)
      softRefresh();
    })
      // qualcuno ha cambiato sotto-tag in chat: anche qui si rilegge (raggruppato)
      .on("broadcast", { event: "posto" }, () => softRefresh())
      .subscribe((status) => {
      if (disposed) return;
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        // collegamento caduto: lo ricreo da zero tra poco
        clearTimeout(retry);
        retry = setTimeout(() => setAttempt((a) => a + 1), RETRY_MS);
        return;
      }
      if (status === "SUBSCRIBED") ch.track({ at: Date.now() });
    });
    return () => {
      disposed = true;
      clearTimeout(retry);
      if (channelRef.current === ch) channelRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [supabase, userId, softRefresh, attempt]);

  // --- Segnale nel database ---
  useEffect(() => {
    const beat = (action = false) => supabase.rpc("touch_online", { p_info: JSON.parse(latest.current), p_action: action });
    // chi usa davvero il sito (mouse, tastiera, tocco, finestre, telefono, social…) resta tra gli online:
    // il battito conta come azione se dall'ultimo c'è stata attività
    // il segnale parte solo a scheda visibile, se dall'ultimo c'è stata attività, al massimo ogni 3 minuti
    let lastBeat = Date.now();
    const beatTimer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastBeat < HEARTBEAT_MS) return;
      if (readLastActivity() <= lastBeat) return;
      lastBeat = Date.now();
      beat(true);
    }, TICK_MS);
    const pollTimer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      lastRefresh.current = Date.now();
      refresh();
    }, POLL_MS);
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      // tornare sulla pagina (o riavere la rete) è un'azione: si ricompare tra i presenti
      writeLastActivity(Date.now());
      if (Date.now() - lastBeat >= REFRESH_GAP_MS) {
        lastBeat = Date.now();
        beat(true).then(softRefresh);
      }
      const ch = supabase.getChannels().find((c) => c.topic === "realtime:online");
      if (!ch || ch.state !== "joined") setAttempt((a) => a + 1);
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("online", onBack);
    return () => {
      clearInterval(beatTimer);
      clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("online", onBack);
    };
  }, [supabase, refresh, softRefresh]);

  // Aprire la pagina, cambiare posto o disponibilità sono azioni: segnale subito, elenco raggruppato
  const lastSubTag = useRef(info.subTag ?? "");
  useEffect(() => {
    const parsed = JSON.parse(payload) as PresenceInfo;
    supabase.rpc("touch_online", { p_info: parsed, p_action: true }).then(() => {
      // cambio di sotto-tag: lo sanno subito anche gli altri
      const sub = parsed.subTag ?? "";
      if (sub !== lastSubTag.current) {
        lastSubTag.current = sub;
        channelRef.current?.send({ type: "broadcast", event: "posto", payload: {} });
      }
      if (!lastRefresh.current) {
        // prima apertura: l'elenco serve subito
        lastRefresh.current = Date.now();
        refresh();
      } else softRefresh();
    });
  }, [supabase, payload, refresh, softRefresh]);

  return { players, me: userId, refresh };
}
