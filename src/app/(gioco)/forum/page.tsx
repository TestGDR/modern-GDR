import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, Lock, MessagesSquare } from "lucide-react";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePlayer } from "@/lib/auth";
import { getBoardStats, getForumSections } from "@/lib/data";
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
  const [sections, stats] = await Promise.all([getForumSections(), getBoardStats()]);

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <section key={section.id} className="glass overflow-hidden rounded-2xl">
          <h2 className="border-b border-border bg-white/5 px-5 py-3 font-heading text-2xl tracking-wide text-peach">
            {section.title}
          </h2>
          <ul className="divide-y divide-border">
            {section.forum_boards.map((board) => {
              const s = stats.get(board.id);
              return (
                <li key={board.id}>
                  <Link href={`/forum/${board.slug}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet to-orchid">
                      {board.staff_only ? <Lock className="size-5 text-white" /> : <MessagesSquare className="size-5 text-white" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{board.name}</p>
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
