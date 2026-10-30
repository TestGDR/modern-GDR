"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import DOMPurify from "dompurify";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Sparkle, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

// L'editor (TipTap) si carica solo quando serve
const RichEditor = dynamic(() => import("@/components/guide/rich-editor").then((m) => m.RichEditor), {
  ssr: false,
  loading: () => <p className="text-xs text-muted-foreground">Caricamento dell&apos;editor…</p>,
});

type Person = { id: string; username: string; characters: { id: string; avatar_url: string | null; status: string }[] };
type Affection = { id: string; body: string; sort_order: number; target: Person | null };

/** Il personaggio da mostrare per un utente: prima quello approvato */
function pickCharacter(p: Person | null) {
  if (!p) return null;
  return p.characters.find((c) => c.status === "approvata") ?? p.characters[0] ?? null;
}

const SELECT = "id, body, sort_order, target:profiles(id, username, characters(id, avatar_url, status))";

/** Sezione Affetti della scheda: persone legate al personaggio, con una dedica */
export function AffectionsSection({ characterId, canEdit, legacyText }: { characterId: string; canEdit: boolean; legacyText: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Affection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("character_affections")
      .select(SELECT)
      .eq("character_id", characterId)
      .order("sort_order")
      .order("created_at")
      .overrideTypes<Affection[], { merge: false }>();
    setItems(data ?? []);
  }, [supabase, characterId]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function add(person: { id: string; username: string }) {
    setError(null);
    setBusy(true);
    const { error: e } = await supabase
      .from("character_affections")
      .insert({ character_id: characterId, target_user_id: person.id, sort_order: (items?.length ?? 0) + 1 });
    setBusy(false);
    if (e) return setError(e.code === "23505" ? `${person.username} è già tra gli affetti.` : e.code === "P0001" ? e.message : "Non è stato possibile aggiungerlo.");
    await load();
  }

  /** Sposta su o giù: si rinumera tutto l'elenco */
  async function move(index: number, dir: -1 | 1) {
    if (!items) return;
    const next = [...items];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setItems(next);
    setBusy(true);
    for (const [i, a] of next.entries()) {
      if (a.sort_order !== i + 1) await supabase.from("character_affections").update({ sort_order: i + 1 }).eq("id", a.id);
    }
    setBusy(false);
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && <AddPerson characterId={characterId} onAdd={add} disabled={busy} existing={(items ?? []).map((a) => a.target?.id ?? "")} />}
      {error && <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>}
      {items === null ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ancora nessun affetto.{canEdit && " Scrivi il nome di un giocatore qui sopra e premi + per aggiungerlo."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((a, i) => (
            <AffectionCard
              key={a.id}
              item={a}
              canEdit={canEdit}
              first={i === 0}
              last={i === items.length - 1}
              disabled={busy}
              onMove={(d) => move(i, d)}
              onChanged={load}
            />
          ))}
        </ul>
      )}
      {legacyText && (
        <div className="mt-2">
          <h3 className="mb-1 font-heading text-lg tracking-wide text-peach">Altro</h3>
          <p className="max-w-2xl text-sm leading-relaxed whitespace-pre-line text-foreground/90">{legacyText}</p>
        </div>
      )}
    </div>
  );
}

/** Tendina "Aggiungi un PG": tutti i personaggi iscritti, in ordine alfabetico */
function AddPerson({
  characterId,
  onAdd,
  disabled,
  existing,
}: {
  characterId: string;
  onAdd: (p: { id: string; username: string }) => void;
  disabled: boolean;
  existing: string[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [people, setPeople] = useState<{ id: string; username: string; mine: boolean }[] | null>(null);
  const [picked, setPicked] = useState("");

  useEffect(() => {
    let alive = true;
    supabase
      .from("profiles")
      .select("id, username, characters(id)")
      .order("username")
      .limit(2000)
      .then(({ data }) => {
        if (!alive) return;
        const rows = (data ?? []) as { id: string; username: string; characters: { id: string }[] | null }[];
        // il proprietario della scheda non si aggiunge ai propri affetti
        setPeople(rows.map((r) => ({ id: r.id, username: r.username, mine: (r.characters ?? []).some((c) => c.id === characterId) })));
      });
    return () => {
      alive = false;
    };
  }, [supabase, characterId]);

  const options = (people ?? []).filter((p) => !p.mine && !existing.includes(p.id));
  const chosen = options.find((p) => p.id === picked) ?? null;

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!chosen) return;
        onAdd(chosen);
        setPicked("");
      }}
    >
      <select
        value={picked}
        onChange={(e) => setPicked(e.target.value)}
        disabled={people === null}
        aria-label="Aggiungi un PG agli affetti"
        className="h-11 min-w-0 flex-1 rounded-xl border border-peach/30 bg-night/50 px-3 text-sm outline-none focus-visible:border-peach/70"
      >
        <option value="" className="bg-night">
          {people === null ? "Caricamento dei personaggi…" : options.length === 0 ? "Nessun altro personaggio da aggiungere" : "Aggiungi un PG: scegli dall'elenco…"}
        </option>
        {options.map((p) => (
          <option key={p.id} value={p.id} className="bg-night">
            {p.username}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={disabled || !chosen}
        title={chosen ? `Aggiungi ${chosen.username}` : "Scegli un personaggio dall'elenco"}
        aria-label="Aggiungi"
        className="grid size-11 shrink-0 place-items-center rounded-xl border border-peach/30 bg-night/50 text-peach transition-colors hover:border-peach hover:bg-peach/10 disabled:opacity-40"
      >
        <Plus className="size-5" />
      </button>
    </form>
  );
}

/** HTML della dedica, ripulito con DOMPurify (solo nel browser) */
function SafeHtml({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = DOMPurify.sanitize(html);
  }, [html]);
  return <div ref={ref} className={className} />;
}

