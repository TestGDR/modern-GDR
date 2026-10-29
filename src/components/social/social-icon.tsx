"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import { sidebarIconClass } from "@/components/game/sidebar-styles";
import { createClient } from "@/lib/supabase/client";
import { setTitleCount } from "@/lib/title-count";
import { useResync } from "@/lib/use-resync";
import { cn } from "@/lib/utils";

/** Evento: nel social si è letto qualcosa (l'icona si aggiorna) */
export const SOCIAL_READ_EVENT = "social-letto";

/** Icona "Social" della barra laterale: DM non letti e attività nuove */
export function SocialIcon() {
  const supabase = useMemo(() => createClient(), []);
  const [n, setN] = useState({ dms: 0, activity: 0 });

  const refresh = useCallback(async () => {
    const { data } = await supabase.rpc("social_unread");
    const next = (data as { dms: number; activity: number } | null) ?? { dms: 0, activity: 0 };
    setN(next);
    setTitleCount("social", next.dms + next.activity);
  }, [supabase]);

  useResync(refresh);
  useEffect(() => {
    const t = setTimeout(refresh, 0);
    const ch = supabase
      .channel("social:icona")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "social_dms" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "social_notifications" }, () => refresh())
      .subscribe();
    window.addEventListener(SOCIAL_READ_EVENT, refresh);
    return () => {
      clearTimeout(t);
      supabase.removeChannel(ch);
      window.removeEventListener(SOCIAL_READ_EVENT, refresh);
    };
  }, [supabase, refresh]);

  const total = n.dms + n.activity;
  return (
    <Link
      href="/social"
      className={cn(sidebarIconClass, "relative", n.dms > 0 && "blink-call")}
      aria-label={total ? `Social: ${n.dms} messaggi e ${n.activity} attività nuove` : "Social"}
    >
      <Newspaper /> Social
      {total > 0 && <span className="absolute top-1 right-3 grid min-w-4 place-items-center rounded-full bg-flamingo px-1 text-[0.6rem] leading-4 font-bold text-white">{total}</span>}
    </Link>
  );
}
