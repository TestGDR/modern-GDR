"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Newspaper, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { FloatingWindow } from "@/components/floating-window";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/format";
import { playEvent } from "@/lib/notify-sound";
import { createClient } from "@/lib/supabase/client";
import { useResync } from "@/lib/use-resync";
import type { News } from "@/lib/types";
import { cn } from "@/lib/utils";

// Notizie dello staff, solo OFF (dal Westeros: NewsPanel + useNewsUnseen).
// Una notizia è "nuova" se pubblicata dopo l'ultima apertura (news_seen).
// Finestra: a sinistra l'archivio (scorre), al centro la notizia scelta (all'inizio l'ultima).

const field = "w-full rounded-lg border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring";

/** Quante notizie nuove ci sono, in tempo reale */
function useNewsUnseen() {
  const supabase = useMemo(() => createClient(), []);
  const [unseen, setUnseen] = useState(0);
  // ultima apertura delle notizie (null: mai aperte)
  const [seenAt, setSeenAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data: seen } = await supabase.from("news_seen").select("seen_at").maybeSingle<{ seen_at: string }>();
    setSeenAt(seen?.seen_at ?? null);
    let q = supabase.from("news").select("id", { count: "exact", head: true });
    if (seen) q = q.gt("created_at", seen.seen_at);
    const { count } = await q;
    setUnseen(count ?? 0);
  }, [supabase]);

  useResync(refresh);
  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const ch = supabase
      .channel("notizie")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "news" }, () => {
        playEvent("off");
        refresh();
      })
      .subscribe();
    return () => {
      clearTimeout(first);
      supabase.removeChannel(ch);
    };
  }, [supabase, refresh]);

  const markSeen = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const now = new Date().toISOString();
    await supabase.from("news_seen").upsert({ user_id: data.user.id, seen_at: now });
    setUnseen(0);
    setSeenAt(now);
  }, [supabase]);

  return { unseen, seenAt, markSeen };
}

/** Pulsante "Notizie" della barra laterale */
export function NewsButton({ canPublish }: { canPublish: boolean }) {
  const { unseen, seenAt, markSeen } = useNewsUnseen();
  // le notizie dopo questa data, all'apertura, sono segnate come nuove
  const [openSince, setOpenSince] = useState<string | null | undefined>(undefined);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpenSince(seenAt);
          markSeen();
        }}
        className={cn(
          "flex items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
          unseen > 0 ? "border-peach/60 bg-peach/15 text-peach shadow-[0_0_12px_var(--peach)]" : "border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground",
        )}
      >
        <Newspaper className="size-4" />
        Notizie
        {unseen > 0 && <span className="rounded-full bg-peach px-1.5 text-[0.65rem] font-bold text-night">{unseen} nuove</span>}
      </button>
      {openSince !== undefined && (
        <FloatingWindow
          label="Notizie"
          onClose={() => setOpenSince(undefined)}
          initialWidth={980}
          initialHeight={640}
          header={<h2 className="pb-3 font-heading text-3xl tracking-wide text-sunset">Notizie OFF</h2>}
        >
          <NewsBoard canPublish={canPublish} since={openSince} />
        </FloatingWindow>
      )}
    </>
  );
}

