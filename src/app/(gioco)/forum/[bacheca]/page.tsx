import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Lock, Pin, Plus, Star } from "lucide-react";
import { NewThreadForm } from "@/components/game/forum-forms";
import { ForumShell } from "@/components/game/forum-shell";
import { LoadingBlocks } from "@/components/game/loading";
import { activeCharacter, can, requirePlayer } from "@/lib/auth";
import { getBoard, getForumUnread, getThreads } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Forum" };

export default function BoardPage({ params }: PageProps<"/forum/[bacheca]">) {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <ForumShell>
        <Content params={params} />
      </ForumShell>
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/forum/[bacheca]">["params"] }) {
  const { bacheca } = await params;
  const player = await requirePlayer();
  const character = activeCharacter(player);
  // le sezioni riservate a chi non può leggerle non arrivano proprio (policy del database)
  const board = await getBoard(bacheca);
  if (!board) notFound();
  const [threads, unread] = await Promise.all([getThreads(board.id), getForumUnread()]);
  const unreadIds = new Set(unread.map((u) => u.thread_id));
  // Nelle sezioni "solo staff" aprono discussioni solo chi pubblica annunci
  const canPost = !board.staff_only || can(player, "annunci.globali");

  return (
    <>
      <header className="mb-4">
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">{board.section.title}</p>
        <h1 className="flex items-center gap-2 font-heading text-4xl tracking-wide text-sunset">
          {board.name}
          {board.access !== "pubblica" && <Lock className="size-5 text-lavender" aria-label="Sezione riservata" />}
        </h1>
        {board.description && <p className="text-sm text-muted-foreground">{board.description}</p>}
      </header>

      {canPost ? (
        <details className="group mb-4 rounded-2xl border border-white/10 bg-white/5">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium text-peach hover:text-flamingo">
            <Plus className="size-4 transition-transform group-open:rotate-45" /> Nuova discussione
          </summary>
          <div className="border-t border-white/10 p-4">
            <NewThreadForm boardId={board.id} boardSlug={board.slug} characterName={character?.name ?? null} onGame={board.section.is_on_game} />
          </div>
        </details>
      ) : (
        <p className="mb-4 text-xs text-muted-foreground">In questa sezione aprono discussioni solo i membri dello staff.</p>
      )}

      {threads.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna discussione: apri tu la prima.</p>
      ) : (
        <ul className="divide-y divide-white/10 border-y border-white/10">
          {threads.map((t) => {
            const replies = Math.max(0, (t.forum_posts[0]?.count ?? 1) - 1);
            return (
              <li key={t.id}>
                <Link href={`/forum/${board.slug}/${t.id}`} className={cn("flex items-start gap-3 px-2 py-3 transition-colors hover:bg-white/5", t.is_important && "bg-peach/5")}>
                  <div className="min-w-0 flex-1">
                    <p className={cn("flex items-center gap-2 font-heading text-xl tracking-wide", t.is_important ? "text-peach" : "text-foreground")}>
                      {unreadIds.has(t.id) && <span className="size-2.5 shrink-0 rounded-full bg-flamingo" aria-label="Messaggi nuovi" />}
                      {t.is_pinned && <Pin className="size-4 shrink-0 text-peach" aria-label="Fissata in alto" />}
                      {t.is_important && <Star className="size-4 shrink-0 fill-peach text-peach" aria-label="Importante" />}
                      {t.is_locked && <Lock className="size-4 shrink-0 text-muted-foreground" aria-label="Chiusa" />}
                      <span className="truncate">{t.title}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      di {t.character?.name ?? t.author?.username ?? "utente"} · aperta il {formatDateTime(t.created_at)} · {replies} {replies === 1 ? "risposta" : "risposte"}
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
