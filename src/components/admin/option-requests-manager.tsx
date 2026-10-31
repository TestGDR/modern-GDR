"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { RequestItems, type OptionRequest } from "@/components/game/option-request";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Richieste di voci nuove dei personaggi già approvati (permesso personaggi.approvare)
export function OptionRequestsManager() {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<"in_attesa" | "esaminate">("in_attesa");
  const [requests, setRequests] = useState<OptionRequest[] | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("option_requests_list", { p_character: null, p_status: null });
    if (e) setError(e.message);
    setRequests((data ?? []) as OptionRequest[]);
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  async function review(id: number, approve: boolean) {
    setError(null);
    const { error: e } = await supabase.rpc("option_request_review", { p_request: id, p_approve: approve, p_note: notes[id] ?? "" });
    if (e) setError(e.message);
    load();
  }

  const shown = (requests ?? []).filter((r) => (tab === "in_attesa" ? r.status === "in_attesa" : r.status !== "in_attesa"));
  return (
    <div className="flex flex-col gap-3">
      <nav className="flex gap-1 self-start rounded-full bg-white/5 p-1">
        {(["in_attesa", "esaminate"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn("rounded-full px-3 py-1.5 text-xs", tab === t ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:bg-white/5")}
          >
            {t === "in_attesa" ? `Da approvare (${(requests ?? []).filter((r) => r.status === "in_attesa").length})` : "Già esaminate"}
          </button>
        ))}
      </nav>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {requests && shown.length === 0 && <p className="text-sm text-muted-foreground">Nessuna richiesta.</p>}
      <ul className="flex flex-col gap-3">
        {shown.map((r) => (
          <li key={r.id} className="glass flex flex-col gap-2 rounded-2xl p-3">
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/scheda/${r.character_id}`} className="font-medium text-peach hover:underline">
                {r.character_name}
              </Link>
              <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
            </p>
            <RequestItems request={r} />
            <p className="text-xs text-muted-foreground">
              Costo {r.px_cost} PX · al personaggio ne restano {r.px}
              {r.px_cost > r.px && <span className="text-destructive"> (non bastano)</span>}
            </p>
            {r.note && <p className="rounded-lg bg-white/5 px-2 py-1 text-sm">“{r.note}”</p>}
            {r.status === "in_attesa" ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={notes[r.id] ?? ""}
                  maxLength={500}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  placeholder="Nota per il giocatore (facoltativa)"
                  className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-night/40 px-2 text-sm outline-none"
                />
                <Button type="button" size="sm" className="rounded-full" onClick={() => review(r.id, true)}>
                  <Check /> Approva
                </Button>
                <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={() => review(r.id, false)}>
                  <X /> Rifiuta
                </Button>
              </div>
            ) : (
              <p className={cn("text-xs", r.status === "approvata" ? "text-mint" : "text-destructive")}>
                {r.status === "approvata" ? "Approvata" : "Rifiutata"}
                {r.reviewed_at && ` il ${formatDateTime(r.reviewed_at)}`}
                {r.review_note && ` · ${r.review_note}`}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
