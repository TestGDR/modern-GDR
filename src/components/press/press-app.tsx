"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Mic, Newspaper, PenLine, Save, Send, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichEditor } from "@/components/guide/rich-editor";
import { SafeHtml } from "@/components/guide/safe-html";
import { refreshCounters, useCounters, useSeenCounter } from "@/lib/counters";
import { firstName } from "@/lib/format";
import {
  PRESS_COMMENT_SELECT,
  PRESS_FULL_SELECT,
  PRESS_LIST_SELECT,
  PRESS_NAME,
  PRESS_REACTIONS,
  PRESS_SECTIONS,
  PRESS_STATUS_LABEL,
  PRESS_TAGLINE,
  pressDate,
  type PressAuthor,
  type PressComment,
  type PressFull,
  type PressItem,
  type PressKind,
  type PressSection,
} from "@/lib/press";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Campus Wire: articoli e podcast (scritti) del college. Scrive la redazione
// (Club Giornalistico), pubblicano Direttore, Caporedattore e lo staff.

type Me = { id: string; name: string } | null;
type PressInfo = { editor: boolean; writers: { id: string; name: string }[] };
type Draft = { id?: string; pg: string; kind: PressKind; title: string; summary: string; body: string; section: PressSection; cover: string; guests: string };
type View = { name: "list" } | { name: "read"; id: string } | { name: "write"; draft: Draft } | { name: "desk" };

const inputCls = "h-10 w-full min-w-0 rounded-xl border border-white/15 bg-night/50 px-3 text-sm outline-none focus-visible:border-peach/60";
const SECTION_KEYS = Object.keys(PRESS_SECTIONS) as PressSection[];

function errorText(message: string | undefined, fallback: string) {
  // i messaggi delle funzioni del database sono già in italiano
  return message && !/^(new row|permission|duplicate|violates)/i.test(message) ? message : fallback;
}

export function PressApp({ me }: { me: Me }) {
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState<View>({ name: "list" });
  const [info, setInfo] = useState<PressInfo>({ editor: false, writers: [] });
  const [uid, setUid] = useState<string | null>(null);
  const counters = useCounters();
  const { markSeen } = useSeenCounter("press_new", false);

  // aprendo il giornale le uscite nuove si segnano viste (una volta)
  const seen = useRef(false);
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    void markSeen();
  }, [markSeen]);

  useEffect(() => {
    let alive = true;
    supabase.rpc("press_me").then(({ data }) => {
      if (alive && data) setInfo(data as PressInfo);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setUid(data.session?.user.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, [supabase]);

  const canWrite = info.writers.length > 0;
  const newDraft = (): Draft => ({ pg: info.writers[0]?.id ?? "", kind: "articolo", title: "", summary: "", body: "", section: "campus", cover: "", guests: "" });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-3">
        <button type="button" onClick={() => setView({ name: "list" })} className="text-left">
          <p className="font-heading text-4xl tracking-wide text-sunset">{PRESS_NAME}</p>
          <p className="text-xs tracking-widest text-muted-foreground uppercase">{PRESS_TAGLINE}</p>
        </button>
        <div className="flex flex-wrap gap-2">
          {(canWrite || info.editor) && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setView({ name: "desk" })} className={cn("rounded-full border border-white/15", counters.press_review > 0 && "blink-call")}>
              <Newspaper /> Redazione{counters.press_review > 0 ? ` (${counters.press_review})` : ""}
            </Button>
          )}
          {canWrite && (
            <Button type="button" size="sm" onClick={() => setView({ name: "write", draft: newDraft() })} className="rounded-full">
              <PenLine /> Scrivi
            </Button>
          )}
        </div>
      </header>

      {view.name === "list" && <PressList onOpen={(id) => setView({ name: "read", id })} />}
      {view.name === "read" && (
        <PressReader
          id={view.id}
          me={me}
          uid={uid}
          info={info}
          onBack={() => setView({ name: "list" })}
          onEdit={(d) => setView({ name: "write", draft: d })}
          onGone={() => setView({ name: "list" })}
        />
      )}
      {view.name === "write" && (
        <PressWriter
          initial={view.draft}
          info={info}
          onCancel={() => setView(view.draft.id ? { name: "read", id: view.draft.id } : { name: "list" })}
          onSaved={(id, published) => setView(published ? { name: "read", id } : { name: "desk" })}
        />
      )}
      {view.name === "desk" && <PressDesk uid={uid} info={info} onOpen={(id) => setView({ name: "read", id })} />}
    </div>
  );
}

