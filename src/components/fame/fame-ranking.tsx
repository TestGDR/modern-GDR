"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { FameIcon } from "@/components/fame/fame-icon";
import { firstName, initials } from "@/lib/format";
import type { FameLevelInfo } from "@/lib/fame";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Row = { id: string; name: string; avatar_url: string | null; fame: number; infamy: number | null; level: FameLevelInfo | null };

/** Utility → Fama: i personaggi più famosi (quanti, lo decide fama_classifica_n) */
export function FameRanking() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.rpc("fame_ranking").then(({ data }) => alive && setRows((data ?? []) as Row[]));
    return () => {
      alive = false;
    };
  }, [supabase]);

  if (!rows) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">La classifica è vuota o non è attiva.</p>;
  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <li key={r.id}>
          <Link href={`/scheda/${r.id}`} className="glass flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/10">
            <span className={cn("w-7 text-center font-heading text-2xl", i === 0 ? "text-sand" : i < 3 ? "text-peach" : "text-muted-foreground")}>{i + 1}</span>
            {r.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.avatar_url} alt="" className="size-10 shrink-0 rounded-full object-cover ring-2 ring-white/10" />
            ) : (
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet via-orchid to-peach font-heading text-white">{initials(r.name)}</span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{firstName(r.name)}</span>
              {r.level && (
                <span className="flex items-center gap-1 text-xs" style={{ color: r.level.color }}>
                  <FameIcon icon={r.level.icon} label={r.level.name} className="size-4" /> {r.level.name}
                </span>
              )}
            </span>
            <span className="text-right text-sm">
              <span className="block font-semibold text-peach">{r.fame}</span>
              <span className="text-[0.65rem] text-muted-foreground">fama</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
