"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAvailability, type Availability } from "@/lib/availability";
import { createClient } from "@/lib/supabase/client";

// Presenti online (dal Westeros: presence.ts).
// - canale "online" di Supabase: chi entra o esce si vede subito
// - segnale nel database (touch_online) ogni 60 secondi
// - elenco riletto dal database (recent_online) ogni 20 secondi
// Online = ha fatto un'azione nel sito nell'ultima ora. Si sparisce subito solo con Esci.
// Nome e ritratto li mette il database: il browser manda solo posto e disponibilità.

export type OnlinePlayer = {
  userId: string;
  name: string;
  avatar: string | null;
  characterId: string | null;
  levelName: string | null;
  levelColor: string | null;
  availability: Availability;
  place: string;
  placeKey: string;
  /** Messaggio OFF scritto dal giocatore */
  note: string;
  invisible: boolean;
};

export type PresenceInfo = { availability: Availability; place: string; placeKey: string; note?: string };

const HEARTBEAT_MS = 60_000;
const POLL_MS = 20_000;
const RETRY_MS = 4_000;

type Row = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  character_id: string | null;
  level_name: string | null;
  level_color: string | null;
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
          name: r.name,
          avatar: r.avatar_url,
          characterId: r.character_id,
          levelName: r.level_name,
          levelColor: r.level_color,
          availability: isAvailability(r.info?.availability) ? r.info.availability : "disponibile",
          place: r.info?.place ?? "",
          placeKey: r.info?.placeKey ?? "",
          note: r.info?.note ?? "",
          invisible: r.invisible,
        }))
        .sort(byAvailabilityThenName),
    );
  }, [supabase]);

  // Chi sono (serve come chiave del canale)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, [supabase]);

  // --- Tempo reale: entrate e uscite subito ---
  useEffect(() => {
    if (!userId) return;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const ch = supabase.channel("online", { config: { presence: { key: userId } } });
    ch.on("presence", { event: "sync" }, () => {
      // qualcuno è entrato o uscito: rileggo l'elenco dal database
      setTimeout(refresh, 1500);
    }).subscribe((status) => {
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
      supabase.removeChannel(ch);
    };
  }, [supabase, userId, refresh, attempt]);

  // --- Segnale nel database ---
  useEffect(() => {
    const beat = (action = false) => supabase.rpc("touch_online", { p_info: JSON.parse(latest.current), p_action: action });
    const beatTimer = setInterval(() => beat(), HEARTBEAT_MS);
    const pollTimer = setInterval(refresh, POLL_MS);
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      beat().then(refresh);
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
  }, [supabase, refresh]);

  // Aprire la pagina, cambiare posto o disponibilità sono azioni: aggiorno subito
  useEffect(() => {
    supabase.rpc("touch_online", { p_info: JSON.parse(payload), p_action: true }).then(refresh);
  }, [supabase, payload, refresh]);

  return { players, me: userId, refresh };
}
