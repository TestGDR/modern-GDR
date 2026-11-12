"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { FORUM_READ_EVENT } from "@/components/game/forum-client";
import { sidebarIconClass, sidebarPillClass } from "@/components/game/sidebar-styles";
import { createClient } from "@/lib/supabase/client";
import { refreshCounters, useCounters } from "@/lib/counters";
import { cn } from "@/lib/utils";

// Icona "Forum" della barra laterale (dal Westeros: useForumUnread): discussioni
// con messaggi nuovi. I post segnalati a tutti arrivano come messaggio di SISTEMA.

/** wide: pulsante lungo con la scritta (barra laterale, sotto la Guida) */
export function ForumIcon({ wide = false }: { wide?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  // contatori condivisi (una sola chiamata per tutte le icone: src/lib/counters.ts)
  const { forum_unread: unread } = useCounters();

  useEffect(() => {
    // prima visita: da qui le discussioni nuove contano come non lette
    const first = setTimeout(() => supabase.rpc("forum_touch").then(() => refreshCounters(true)), 0);
    const onRead = () => refreshCounters(true);
    window.addEventListener(FORUM_READ_EVENT, onRead);
    return () => {
      clearTimeout(first);
      window.removeEventListener(FORUM_READ_EVENT, onRead);
    };
  }, [supabase]);

  if (wide) {
    return (
      <Link href="/forum" className={cn(sidebarPillClass, unread > 0 && "blink-call")} aria-label={unread ? `Forum: ${unread} discussioni nuove` : "Forum"}>
        <MessagesSquare /> Forum
        {unread > 0 && <span className="absolute -top-1 right-3 grid min-w-4 place-items-center rounded-full bg-flamingo px-1 text-[0.6rem] leading-4 font-bold text-white">{unread}</span>}
      </Link>
    );
  }
  return (
    <Link href="/forum" className={cn(sidebarIconClass, "relative", unread > 0 && "blink-call")} aria-label={unread ? `Forum: ${unread} discussioni nuove` : "Forum"}>
      <MessagesSquare />
      <span className="sr-only">Forum</span>
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-flamingo px-1 text-[0.6rem] leading-4 font-bold text-white">{unread}</span>
      )}
    </Link>
  );
}
