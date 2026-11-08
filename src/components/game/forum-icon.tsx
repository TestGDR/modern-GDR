"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Megaphone, MessagesSquare, X } from "lucide-react";
import { FORUM_READ_EVENT } from "@/components/game/forum-client";
import { sidebarIconClass } from "@/components/game/sidebar-styles";
import { createClient } from "@/lib/supabase/client";
import { refreshCounters, useCounters, type ForumHighlight } from "@/lib/counters";
import { cn } from "@/lib/utils";

// Icona "Forum" della barra laterale (dal Westeros: useForumUnread e
// useForumHighlights): discussioni con messaggi nuovi e post segnalati a tutti.

export function ForumIcon() {
  const supabase = useMemo(() => createClient(), []);
  // contatori condivisi (una sola chiamata per tutte le icone: src/lib/counters.ts)
  const { forum_unread: unread, forum_highlights } = useCounters();
  // segnalati chiusi qui (si toglie subito, senza aspettare la rilettura)
  const [dismissed, setDismissed] = useState<number[]>([]);
  const highlights = forum_highlights.filter((h) => !dismissed.includes(h.post_id));

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

  async function seen(h: ForumHighlight) {
    setDismissed((prev) => [...prev, h.post_id]);
    const { data } = await supabase.auth.getSession();
    const me = data.session?.user.id;
    if (me) await supabase.from("forum_highlight_seen").insert({ user_id: me, post_id: h.post_id });
  }

  const first = highlights[0];
  return (
    <>
      <Link href="/forum" className={cn(sidebarIconClass, "relative", unread > 0 && "blink-call")} aria-label={unread ? `Forum: ${unread} discussioni nuove` : "Forum"}>
        <MessagesSquare />
        <span className="sr-only">Forum</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-flamingo px-1 text-[0.6rem] leading-4 font-bold text-white">{unread}</span>
        )}
      </Link>
      {/* al centro dello schermo, sopra a tutto (anche alle finestre): fuori dalla barra laterale, che lo taglierebbe */}
      {first &&
        createPortal(
          <div className="fixed inset-0 z-[2147482000] grid place-items-center bg-night/60 p-4 backdrop-blur-sm">
        <div role="alertdialog" aria-label="Post segnalato" className="w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-peach/40 bg-night/95 p-4 shadow-2xl">
          <div className="flex items-start gap-2">
            <Megaphone className="mt-0.5 size-5 shrink-0 text-peach" />
            <div className="min-w-0 flex-1">
              <p className="text-xs tracking-wider text-peach uppercase">Post segnalato</p>
              <p className="truncate font-medium">{first.title}</p>
              {first.highlighted_by && <p className="text-xs text-muted-foreground">da {first.highlighted_by}</p>}
            </div>
            <button type="button" onClick={() => seen(first)} className="rounded-full p-1 text-muted-foreground hover:text-foreground" aria-label="Chiudi">
              <X className="size-4" />
            </button>
          </div>
          <Link
            href={`/forum/${first.board_slug}/${first.thread_id}#post-${first.post_id}`}
            onClick={() => seen(first)}
            className="mt-3 block rounded-full bg-flamingo px-4 py-1.5 text-center text-sm font-medium text-white"
          >
            Leggi
          </Link>
        </div>
          </div>,
          document.body,
        )}
    </>
  );
}
