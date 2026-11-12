"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Camera } from "lucide-react";
import { sidebarIconClass } from "@/components/game/sidebar-styles";
import { setTitleCount } from "@/lib/title-count";
import { refreshCounters, useCounters } from "@/lib/counters";
import { cn } from "@/lib/utils";

/** Evento: nel social si è letto qualcosa (l'icona si aggiorna) */
export const SOCIAL_READ_EVENT = "social-letto";

/** Icona "Social" della barra laterale: DM non letti e attività nuove */
export function SocialIcon() {
  // contatori condivisi (una sola chiamata per tutte le icone: src/lib/counters.ts)
  const n = useCounters().social;
  useEffect(() => {
    setTitleCount("social", n.dms + n.activity);
  }, [n.dms, n.activity]);
  useEffect(() => {
    const onRead = () => refreshCounters(true);
    window.addEventListener(SOCIAL_READ_EVENT, onRead);
    return () => window.removeEventListener(SOCIAL_READ_EVENT, onRead);
  }, []);

  const total = n.dms + n.activity;
  return (
    <Link
      href="/social"
      className={cn(sidebarIconClass, "relative", n.dms > 0 && "blink-call")}
      aria-label={total ? `Social: ${n.dms} messaggi e ${n.activity} attività nuove` : "Social"}
    >
      <Camera />
      <span className="sr-only">Social</span>
      {total > 0 && <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-flamingo px-1 text-[0.6rem] leading-4 font-bold text-white">{total}</span>}
    </Link>
  );
}
