"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Megaphone, MessagesSquare, X } from "lucide-react";
import { FORUM_READ_EVENT } from "@/components/game/forum-client";
import { sidebarIconClass } from "@/components/game/sidebar-styles";
import { createClient } from "@/lib/supabase/client";
import { useResync } from "@/lib/use-resync";
import { cn } from "@/lib/utils";

// Icona "Forum" della barra laterale (dal Westeros: useForumUnread e
// useForumHighlights): discussioni con messaggi nuovi e post segnalati a tutti.

type Highlight = { post_id: number; thread_id: string; board_slug: string; title: string; highlighted_by: string | null };

export function ForumIcon() {
  const supabase = useMemo(() => createClient(), []);
  const [unread, setUnread] = useState(0);
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  const refresh = useCallback(async () => {
    const [{ data: u }, { data: h }] = await Promise.all([supabase.rpc("forum_unread"), supabase.rpc("forum_pending_highlights")]);
    setUnread(((u ?? []) as unknown[]).length);
    setHighlights((h ?? []) as Highlight[]);
  }, [supabase]);

  useResync(refresh);
  useEffect(() => {
    // prima visita: da qui le discussioni nuove contano come non lette
    const first = setTimeout(() => supabase.rpc("forum_touch").then(refresh), 0);
    const ch = supabase
      .channel("forum:icona")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "forum_posts" }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "forum_posts" }, () => refresh())
      .subscribe();
    window.addEventListener(FORUM_READ_EVENT, refresh);
    return () => {
      clearTimeout(first);
      supabase.removeChannel(ch);
      window.removeEventListener(FORUM_READ_EVENT, refresh);
    };
  }, [supabase, refresh]);

  async function seen(h: Highlight) {
    const { data } = await supabase.auth.getUser();
    if (data.user) await supabase.from("forum_highlight_seen").insert({ user_id: data.user.id, post_id: h.post_id });
    setHighlights((prev) => prev.filter((x) => x.post_id !== h.post_id));
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
      {first && (
        <div className="fixed bottom-4 left-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-peach/40 bg-night/95 p-4 shadow-xl backdrop-blur">
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
      )}
    </>
  );
}
