"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCheck, ChevronDown, Lock, MessagesSquare, Settings2 } from "lucide-react";
import { markForumRead } from "@/lib/actions/forum";
import { cn } from "@/lib/utils";

type NavSection = {
  id: string;
  title: string;
  boards: { id: string; slug: string; name: string; locked: boolean }[];
};

// Categorie chiuse, ricordate finché la pagina resta aperta
let closedMemory = new Set<string>();

/** Colonna di sinistra del forum: ultime discussioni, leggi tutto, categorie richiudibili */
export function ForumSidebar({
  sections,
  unreadByBoard,
  unreadTotal,
  canManage,
}: {
  sections: NavSection[];
  unreadByBoard: Record<string, number>;
  unreadTotal: number;
  canManage: boolean;
}) {
  const pathname = usePathname();
  // su schermi stretti la colonna è chiusa finché non si apre
  const [open, setOpen] = useState(false);
  // le categorie chiuse restano chiuse anche cambiando sezione
  const [closed, setClosed] = useState<Set<string>>(() => new Set(closedMemory));
  const activeSlug = pathname.split("/")[2] ?? null;

  function toggle(id: string) {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      closedMemory = next;
      return next;
    });
  }

  const btn = "flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-xs font-semibold tracking-[0.18em] uppercase transition-colors";
  return (
    <nav aria-label="Sezioni del forum" className="flex flex-col gap-2 @3xl:sticky @3xl:top-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(btn, "border-white/15 text-muted-foreground hover:bg-white/5 @3xl:hidden")}
      >
        Categorie e sezioni <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      <div className={cn("flex-col gap-2", open ? "flex" : "hidden", "@3xl:flex")}>
        <Link
          href="/forum"
          onClick={() => setOpen(false)}
          className={cn(btn, pathname === "/forum" ? "border-peach/70 bg-peach/10 text-peach" : "border-white/15 text-muted-foreground hover:bg-white/5 hover:text-foreground")}
        >
          <MessagesSquare className="size-4" /> Ultime discussioni
        </Link>
        <form action={markForumRead}>
          <button type="submit" disabled={unreadTotal === 0} className={cn(btn, "border-white/15 text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-50")}>
            <CheckCheck className="size-4" /> Leggi tutto
            {unreadTotal > 0 && <span className="rounded-full bg-flamingo/20 px-1.5 py-0.5 text-[0.65rem] tracking-normal text-flamingo">{unreadTotal}</span>}
          </button>
        </form>

        {sections.map((s) => {
          const isClosed = closed.has(s.id);
          return (
            <div key={s.id} className="flex flex-col">
              <button
                type="button"
                onClick={() => toggle(s.id)}
                aria-expanded={!isClosed}
                className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-left font-heading text-base tracking-[0.12em] text-peach uppercase hover:bg-white/10"
              >
                <span className="min-w-0 flex-1">{s.title}</span>
                <ChevronDown className={cn("size-4 shrink-0 transition-transform", isClosed && "-rotate-90")} />
              </button>
              {!isClosed && (
                <ul className="flex flex-col py-1">
                  {s.boards.map((b) => {
                    const n = unreadByBoard[b.id] ?? 0;
                    return (
                      <li key={b.id}>
                        <Link
                          href={`/forum/${b.slug}`}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-white/5",
                            activeSlug === b.slug ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <span className="truncate">{b.name}</span>
                          {b.locked && <Lock className="size-3 shrink-0 text-lavender" aria-label="Riservata" />}
                          {n > 0 && <span className="ml-auto rounded-full bg-flamingo/20 px-1.5 text-[0.65rem] text-flamingo">{n}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
        {sections.length === 0 && <p className="px-1 text-xs text-muted-foreground">Nessuna sezione disponibile.</p>}

        {canManage && (
          <Link
            href="/gestione/forum"
            className="flex h-9 items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 text-[0.7rem] tracking-[0.15em] text-muted-foreground uppercase hover:bg-white/5 hover:text-foreground"
          >
            <Settings2 className="size-3.5" /> Categorie e sezioni
          </Link>
        )}
      </div>
    </nav>
  );
}
