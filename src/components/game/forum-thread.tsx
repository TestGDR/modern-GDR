"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, LockOpen, Megaphone, Pencil, Pin, PinOff, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { deletePost, deleteThread, editPost, highlightThread, moveThread, renameThread, setThreadFlag } from "@/lib/actions/forum";
import { cn } from "@/lib/utils";

type ModResult = { ok: true; slug?: string } | { ok: false; error: string };

const barBtn = "h-8 rounded-lg border border-white/15 bg-white/5 px-3 text-xs text-foreground hover:bg-white/10 disabled:opacity-50";

/** Barra di moderazione della discussione (chi ha forum.moderare / forum.segnalare) */
export function ThreadModeration({
  thread,
  boardSlug,
  boards,
  canModerate,
  canHighlight,
  firstPost,
}: {
  thread: { id: string; title: string; board_id: string; is_pinned: boolean; is_important: boolean; is_locked: boolean };
  boardSlug: string;
  /** Sezioni in cui si può spostare (nome della categoria · nome della sezione) */
  boards: { id: string; label: string }[];
  canModerate: boolean;
  canHighlight: boolean;
  firstPost: { id: number; highlighted: boolean } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(thread.title);

  function run(fn: () => Promise<ModResult>, after?: (r: ModResult & { ok: true }) => void) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error);
      after?.(r);
    });
  }

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl border border-dashed border-peach/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Moderazione:</span>
        {canModerate && (
          <>
            <button type="button" disabled={pending} className={barBtn} onClick={() => run(() => setThreadFlag(thread.id, "is_pinned", !thread.is_pinned))}>
              {thread.is_pinned ? <PinOff className="mr-1 inline size-3.5" /> : <Pin className="mr-1 inline size-3.5" />}
              {thread.is_pinned ? "Togli da in alto" : "Fissa in alto"}
            </button>
            <button type="button" disabled={pending} className={barBtn} onClick={() => run(() => setThreadFlag(thread.id, "is_important", !thread.is_important))}>
              <Star className="mr-1 inline size-3.5" />
              {thread.is_important ? "Non importante" : "Rendi importante"}
            </button>
            <button type="button" disabled={pending} className={barBtn} onClick={() => run(() => setThreadFlag(thread.id, "is_locked", !thread.is_locked))}>
              {thread.is_locked ? <LockOpen className="mr-1 inline size-3.5" /> : <Lock className="mr-1 inline size-3.5" />}
              {thread.is_locked ? "Riapri" : "Chiudi"}
            </button>
            <button type="button" disabled={pending} className={barBtn} onClick={() => setRenaming((v) => !v)}>
              <Pencil className="mr-1 inline size-3.5" /> Rinomina
            </button>
            <select
              aria-label="Sposta in un'altra sezione"
              disabled={pending}
              value=""
              onChange={(e) => {
                const target = boards.find((b) => b.id === e.target.value);
                if (!target || !window.confirm(`Spostare la discussione in «${target.label}»?`)) return;
                run(
                  () => moveThread(thread.id, target.id),
                  (r) => router.replace(`/forum/${r.slug}/${thread.id}`),
                );
              }}
              className="h-8 max-w-56 rounded-lg border border-white/15 bg-night px-2 text-xs"
            >
              <option value="">Sposta in…</option>
              {boards
                .filter((b) => b.id !== thread.board_id)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
            </select>
          </>
        )}
        {canHighlight && firstPost && (
          <button type="button" disabled={pending} className={barBtn} onClick={() => run(() => highlightThread(firstPost.id, !firstPost.highlighted))}>
            <Megaphone className="mr-1 inline size-3.5" />
            {firstPost.highlighted ? "Togli la segnalazione" : "Segnala a tutti"}
          </button>
        )}
        {canModerate && (
          <button
            type="button"
            disabled={pending}
            className="ml-auto h-8 rounded-lg px-2 text-xs text-destructive hover:bg-destructive/10"
            onClick={() => {
              if (!window.confirm(`Eliminare la discussione «${thread.title}» con tutti i suoi messaggi? Non si torna indietro.`)) return;
              run(
                () => deleteThread(thread.id),
                () => router.replace(`/forum/${boardSlug}`),
              );
            }}
          >
            <Trash2 className="mr-1 inline size-3.5" /> Elimina discussione
          </button>
        )}
      </div>
      {renaming && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => renameThread(thread.id, title),
              () => setRenaming(false),
            );
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            aria-label="Nuovo titolo"
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-night/40 px-3 text-sm outline-none focus-visible:border-ring"
          />
          <Button type="submit" size="sm" disabled={pending} className="rounded-full">
            <Check /> Salva
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(false)} aria-label="Annulla">
            <X />
          </Button>
        </form>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Testo di un messaggio con Modifica / Elimina (autore o chi modera) */
export function PostBody({ postId, body, canEdit }: { postId: number; body: string; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (editing) {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await editPost(postId, value);
            if (!r.ok) return setError(r.error);
            setEditing(false);
          });
        }}
      >
        <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={8} maxLength={20000} className="bg-night/40" aria-label="Testo del messaggio" />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Annulla
          </Button>
          <Button type="submit" size="sm" disabled={pending} className="rounded-full">
            <Check /> {pending ? "Salvataggio…" : "Salva"}
          </Button>
        </div>
      </form>
    );
  }
  return (
    <>
      <p className="text-sm leading-relaxed break-words whitespace-pre-line">{body}</p>
      {canEdit && (
        <div className="mt-3 flex justify-end gap-3 text-xs">
          {error && <span className="mr-auto text-destructive">{error}</span>}
          <button type="button" onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground">
            Modifica
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Eliminare questo messaggio?")) return;
              setError(null);
              start(async () => {
                const r = await deletePost(postId);
                if (!r.ok) setError(r.error);
              });
            }}
            className={cn("text-destructive hover:underline", pending && "opacity-50")}
          >
            Elimina
          </button>
        </div>
      )}
    </>
  );
}
