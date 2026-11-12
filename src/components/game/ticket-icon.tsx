"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { sidebarIconClass, sidebarPillClass } from "@/components/game/sidebar-styles";
import { playEvent } from "@/lib/notify-sound";
import { setTitleCount } from "@/lib/title-count";
import { useCounters } from "@/lib/counters";
import { cn } from "@/lib/utils";

// Icona "Ticket" della barra laterale (dal Westeros: useTicketUnread).
// Quando compare un ticket da leggere: suono "off", avviso a comparsa e lampeggio.

/** wide: pulsante lungo con la scritta (barra laterale, sotto il Forum) */
export function TicketIcon({ wide = false }: { wide?: boolean }) {
  const pathname = usePathname();
  // contatori condivisi (una sola chiamata per tutte le icone: src/lib/counters.ts)
  const ids = useCounters().tickets;
  const [toast, setToast] = useState(false);

  // Un ticket nuovo da leggere: suono e avviso
  const previous = useRef<string[]>([]);
  useEffect(() => {
    const fresh = ids.some((id) => !previous.current.includes(id));
    previous.current = ids;
    if (!fresh) return;
    playEvent("off");
    const show = setTimeout(() => setToast(true), 0);
    const hide = setTimeout(() => setToast(false), 6000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [ids]);

  useEffect(() => {
    setTitleCount("ticket", ids.length);
  }, [ids.length, pathname]);

  return (
    <>
      <Link
        href="/ticket"
        className={cn(wide ? sidebarPillClass : cn(sidebarIconClass, "relative"), ids.length > 0 && "blink-call")}
        aria-label={ids.length ? `Ticket: ${ids.length} da leggere` : "Ticket"}
      >
        <LifeBuoy />
        {wide ? "Ticket" : <span className="sr-only">Ticket</span>}
        {ids.length > 0 && (
          <span className={cn("absolute -top-1 grid min-w-4 place-items-center rounded-full bg-flamingo px-1 text-[0.6rem] leading-4 font-bold text-white", wide ? "right-3" : "-right-1")}>{ids.length}</span>
        )}
      </Link>
      {toast && (
        <Link
          href="/ticket"
          onClick={() => setToast(false)}
          className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-2xl border border-peach/40 bg-night/95 px-4 py-3 text-sm shadow-xl backdrop-blur"
        >
          <LifeBuoy className="size-5 text-peach" />
          Hai un ticket da leggere
        </Link>
      )}
    </>
  );
}
