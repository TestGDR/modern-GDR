"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, Send } from "lucide-react";
import { ComingSoon, WindowButton } from "@/components/game/info-window";
import { barButtonClass } from "@/components/game/sidebar-styles";
import { everyEvenInBackground, playEvent } from "@/lib/notify-sound";
import { createClient } from "@/lib/supabase/client";
import { useResync } from "@/lib/use-resync";
import { cn } from "@/lib/utils";

// Messaggi OFF e ON nella barra in alto, con i contatori dei non letti
// (dal Westeros: useUnread in GameShell.tsx).

type Counts = { on: number; off: number };

/** Messaggi non letti del proprio personaggio, aggiornati in tempo reale */
function useUnread(characterId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const [counts, setCounts] = useState<Counts>({ on: 0, off: 0 });

  const refresh = useCallback(async () => {
    if (!characterId) return;
    const { count } = await supabase
      .from("private_messages")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", characterId)
      .is("read_at", null);
    // I messaggi OFF arrivano nella fase 5
    setCounts({ on: count ?? 0, off: 0 });
  }, [supabase, characterId]);

  useResync(refresh);

  useEffect(() => {
    if (!characterId) return;
    const first = setTimeout(refresh, 0);
    const ch = supabase
      .channel(`unread:${characterId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "private_messages", filter: `recipient_id=eq.${characterId}` }, () => refresh())
      // letto da un altro dispositivo o da un'altra scheda
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "private_messages", filter: `recipient_id=eq.${characterId}` }, () => refresh())
      .subscribe();
    return () => {
      clearTimeout(first);
      supabase.removeChannel(ch);
    };
  }, [supabase, characterId, refresh]);

  // Suono subito quando il conteggio sale, poi ogni 15 secondi finché resta
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

/** Con i contatori del proprio personaggio */
export function MessageButtons({ characterId }: { characterId: string | null }) {
  return <Buttons counts={useUnread(characterId)} />;
}

/** Segnaposto mentre arriva il personaggio */
export function MessageButtonsFallback() {
  return <Buttons counts={{ on: 0, off: 0 }} />;
}

function Buttons({ counts }: { counts: Counts }) {
  return (
    <>
      <span className="relative">
        <WindowButton label="Messaggi OFF" shortLabel="OFF" icon={<Mail />} className={cn(barButtonClass, counts.off > 0 && "blink-call")}>
          <ComingSoon>
            <p>I messaggi fuori gioco tra giocatori: conversazioni, gruppi, avvisi dello staff a tutti e i messaggi di SISTEMA del sito.</p>
          </ComingSoon>
        </WindowButton>
        <Badge n={counts.off} />
      </span>
      <Link
        href="/messaggi"
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