/* ------------------------------ Elenco delle uscite ------------------------------ */

function PressList({ onOpen }: { onOpen: (id: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [kind, setKind] = useState<"tutto" | PressKind>("tutto");
  const [section, setSection] = useState<"" | PressSection>("");
  const [items, setItems] = useState<PressItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    let q = supabase.from("press_items").select(PRESS_LIST_SELECT).eq("status", "pubblicato").order("published_at", { ascending: false }).limit(60);
    if (kind !== "tutto") q = q.eq("kind", kind);
    if (section) q = q.eq("section", section);
    q.overrideTypes<PressItem[], { merge: false }>().then(({ data }) => {
      if (alive) setItems(data ?? []);
    });
    return () => {
      alive = false;
    };
  }, [supabase, kind, section]);

  const [first, ...rest] = items ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["tutto", "Tutto"],
            ["articolo", "Articoli"],
            ["podcast", "Podcast"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn("rounded-full px-4 py-1.5 text-sm", kind === k ? "bg-flamingo/20 text-white shadow-[inset_0_0_0_1px_var(--flamingo)]" : "text-muted-foreground hover:bg-white/5")}
          >
            {label}
          </button>
        ))}
        <select value={section} onChange={(e) => setSection(e.target.value as "" | PressSection)} aria-label="Sezione" className={cn(inputCls, "ml-auto h-9 w-auto")}>
          <option value="">Tutte le sezioni</option>
          {SECTION_KEYS.map((s) => (
            <option key={s} value={s}>
              {PRESS_SECTIONS[s]}
            </option>
          ))}
        </select>
      </div>

      {items === null && <p className="text-sm text-muted-foreground">Caricamento…</p>}
      {items?.length === 0 && (
        <div className="glass rounded-2xl px-6 py-10 text-center">
          <p className="font-heading text-2xl tracking-wide">Nessuna uscita</p>
          <p className="mt-1 text-sm text-muted-foreground">Gli articoli e i podcast della redazione compariranno qui.</p>
        </div>
      )}
      {first && <PressCard item={first} big onOpen={onOpen} />}
      {rest.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {rest.map((it) => (
            <PressCard key={it.id} item={it} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

function KindBadge({ kind }: { kind: PressKind }) {
  return kind === "podcast" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet/30 px-2 py-0.5 text-[0.7rem] font-semibold text-lavender">
      <Mic className="size-3" /> Podcast
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-peach/20 px-2 py-0.5 text-[0.7rem] font-semibold text-peach">
      <Newspaper className="size-3" /> Articolo
    </span>
  );
}

function PressCard({ item, big = false, onOpen }: { item: PressItem; big?: boolean; onOpen: (id: string) => void }) {
  const reactions = item.press_reactions[0]?.count ?? 0;
  const comments = item.press_comments[0]?.count ?? 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className={cn("glass group flex overflow-hidden rounded-2xl text-left transition hover:bg-white/10", big ? "flex-col sm:flex-row" : "flex-col")}
    >
      {item.cover_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.cover_url} alt="" className={cn("w-full object-cover", big ? "h-56 sm:h-auto sm:w-1/2" : "h-36")} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <KindBadge kind={item.kind} />
          <span className="tracking-widest uppercase">{PRESS_SECTIONS[item.section]}</span>
        </div>
        <h3 className={cn("font-heading tracking-wide group-hover:text-peach", big ? "text-3xl" : "text-xl")}>{item.title}</h3>
        {item.summary && <p className={cn("text-sm text-muted-foreground", !big && "line-clamp-3")}>{item.summary}</p>}
        <p className="mt-auto pt-1 text-xs text-muted-foreground">
          di {firstName(item.character?.name)} · {pressDate(item.published_at)}
          {reactions > 0 && ` · ❤️ ${reactions}`}
          {comments > 0 && ` · 💬 ${comments}`}
        </p>
      </div>
    </button>
  );
}

/* ------------------------------ Lettura ------------------------------ */

function Portrait({ person, size = "size-9" }: { person: PressAuthor | null; size?: string }) {
  return person?.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={person.avatar_url} alt="" className={cn(size, "shrink-0 rounded-full object-cover")} />
  ) : (
    <span className={cn(size, "grid shrink-0 place-items-center rounded-full bg-white/10 text-xs")}>{firstName(person?.name).slice(0, 1)}</span>
  );
}

function PressReader({
  id,
  me,
  uid,
  info,
  onBack,
  onEdit,
  onGone,
}: {
  id: string;
  me: Me;
  uid: string | null;
  info: PressInfo;
  onBack: () => void;
  onEdit: (d: Draft) => void;
  onGone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [item, setItem] = useState<PressFull | null | undefined>(undefined);
  const [comments, setComments] = useState<PressComment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data }, { data: c }] = await Promise.all([
      supabase.from("press_items").select(PRESS_FULL_SELECT).eq("id", id).maybeSingle<PressFull>(),
      supabase.from("press_comments").select(PRESS_COMMENT_SELECT).eq("item_id", id).order("created_at").limit(300).overrideTypes<PressComment[], { merge: false }>(),
    ]);
    setItem(data ?? null);
    setComments(c ?? []);
  }, [supabase, id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    void load();
  }, [load]);

  if (item === undefined) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  if (item === null) {
    return (
      <div className="flex flex-col gap-3">
        <BackButton onBack={onBack} />
        <p className="text-sm text-muted-foreground">Questo pezzo non c&apos;è più.</p>
      </div>
    );
  }

  const isAuthor = uid !== null && item.author_id === uid;
  const published = item.status === "pubblicato";
  const mine = me ? item.reactions.find((r) => r.character_id === me.id)?.emoji ?? null : null;
  const counts = PRESS_REACTIONS.map((e) => ({ e, n: item.reactions.filter((r) => r.emoji === e).length }));

  async function react(emoji: string) {
    if (!me || !item) return;
    setError(null);
    const q = supabase.from("press_reactions");
    const { error: e } =
      mine === emoji
        ? await q.delete().eq("item_id", item.id).eq("character_id", me.id)
        : mine
          ? await q.update({ emoji }).eq("item_id", item.id).eq("character_id", me.id)
          : await q.insert({ item_id: item.id, character_id: me.id, emoji });
    if (e) setError("Reazione non salvata.");
    await load();
  }

  async function comment() {
    if (!me || !item || !text.trim()) return;
    setBusy(true);
    const { error: e } = await supabase.from("press_comments").insert({ item_id: item.id, character_id: me.id, body: text.trim().slice(0, 1000) });
    setBusy(false);
    if (e) return setError("Commento non pubblicato.");
    setText("");
    await load();
  }

  async function removeComment(cid: number) {
    if (!window.confirm("Eliminare il commento?")) return;
    await supabase.from("press_comments").delete().eq("id", cid);
    await load();
  }

  async function review(approve: boolean) {
    if (!item) return;
    let note = "";
    if (!approve) {
      const answer = window.prompt("Cosa va corretto? (lo legge chi l'ha scritto)", "");
      if (answer === null) return;
      note = answer;
    }
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc("press_review", { p_id: item.id, p_approve: approve, p_note: note });
    setBusy(false);
    if (e) return setError(errorText(e.message, "Operazione non riuscita."));
    refreshCounters(true);
    await load();
  }

  async function remove() {
    if (!item || !window.confirm(published ? `Ritirare «${item.title}» dal giornale? Si cancella per sempre.` : `Eliminare «${item.title}»?`)) return;
    setBusy(true);
    const { error: e } = await supabase.rpc("press_delete", { p_id: item.id });
    setBusy(false);
    if (e) return setError(errorText(e.message, "Non eliminato."));
    refreshCounters(true);
    onGone();
  }

  const edit = () =>
    onEdit({
      id: item.id,
      pg: item.character_id,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      body: item.body,
      section: item.section,
      cover: item.cover_url ?? "",
      guests: item.guests,
    });

  return (
    <article className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <BackButton onBack={onBack} />
        {!published && <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">{PRESS_STATUS_LABEL[item.status]}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {info.editor && item.status === "in_revisione" && (
            <>
              <Button type="button" size="sm" disabled={busy} onClick={() => review(true)} className="rounded-full">
                <Check /> Pubblica
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => review(false)} className="rounded-full border border-white/15">
                <Undo2 /> Rimanda indietro
              </Button>
            </>
          )}
          {((isAuthor && !published) || info.editor) && (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={edit} className="rounded-full border border-white/15">
              <PenLine /> {published ? "Correggi" : "Modifica"}
            </Button>
          )}
          {((isAuthor && !published) || info.editor) && (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={remove} className="rounded-full text-destructive">
              <Trash2 /> {published ? "Ritira" : "Elimina"}
            </Button>
          )}
        </div>
      </div>
      {item.status === "rifiutato" && item.review_note && (
        <p className="rounded-xl border border-peach/30 bg-peach/10 p-3 text-sm">
          <b>Da correggere</b> ({item.reviewed_by_name ?? "redazione"}): {item.review_note}
        </p>
      )}

      {item.cover_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.cover_url} alt="" className="max-h-96 w-full rounded-2xl object-cover" />
      )}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <KindBadge kind={item.kind} />
          <span className="tracking-widest uppercase">{PRESS_SECTIONS[item.section]}</span>
        </div>
        <h2 className="font-heading text-4xl leading-tight tracking-wide">{item.title}</h2>
        {item.summary && <p className="text-lg text-lavender">{item.summary}</p>}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Portrait person={item.character} />
          <span>
            {item.kind === "podcast" ? "Condotto da" : "di"} <b className="text-foreground">{firstName(item.character?.name)}</b>
            {item.published_at && ` · ${pressDate(item.published_at)}`}
          </span>
        </div>
        {item.kind === "podcast" && item.guests && (
          <p className="text-sm">
            <Mic className="mr-1 inline size-4 text-lavender" />
            Ospiti: {item.guests}
          </p>
        )}
      </div>

      <SafeHtml html={item.body} className="text-[0.95rem] leading-relaxed" />

      {published && (
        <section className="flex flex-col gap-3 border-t border-white/10 pt-4">
          <div className="flex flex-wrap gap-1.5">
            {counts.map(({ e, n }) => (
              <button
                key={e}
                type="button"
                disabled={!me}
                onClick={() => react(e)}
                title={me ? (mine === e ? "Togli la reazione" : "Reagisci") : "Serve un personaggio approvato"}
                className={cn("rounded-full border px-2.5 py-1 text-sm", mine === e ? "border-flamingo bg-flamingo/20" : "border-white/15 hover:bg-white/10")}
              >
                {e} {n > 0 && <span className="text-xs">{n}</span>}
              </button>
            ))}
          </div>

          <h3 className="font-heading text-xl tracking-wide">Commenti{comments.length > 0 ? ` (${comments.length})` : ""}</h3>
          <ul className="flex flex-col gap-2">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-2 rounded-xl bg-white/5 p-2.5">
                <Portrait person={c.character} size="size-7" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-xs text-muted-foreground">
                    <b className="text-foreground">{firstName(c.character?.name)}</b> · {pressDate(c.created_at)}
                  </p>
                  <p className="break-words whitespace-pre-line">{c.body}</p>
                </div>
                {(c.author_id === uid || info.editor) && (
                  <button type="button" onClick={() => removeComment(c.id)} aria-label="Elimina il commento" className="self-start text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {me ? (
            <div className="flex gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={1000}
                rows={2}
                placeholder={`Commenta come ${firstName(me.name)}…`}
                className="min-w-0 flex-1 rounded-xl border border-white/15 bg-night/50 px-3 py-2 text-sm outline-none focus-visible:border-peach/60"
              />
              <Button type="button" disabled={busy || !text.trim()} onClick={comment} className="self-end rounded-full">
                <Send /> Invia
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Per reagire e commentare serve un personaggio approvato.</p>
          )}
        </section>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </article>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button type="button" size="sm" variant="ghost" onClick={onBack} className="rounded-full">
      <ArrowLeft /> Tutte le uscite
    </Button>
  );
}

