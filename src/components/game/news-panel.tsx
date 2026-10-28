"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Newspaper, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { FloatingWindow } from "@/components/floating-window";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { playEvent } from "@/lib/notify-sound";
import { createClient } from "@/lib/supabase/client";
import { useResync } from "@/lib/use-resync";
import type { News } from "@/lib/types";
import { cn } from "@/lib/utils";

// Notizie dello staff, solo OFF (dal Westeros: NewsPanel + useNewsUnseen).
// Una notizia è "nuova" se pubblicata dopo l'ultima apertura (news_seen).

const field = "w-full rounded-lg border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring";

/** Quante notizie nuove ci sono, in tempo reale */
function useNewsUnseen() {
  const supabase = useMemo(() => createClient(), []);
  const [unseen, setUnseen] = useState(0);

  const refresh = useCallback(async () => {
    const { data: seen } = await supabase.from("news_seen").select("seen_at").maybeSingle<{ seen_at: string }>();
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
    await supabase.from("news_seen").upsert({ user_id: data.user.id, seen_at: new Date().toISOString() });
    setUnseen(0);
  }, [supabase]);

  return { unseen, markSeen };
}

/** Pulsante "Notizie" della barra laterale */
export function NewsButton({ canPublish }: { canPublish: boolean }) {
  const { unseen, markSeen } = useNewsUnseen();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
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
      {open && (
        <FloatingWindow label="Notizie" onClose={() => setOpen(false)} initialWidth={620} header={<h2 className="pb-4 font-heading text-3xl tracking-wide">Notizie dallo staff</h2>}>
          <NewsList canPublish={canPublish} />
        </FloatingWindow>
      )}
    </>
  );
}

function NewsList({ canPublish }: { canPublish: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [news, setNews] = useState<News[] | null>(null);
  const [editing, setEditing] = useState<News | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("news").select("*").order("created_at", { ascending: false }).limit(100);
    setNews((data ?? []) as News[]);
  }, [supabase]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function save(title: string, body: string, id?: string) {
    setError(null);
    const { error: e } = id
      ? await supabase.from("news").update({ title, body }).eq("id", id)
      : await supabase.from("news").insert({ title, body });
    if (e) return setError(e.code === "42501" ? "Non hai il permesso di pubblicare notizie." : "Salvataggio non riuscito.");
    setEditing(null);
    load();
  }

  async function remove(n: News) {
    if (!window.confirm(`Eliminare la notizia «${n.title}»?`)) return;
    const { error: e } = await supabase.from("news").delete().eq("id", n.id);
    if (e) return setError("Eliminazione non riuscita.");
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {canPublish &&
        (editing === "new" ? (
          <NewsForm onSave={(t, b) => save(t, b)} onCancel={() => setEditing(null)} />
        ) : (
          <Button type="button" onClick={() => setEditing("new")} className="w-fit rounded-full">
            <Plus /> Nuova notizia
          </Button>
        ))}
      {news === null && <p className="text-sm text-muted-foreground">Caricamento…</p>}
      {news?.length === 0 && <p className="text-sm text-muted-foreground">Nessuna notizia per ora.</p>}
      <ul className="flex flex-col gap-3">
        {news?.map((n) =>
          editing !== "new" && editing?.id === n.id ? (
            <li key={n.id}>
              <NewsForm news={n} onSave={(t, b) => save(t, b, n.id)} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={n.id} className="rounded-2xl bg-white/5 p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-heading text-xl tracking-wide text-peach">{n.title}</h3>
                  <p className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
                </div>
                {canPublish && (
                  <span className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setEditing(n)} className="rounded p-1.5 text-muted-foreground hover:text-foreground" aria-label="Modifica">
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" onClick={() => remove(n)} className="rounded p-1.5 text-muted-foreground hover:text-destructive" aria-label="Elimina">
                      <Trash2 className="size-4" />
                    </button>
                  </span>
                )}
              </div>
              {n.body && <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{n.body}</p>}
            </li>
          ),
        )}
      </ul>
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
      className="flex flex-col gap-2 rounded-2xl border border-peach/30 bg-night/40 p-3"
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} required placeholder="Titolo" className={cn(field, "h-10")} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000} rows={6} placeholder="Testo della notizia" className={field} />
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
