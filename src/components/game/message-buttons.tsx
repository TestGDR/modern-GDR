"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, Send } from "lucide-react";
import { barButtonClass } from "@/components/game/sidebar-styles";
import { everyEvenInBackground, playEvent } from "@/lib/notify-sound";
import { createClient } from "@/lib/supabase/client";
import { useResync } from "@/lib/use-resync";
import { cn } from "@/lib/utils";

// Messaggi OFF e ON nella barra in alto, con i contatori dei non letti separati
// (dal Westeros: useUnread in GameShell.tsx).

type Counts = { on: number; off: number };

/** Non letti dei due canali (messaggi, gruppi, messaggi a tutti, SISTEMA), in tempo reale */
function useUnread(userId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const [counts, setCounts] = useState<Counts>({ on: 0, off: 0 });

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [on, off] = await Promise.all([supabase.rpc("off_unread", { p_channel: "on" }), supabase.rpc("off_unread", { p_channel: "off" })]);
    setCounts({ on: (on.data as number | null) ?? 0, off: (off.data as number | null) ?? 0 });
  }, [supabase, userId]);

  useResync(refresh);

  useEffect(() => {
    if (!userId) return;
    const first = setTimeout(refresh, 0);
    const ch = supabase
      .channel(`unread:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "private_messages", filter: `recipient_id=eq.${userId}` }, () => refresh())
      // letto da un altro dispositivo o da un'altra scheda
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "private_messages", filter: `recipient_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "off_group_messages" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "off_group_members" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "off_broadcasts" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "off_broadcast_reads", filter: `user_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "system_messages", filter: `user_id=eq.${userId}` }, () => refresh())
      .subscribe();
    return () => {
      clearTimeout(first);
      supabase.removeChannel(ch);
    };
  }, [supabase, userId, refresh]);

  // Suono subito quando un conteggio sale, poi ogni 15 secondi finché resta
  // qualcosa da leggere, anche con la scheda in secondo piano
  const previous = useRef<Counts>({ on: 0, off: 0 });
  useEffect(() => {
    if (counts.on > previous.current.on) playEvent("on");
    else if (counts.off > previous.current.off) playEvent("off");
    previous.current = counts;
    if (counts.on + counts.off === 0) return;
    return everyEvenInBackground(() => playEvent(counts.on > 0 ? "on" : "off"), 15_000);
  }, [counts]);

  // Numero dei non letti nel titolo della scheda, es. "(2) Mappa · Modern GDR"
  const total = counts.on + counts.off;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = total > 0 ? `(${total}) ${base}` : base;
  }, [total, pathname]);

  return counts;
}

function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full bg-flamingo px-1 text-[0.6rem] leading-4 font-bold text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Con i contatori dell'utente collegato */
export function MessageButtons({ userId }: { userId: string | null }) {
  return <Buttons counts={useUnread(userId)} />;
}

/** Segnaposto mentre arriva l'utente */
export function MessageButtonsFallback() {
  return <Buttons counts={{ on: 0, off: 0 }} />;
}

function Buttons({ counts }: { counts: Counts }) {
  return (
    <>
      <Link
        href="/messaggi?canale=off"
        className={cn(barButtonClass, counts.off > 0 && "blink-call")}
        aria-label={counts.off > 0 ? `Messaggi OFF: ${counts.off} da leggere` : "Messaggi OFF"}
      >
        <Mail /> <span className="sm:hidden">OFF</span>
        <span className="hidden sm:inline">Messaggi OFF</span>
        <Badge n={counts.off} />
      </Link>
      <Link
        href="/messaggi?canale=on"
        className={cn(barButtonClass, counts.on > 0 && "blink-call")}
        aria-label={counts.on > 0 ? `Messaggi ON: ${counts.on} da leggere` : "Messaggi ON"}
      >
        <Send /> <span className="sm:hidden">ON</span>
        <span className="hidden sm:inline">Messaggi ON</span>
        <Badge n={counts.on} />
      </Link>
    </>
  );
}