/* ------------------------------ Scrittura ------------------------------ */

function PressWriter({ initial, info, onCancel, onSaved }: { initial: Draft; info: PressInfo; onCancel: () => void; onSaved: (id: string, published: boolean) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPodcast = d.kind === "podcast";

  async function save(mode: "bozza" | "invia" | "pubblica") {
    if (d.title.trim().length < 3) return setError("Il titolo deve avere almeno 3 caratteri.");
    if (mode !== "bozza" && d.body.replace(/<[^>]+>/g, "").trim().length < 50) {
      return setError(isPodcast ? "Scrivi la puntata (almeno 50 caratteri) prima di mandarla in redazione." : "Scrivi l'articolo (almeno 50 caratteri) prima di mandarlo in redazione.");
    }
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("press_save", {
      p_id: d.id ?? null,
      p_pg: d.pg,
      p_kind: d.kind,
      p_title: d.title.trim(),
      p_summary: d.summary.trim(),
      p_body: d.body,
      p_section: d.section,
      p_cover: d.cover.trim(),
      p_guests: isPodcast ? d.guests.trim() : "",
      p_submit: mode !== "bozza",
    });
    if (e || !data) {
      setBusy(false);
      return setError(errorText(e?.message, "Salvataggio non riuscito: controlla i campi."));
    }
    const id = data as string;
    if (mode === "pubblica") {
      const { error: r } = await supabase.rpc("press_review", { p_id: id, p_approve: true, p_note: "" });
      if (r) {
        setBusy(false);
        return setError(errorText(r.message, "Salvato, ma non pubblicato."));
      }
    }
    setBusy(false);
    refreshCounters(true);
    onSaved(id, mode === "pubblica");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-3xl tracking-wide text-sunset">{d.id ? "Modifica" : isPodcast ? "Nuova puntata" : "Nuovo articolo"}</h2>
        <div className="ml-auto flex gap-1">
          {(
            [
              ["articolo", "Articolo", Newspaper],
              ["podcast", "Podcast", Mic],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => setD({ ...d, kind: k })}
              className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm", d.kind === k ? "bg-flamingo/20 text-white shadow-[inset_0_0_0_1px_var(--flamingo)]" : "text-muted-foreground hover:bg-white/5")}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {!d.id && info.writers.length > 1 && (
        <select value={d.pg} onChange={(e) => setD({ ...d, pg: e.target.value })} aria-label="Firma" className={inputCls}>
          {info.writers.map((w) => (
            <option key={w.id} value={w.id}>
              Firma: {w.name}
            </option>
          ))}
        </select>
      )}
      <input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} maxLength={150} placeholder={isPodcast ? "Titolo della puntata" : "Titolo"} className={cn(inputCls, "h-11 text-base font-semibold")} />
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={d.section} onChange={(e) => setD({ ...d, section: e.target.value as PressSection })} aria-label="Sezione" className={inputCls}>
          {SECTION_KEYS.map((s) => (
            <option key={s} value={s}>
              Sezione: {PRESS_SECTIONS[s]}
            </option>
          ))}
        </select>
        <input value={d.cover} onChange={(e) => setD({ ...d, cover: e.target.value })} maxLength={500} placeholder="Immagine di copertina (link https://, facoltativa)" className={inputCls} />
      </div>
      {isPodcast && <input value={d.guests} onChange={(e) => setD({ ...d, guests: e.target.value })} maxLength={200} placeholder="Ospiti della puntata (facoltativo)" className={inputCls} />}
      <textarea
        value={d.summary}
        onChange={(e) => setD({ ...d, summary: e.target.value })}
        maxLength={400}
        rows={2}
        placeholder="Sommario: due righe che si leggono nell'elenco"
        className="w-full rounded-xl border border-white/15 bg-night/50 px-3 py-2 text-sm outline-none focus-visible:border-peach/60"
      />
      <p className="text-xs text-muted-foreground">
        {isPodcast ? "Scrivi la puntata come una trascrizione: chi parla, le domande, le risposte, la musica in sottofondo…" : "Il testo dell'articolo. Puoi usare titoletti, grassetto e immagini."}
      </p>
      <RichEditor value={d.body} onChange={(html) => setD({ ...d, body: html })} />

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel} className="rounded-full">
          Annulla
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => save("bozza")} className="rounded-full border border-white/15">
          <Save /> Salva bozza
        </Button>
        {info.editor ? (
          <Button type="button" disabled={busy} onClick={() => save("pubblica")} className="rounded-full">
            <Check /> Pubblica
          </Button>
        ) : (
          <Button type="button" disabled={busy} onClick={() => save("invia")} className="rounded-full">
            <Send /> Manda in redazione
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Redazione ------------------------------ */

function PressDesk({ uid, info, onOpen }: { uid: string | null; info: PressInfo; onOpen: (id: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [mine, setMine] = useState<PressItem[] | null>(null);
  const [waiting, setWaiting] = useState<PressItem[]>([]);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    Promise.all([
      supabase.from("press_items").select(PRESS_LIST_SELECT).eq("author_id", uid).order("updated_at", { ascending: false }).limit(50).overrideTypes<PressItem[], { merge: false }>(),
      info.editor
        ? supabase.from("press_items").select(PRESS_LIST_SELECT).eq("status", "in_revisione").order("updated_at").limit(50).overrideTypes<PressItem[], { merge: false }>()
        : Promise.resolve({ data: [] as PressItem[] }),
    ]).then(([m, w]) => {
      if (!alive) return;
      setMine(m.data ?? []);
      setWaiting(w.data ?? []);
    });
    return () => {
      alive = false;
    };
  }, [supabase, uid, info.editor]);

  const row = (it: PressItem) => (
    <li key={it.id}>
      <button type="button" onClick={() => onOpen(it.id)} className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-white/5 p-2.5 text-left hover:bg-white/10">
        <KindBadge kind={it.kind} />
        <span className="min-w-0 flex-1 truncate font-medium">{it.title}</span>
        <span className="text-xs text-muted-foreground">di {firstName(it.character?.name)}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[0.7rem]",
            it.status === "pubblicato" ? "bg-mint/20 text-mint" : it.status === "rifiutato" ? "bg-peach/20 text-peach" : it.status === "in_revisione" ? "bg-violet/30 text-lavender" : "bg-white/10",
          )}
        >
          {PRESS_STATUS_LABEL[it.status]}
        </span>
      </button>
      {it.status === "rifiutato" && it.review_note && <p className="px-2.5 pt-1 text-xs text-peach">Da correggere: {it.review_note}</p>}
    </li>
  );

  return (
    <div className="flex flex-col gap-5">
      {info.editor && (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-2xl tracking-wide">Da pubblicare</h2>
          {waiting.length === 0 ? <p className="text-sm text-muted-foreground">Niente in attesa.</p> : <ul className="flex flex-col gap-1.5">{waiting.map(row)}</ul>}
        </section>
      )}
      {info.writers.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-2xl tracking-wide">I miei pezzi</h2>
          {mine === null ? (
            <p className="text-sm text-muted-foreground">Caricamento…</p>
          ) : mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">Non hai ancora scritto niente: premi «Scrivi».</p>
          ) : (
            <ul className="flex flex-col gap-1.5">{mine.map(row)}</ul>
          )}
        </section>
      )}
      <p className="text-xs text-muted-foreground">
        Scrivono i membri della redazione (Club Giornalistico). I pezzi mandati in redazione li pubblicano Direttore, Caporedattore o lo staff; se tornano indietro, si correggono e si rimandano. I pezzi con più reazioni danno un po&apos; di fama a chi li firma.
      </p>
    </div>
  );
}
