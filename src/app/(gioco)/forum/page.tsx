import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCheck, ChevronRight, Lock, MessagesSquare } from "lucide-react";
import { ForumReadSignal } from "@/components/game/forum-client";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { Button } from "@/components/ui/button";
import { markForumRead } from "@/lib/actions/forum";
import { requirePlayer } from "@/lib/auth";
import { getBoardStats, getForumSections, getForumUnread } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Forum" };

export default function ForumPage() {
  return (
    <>
      <PageHeader title="Forum" subtitle="Discussioni on game e off game." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePlayer();
  const [sections, stats, unread] = await Promise.all([getForumSections(), getBoardStats(), getForumUnread()]);
  const unreadByBoard = new Map<string, number>();
  for (const u of unread) unreadByBoard.set(u.board_id, (unreadByBoard.get(u.board_id) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-6">
      <ForumReadSignal />
      {unread.length > 0 && (
        <form action={markForumRead} className="flex items-center justify-end gap-3 text-sm">
          <span className="text-muted-foreground">
            {unread.length} {unread.length === 1 ? "discussione con messaggi nuovi" : "discussioni con messaggi nuovi"}
          </span>
          <Button type="submit" variant="outline" size="sm" className="rounded-full">
            <CheckCheck /> Segna tutto come letto
          </Button>
        </form>
      )}
      {sections.map((section) => (
        <section key={section.id} className="glass overflow-hidden rounded-2xl">
          <h2 className="border-b border-border bg-white/5 px-5 py-3 font-heading text-2xl tracking-wide text-peach">{section.title}</h2>
          <ul className="divide-y divide-border">
            {section.forum_boards.map((board) => {
              const s = stats.get(board.id);
              const n = unreadByBoard.get(board.id) ?? 0;
              return (
                <li key={board.id}>
                  <Link href={`/forum/${board.slug}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/5">
                    <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet to-orchid">
                      {board.staff_only ? <Lock className="size-5 text-white" /> : <MessagesSquare className="size-5 text-white" />}
                      {n > 0 && <span className="absolute -top-1 -right-1 size-3 rounded-full bg-flamingo ring-2 ring-night" aria-label="Messaggi nuovi" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {board.name}
                        {n > 0 && <span className="ml-2 rounded-full bg-flamingo/20 px-2 py-0.5 text-xs text-flamingo">{n} nuove</span>}
                      </p>
                      <p className="text-sm text-muted-foreground">{board.description}</p>
                    </div>
                    <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                      <p>
                        <span className="font-semibold text-foreground">{s?.threads ?? 0}</span> discussioni
                      </p>
                      {s && <p>ultima: {formatDateTime(s.lastActivity)}</p>}
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
