import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Pin } from "lucide-react";
import { NewThreadForm } from "@/components/game/forum-forms";
import { EmptyState, LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { can, requirePlayer } from "@/lib/auth";
import { getBoard, getThreads } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Forum" };

export default function BoardPage({ params }: PageProps<"/forum/[bacheca]">) {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/forum/[bacheca]">["params"] }) {
  const { bacheca } = await params;
  const player = await requirePlayer();
  const { character } = player;
  const board = await getBoard(bacheca);
  if (!board) notFound();
  const threads = await getThreads(board.id);
  // Le bacheche riservate (es. Regolamento) sono per chi pubblica annunci
  const canPost = !board.staff_only || can(player, "annunci.pubblicare");

  return (
    <>
      <Link href="/forum" className="mb-3 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {board.section.title}
      </Link>
      <PageHeader title={board.name} subtitle={board.description ?? undefined} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-3">
          {threads.length === 0 && <EmptyState title="Nessuna discussione">Apri tu la prima.</EmptyState>}
          {threads.map((t) => (
            <Link
              key={t.id}
              href={`/forum/${board.slug}/${t.id}`}
              className="glass flex items-center gap-4 rounded-2xl px-5 py-4 transition-colors hover:bg-white/10"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {t.is_pinned && <Pin className="size-4 shrink-0 text-peach" aria-label="In evidenza" />}
                  {t.is_locked && <Lock className="size-4 shrink-0 text-muted-foreground" aria-label="Chiusa" />}
                  <span className="truncate">{t.title}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  di {t.character?.name ?? `@${t.author?.username ?? "utente"}`} · {formatDateTime(t.created_at)}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <p>
                  <span className="font-semibold text-foreground">{t.forum_posts[0]?.count ?? 0}</span> messaggi
                </p>
                <p>{formatDateTime(t.updated_at)}</p>
              </div>
            </Link>
          ))}
        </div>

        <aside className="glass h-fit rounded-2xl p-5">
          <h2 className="mb-3 font-heading text-2xl tracking-wide text-peach">Nuova discussione</h2>
          {canPost ? (
            <NewThreadForm
              boardId={board.id}
              boardSlug={board.slug}
              characterName={character?.name ?? null}
              onGame={board.section.is_on_game}
            />
          ) : (
            <p className="text-sm text-muted-foreground">In questa bacheca scrive solo lo staff.</p>
          )}
        </aside>
      </div>
    </>
  );
}