function AffectionCard({
  item,
  canEdit,
  first,
  last,
  disabled,
  onMove,
  onChanged,
}: {
  item: Affection;
  canEdit: boolean;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onMove: (dir: -1 | 1) => void;
  onChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(item.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const person = item.target;
  const character = pickCharacter(person);
  const name = person?.username ?? "Utente non più iscritto";

  async function save() {
    if (body.length > 8000) return setError("La dedica è troppo lunga (massimo 8000 caratteri).");
    setSaving(true);
    setError(null);
    const { error: e } = await supabase.from("character_affections").update({ body }).eq("id", item.id);
    setSaving(false);
    if (e) return setError("Dedica non salvata.");
    setEditing(false);
    onChanged();
  }

  async function remove() {
    if (!window.confirm(`Togliere ${name} dagli affetti?`)) return;
    const { error: e } = await supabase.from("character_affections").delete().eq("id", item.id);
    if (e) return setError("Non è stato possibile toglierlo.");
    onChanged();
  }

  const ctrl = "grid size-8 place-items-center rounded-lg border border-white/15 bg-night/60 text-white/80 transition-colors hover:border-flamingo/60 hover:text-white disabled:opacity-30 [&_svg]:size-3.5";
  return (
    <li className="flex overflow-hidden rounded-2xl border border-peach/30 bg-night/40 shadow-[0_0_18px_rgb(236_140_184/0.08)]">
      {/* fascia laterale con la stella */}
      <span className="grid w-7 shrink-0 place-items-center bg-gradient-to-b from-flamingo/80 via-orchid/70 to-violet/80">
        <Sparkle className="size-3.5 fill-white/90 text-white/90" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 @lg:flex-row @lg:gap-4">
        {/* ritratto incorniciato */}
        <div className="size-28 shrink-0 overflow-hidden rounded-xl border-2 border-peach/40 bg-gradient-to-br from-violet via-orchid to-peach shadow-lg ring-1 ring-white/10">
          {character?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={character.avatar_url} alt={`Ritratto di ${name}`} className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center font-heading text-3xl tracking-wider text-white">{initials(name)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {character ? (
                <Link href={`/scheda/${character.id}`} className="font-heading text-2xl tracking-wide break-words text-sand hover:text-peach">
                  {name}
                </Link>
              ) : (
                <p className="font-heading text-2xl tracking-wide break-words text-sand">{name}</p>
              )}
              {/* divisore con il rombo */}
              <div className="mt-1 flex max-w-64 items-center gap-2" aria-hidden>
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-peach/50" />
                <span className="size-1.5 rotate-45 bg-peach/80" />
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-peach/50" />
              </div>
            </div>
            {canEdit && !editing && (
              <div className="flex shrink-0 gap-1.5">
                <button type="button" className={ctrl} disabled={first || disabled} onClick={() => onMove(-1)} aria-label="Sposta su" title="Sposta su">
                  <ArrowUp />
                </button>
                <button type="button" className={ctrl} disabled={last || disabled} onClick={() => onMove(1)} aria-label="Sposta giù" title="Sposta giù">
                  <ArrowDown />
                </button>
                <button
                  type="button"
                  className={ctrl}
                  onClick={() => {
                    setBody(item.body);
                    setEditing(true);
                  }}
                  aria-label="Scrivi la dedica"
                  title="Scrivi la dedica"
                >
                  <Pencil />
                </button>
              </div>
            )}
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          {editing ? (
            <div className="mt-3 flex flex-col gap-2">
              <RichEditor value={body} onChange={setBody} />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="ghost" size="sm" className="mr-auto text-destructive" onClick={remove}>
                  <Trash2 /> Togli dagli affetti
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  <X /> Annulla
                </Button>
                <Button type="button" size="sm" disabled={saving} onClick={save} className="rounded-full">
                  <Check /> {saving ? "Salvataggio…" : "Salva"}
                </Button>
              </div>
            </div>
          ) : item.body.trim() ? (
            <SafeHtml html={item.body} className="guide-content mt-3 text-sm" />
          ) : (
            canEdit && <p className="mt-3 text-xs text-muted-foreground italic">Clicca la matita per scrivere una frase o una dedica.</p>
          )}
        </div>
      </div>
    </li>
  );
}
