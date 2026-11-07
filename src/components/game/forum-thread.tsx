"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Check, Lock, LockOpen, Megaphone, Pencil, Pin, PinOff, Send, Share2, Star, Trash2, X } from "lucide-react";
import { SafeHtml, plainToHtml } from "@/components/guide/safe-html";
import { Button } from "@/components/ui/button";
import { deletePost, deleteThread, editPost, highlightThread, moveThread, renameThread, setThreadFlag } from "@/lib/actions/forum";
import { firstName } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// l'editor si carica solo nel browser, quando serve
const RichEditor = dynamic(() => import("@/components/guide/rich-editor").then((m) => m.RichEditor), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-white/5" />,
});

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
export function PostBody({
  postId,
  body,
  canEdit,
  share,
}: {
  postId: number;
  body: string;
  canEdit: boolean;
  /** titolo della discussione e indirizzo del post, per condividerlo nei messaggi OFF */
  share?: { title: string; href: string };
}) {
  const [editing, setEditing] = useState(false);
  // i messaggi vecchi (testo semplice) diventano paragrafi per l'editor
  const [value, setValue] = useState(() => plainToHtml(body));
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
        <RichEditor value={value} onChange={setValue} minHeight="min-h-48" />
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
      <SafeHtml html={body} className="text-sm leading-relaxed" />
      {(canEdit || share) && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-3 text-xs">
          {error && <span className="mr-auto text-destructive">{error}</span>}
          {share && <SharePost title={share.title} href={share.href} />}
          {canEdit && (
            <>
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
            </>
          )}
        </div>
      )}
    </>
  );
}

/** Condividi un post in un messaggio OFF: si scrive il nome del personaggio, arriva il link al post */
function SharePost({ title, href }: { title: string; href: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => (setOpen(true), setMsg(null))} className="mr-auto flex items-center gap-1 text-muted-foreground hover:text-foreground">
        <Share2 className="size-3.5" /> Condividi
      </button>
    );
  }
  return (
    <form
      className="flex w-full flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const supabase = createClient();
          const who = name.trim();
          if (who.length < 2) return setMsg({ ok: false, text: "Scrivi il nome del personaggio." });
          const { data } = await supabase.rpc("find_player", { p_name: who });
          const row = ((data ?? []) as { user_id: string; name: string }[])[0];
          if (!row) return setMsg({ ok: false, text: `Nessuno si chiama «${who}».` });
          const { data: me } = await supabase.auth.getUser();
          if (me.user?.id === row.user_id) return setMsg({ ok: false, text: "Non puoi mandarlo a te stesso." });
          const body = `📌 Post del forum «${title}»\n${href}${note.trim() ? `\n\n${note.trim()}` : ""}`;
          const { error } = await supabase.from("private_messages").insert({ kind: "off", recipient_id: row.user_id, body });
          if (error) return setMsg({ ok: false, text: "Invio non riuscito." });
          setMsg({ ok: true, text: `Mandato a ${firstName(row.name)} nei messaggi OFF.` });
          setName("");
          setNote("");
        });
      }}
    >
      <div className="flex items-center gap-2">
        <Share2 className="size-3.5 shrink-0 text-peach" />
        <span className="font-medium">Condividi nei messaggi OFF</span>
        <button type="button" onClick={() => setOpen(false)} className="ml-auto rounded-full p-0.5 text-muted-foreground hover:text-foreground" aria-label="Chiudi">
          <X className="size-3.5" />
        </button>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="A chi? (nome del personaggio)"
        className="h-8 rounded-lg border border-white/15 bg-night/40 px-2.5 text-sm"
        aria-label="Nome del personaggio"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        placeholder="Un messaggio (facoltativo)"
        className="h-8 rounded-lg border border-white/15 bg-night/40 px-2.5 text-sm"
        aria-label="Messaggio"
      />
      <div className="flex items-center gap-2">
        {msg && <span className={cn("text-xs", msg.ok ? "text-mint" : "text-destructive")}>{msg.text}</span>}
        <Button type="submit" size="xs" disabled={pending} className="ml-auto rounded-full">
          <Send /> {pending ? "Invio…" : "Manda"}
        </Button>
      </div>
    </form>
  );
}
