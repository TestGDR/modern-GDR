import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Lock, Pin, Star } from "lucide-react";
import { ForumReadSignal } from "@/components/game/forum-client";
import { LoadingBlocks } from "@/components/game/loading";
import { requirePlayer } from "@/lib/auth";
import { getForumUnread, getLatestThreads } from "@/lib/data";
import { firstName, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Forum" };

export default function ForumPage() {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <Latest />
    </Suspense>
  );
}

/** Al centro: le ultime 5 discussioni (per attività) */
async function Latest() {
  await requirePlayer();
  const [threads, unread] = await Promise.all([getLatestThreads(5), getForumUnread()]);
  const unreadIds = new Set(unread.map((u) => u.thread_id));
  return (
    <>
      <ForumReadSignal />
      <header className="mb-4">
        <h1 className="font-heading text-4xl tracking-wide text-sunset">Forum ON e OFF</h1>
        <p className="text-sm text-muted-foreground">Le ultime discussioni della città.</p>
      </header>
      {threads.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ancora nessuna discussione.</p>
      ) : (
        <ul className="divide-y divide-white/10 border-y border-white/10">
          {threads.map((t) => {
            const replies = Math.max(0, (t.forum_posts[0]?.count ?? 1) - 1);
            return (
              <li key={t.id}>
                <Link href={`/forum/${t.board?.slug}/${t.id}`} className="flex items-start gap-3 px-2 py-3 transition-colors hover:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <p className={cn("flex items-center gap-2 font-heading text-xl tracking-wide", t.is_important ? "text-peach" : "text-foreground")}>
                      {unreadIds.has(t.id) && <span className="size-2.5 shrink-0 rounded-full bg-flamingo" aria-label="Messaggi nuovi" />}
                      {t.is_pinned && <Pin className="size-4 shrink-0 text-peach" aria-label="Fissata in alto" />}
                      {t.is_important && <Star className="size-4 shrink-0 fill-peach text-peach" aria-label="Importante" />}
                      {t.is_locked && <Lock className="size-4 shrink-0 text-muted-foreground" aria-label="Chiusa" />}
                      <span className="truncate">{t.title}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      in {t.board?.name ?? "—"} · di {firstName(t.character?.name ?? t.author?.username) || "utente"} · {replies} {replies === 1 ? "risposta" : "risposte"}
                    </p>
                  </div>
                  <span className="shrink-0 pt-1 text-xs text-muted-foreground">{formatDateTime(t.updated_at)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