function NewsBoard({ canPublish, since }: { canPublish: boolean; since: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [news, setNews] = useState<News[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<News | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("news").select("*").order("created_at", { ascending: false }).limit(200);
    setNews((data ?? []) as News[]);
  }, [supabase]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // la notizia al centro: quella scelta nell'archivio, altrimenti l'ultima
  const shown = news?.find((n) => n.id === selectedId) ?? news?.[0] ?? null;
  const isNew = (n: News) => since === null || n.created_at > since;

  async function save(title: string, body: string, id?: string) {
    setError(null);
    const res = id
      ? await supabase.from("news").update({ title, body }).eq("id", id).select("id").single<{ id: string }>()
      : await supabase.from("news").insert({ title, body }).select("id").single<{ id: string }>();
    if (res.error) return setError(res.error.code === "42501" ? "Non hai il permesso di pubblicare notizie." : "Salvataggio non riuscito.");
    setEditing(null);
    setSelectedId(res.data.id);
    load();
  }

  async function remove(n: News) {
    if (!window.confirm(`Eliminare la notizia «${n.title}»?`)) return;
    const { error: e } = await supabase.from("news").delete().eq("id", n.id);
    if (e) return setError("Eliminazione non riuscita.");
    setSelectedId(null);
    load();
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 md:flex-row">
      {/* Archivio: tutte le notizie, dalla più recente */}
      <aside className="glass flex max-h-56 shrink-0 flex-col overflow-hidden rounded-2xl md:max-h-none md:w-72">
        <h3 className="border-b border-white/10 px-4 py-3 text-center font-heading text-xl tracking-[0.15em] text-peach">Archivio</h3>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {news === null ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">Caricamento…</p>
          ) : news.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">Nessuna notizia.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {news.map((n) => {
                const active = shown?.id === n.id && editing === null;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(n.id);
                        setEditing(null);
                      }}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full flex-col gap-0.5 rounded-xl px-3 py-2 text-left transition-colors",
                        active ? "bg-gradient-to-r from-flamingo/35 to-flamingo/5 shadow-[inset_3px_0_0_var(--flamingo)]" : "hover:bg-white/5",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", active ? "text-white" : "text-foreground/85")}>{n.title}</span>
                        {isNew(n) && <span className="shrink-0 rounded-full bg-peach px-1.5 text-[0.6rem] font-bold text-night uppercase">Nuova</span>}
                      </span>
                      <span className="text-[0.7rem] text-muted-foreground">{formatDate(n.created_at)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Pagina centrale: la notizia */}
      <article className="relative flex min-h-[18rem] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-violet/40 via-dusk/50 to-flamingo/15">
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-5 py-3 sm:px-8">
          <span className="hidden text-xs tracking-[0.25em] text-lavender uppercase sm:inline">Notizie OFF</span>
          {canPublish && editing === null && (
            <span className="ml-auto flex gap-1">
              {shown && (
                <>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(shown)} className="rounded-full" aria-label="Modifica questa notizia">
                    <Pencil />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => remove(shown)} className="rounded-full hover:text-destructive" aria-label="Elimina questa notizia">
                    <Trash2 />
                  </Button>
                </>
              )}
              <Button type="button" size="sm" onClick={() => setEditing("new")} className="rounded-full">
                <Plus /> Nuova notizia
              </Button>
            </span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-10 sm:py-8">
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          {editing !== null ? (
            <NewsForm key={editing === "new" ? "new" : editing.id} news={editing === "new" ? undefined : editing} onSave={(t, b) => save(t, b, editing === "new" ? undefined : editing.id)} onCancel={() => setEditing(null)} />
          ) : news === null ? (
            <p className="text-center text-sm text-muted-foreground">Caricamento…</p>
          ) : !shown ? (
            <p className="py-10 text-center text-muted-foreground italic">Nessuna notizia dallo staff, per ora.</p>
          ) : (
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              <header className="flex flex-col items-center gap-1 text-center">
                <h3 className="font-heading text-4xl leading-tight tracking-wide text-sunset">{shown.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(shown.created_at)}
                  {shown.updated_at > shown.created_at && " · modificata"}
                </p>
              </header>
              <div className="mx-auto h-px w-24 bg-gradient-to-r from-transparent via-peach/70 to-transparent" />
              {shown.body && <p className="leading-relaxed whitespace-pre-line text-foreground/90">{shown.body}</p>}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function NewsForm({ news, onSave, onCancel }: { news?: News; onSave: (title: string, body: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(news?.title ?? "");
  const [body, setBody] = useState(news?.body ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(title.trim(), body.trim());
      }}
      className="mx-auto flex max-w-2xl flex-col gap-2"
    >
      <p className="font-heading text-xl tracking-wide text-peach">{news ? "Modifica la notizia" : "Nuova notizia"}</p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} required placeholder="Titolo" className={cn(field, "h-10")} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000} rows={12} placeholder="Testo della notizia" className={field} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} className="rounded-full">
          <X /> Annulla
        </Button>
        <Button type="submit" disabled={!title.trim()} className="rounded-full">
          <Save /> {news ? "Salva" : "Pubblica"}
        </Button>
      </div>
    </form>
  );
}
