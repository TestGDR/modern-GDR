"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Heart, Mail, PenLine, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { firstName } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Cerca legami: annunci dei legami cercati (nome, descrizione, tag), «Trova»
// come Tinder (legami degli altri con almeno un tag in comune: ✕ salta, ♥ mi
// interessa), i match (♥ a vicenda) e i propri annunci.

type Person = { id: string; name: string; avatar_url: string | null };
type Bond = { id: string; title: string; description: string; tags: string[]; created_at: string; character_id: string; owner_id: string; character: Person | null };
type Candidate = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  created_at: string;
  character_id: string;
  owner_id: string;
  name: string;
  avatar_url: string | null;
  shared: string[] | null;
  my_titles: string[] | null;
};
type Match = { character_id: string; name: string; avatar_url: string | null; owner_id: string; created_at: string; titles: string[] };
type Tab = "bacheca" | "trova" | "match" | "miei";

const field = "w-full rounded-lg border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring";
const BOND_SELECT = "id, title, description, tags, created_at, character_id, owner_id, character:characters(id, name, avatar_url)";

function Portrait({ url, name, size = "size-10" }: { url: string | null; name: string; size?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={cn(size, "shrink-0 rounded-full object-cover")} />
  ) : (
    <span className={cn(size, "grid shrink-0 place-items-center rounded-full bg-white/10 text-sm")}>{firstName(name).slice(0, 1)}</span>
  );
}

function Tags({ tags, highlight = [], onClick }: { tags: string[]; highlight?: string[]; onClick?: (t: string) => void }) {
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <button
          key={t}
          type="button"
          disabled={!onClick}
          onClick={() => onClick?.(t)}
          className={cn("rounded-full px-2 py-0.5 text-[0.7rem]", highlight.includes(t) ? "bg-flamingo/25 text-flamingo" : "bg-white/10 text-muted-foreground", onClick && "hover:bg-white/20")}
        >
          #{t}
        </button>
      ))}
    </span>
  );
}

function OffLink({ ownerId }: { ownerId: string }) {
  return (
    <Link href={`/messaggi?a=${ownerId}`} className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-xs hover:bg-white/10">
      <Mail className="size-3.5" /> Scrivi in OFF
    </Link>
  );
}

export function BondsPanel({ characterId, canManage }: { characterId: string | null; canManage: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("bacheca");
  const [bonds, setBonds] = useState<Bond[] | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data }, { data: u }] = await Promise.all([
      supabase.from("bond_searches").select(BOND_SELECT).order("created_at", { ascending: false }).limit(300).overrideTypes<Bond[], { merge: false }>(),
      supabase.auth.getUser(),
    ]);
    setBonds(data ?? []);
    setUid(u.user?.id ?? null);
  }, [supabase]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const mine = (bonds ?? []).filter((b) => b.character_id === characterId);
  const myTags = [...new Set(mine.flatMap((b) => b.tags))];

  const tabs: [Tab, string][] = [
    ["bacheca", "Bacheca"],
    ["trova", "Trova"],
    ["match", "Match"],
    ["miei", "I miei legami"],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn("rounded-full px-4 py-1.5 text-sm", tab === k ? "bg-flamingo/20 text-white shadow-[inset_0_0_0_1px_var(--flamingo)]" : "text-muted-foreground hover:bg-white/5")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "bacheca" && <Board bonds={bonds} myTags={myTags} uid={uid} canManage={canManage} onChanged={load} />}
      {tab !== "bacheca" && !characterId && <p className="rounded-xl bg-white/5 p-3 text-sm text-muted-foreground">Per cercare legami serve un personaggio approvato.</p>}
      {tab === "trova" && characterId && <Discover characterId={characterId} hasOwn={mine.length > 0} onAdd={() => setTab("miei")} />}
      {tab === "match" && characterId && <Matches characterId={characterId} />}
      {tab === "miei" && characterId && <MyBonds characterId={characterId} mine={mine} canManage={canManage} onChanged={load} />}
    </div>
  );
}

/* ------------------------------ Bacheca ------------------------------ */

function Board({ bonds, myTags, uid, canManage, onChanged }: { bonds: Bond[] | null; myTags: string[]; uid: string | null; canManage: boolean; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const list = (bonds ?? []).filter(
    (b) => (!tag || b.tags.includes(tag)) && (!term || b.title.toLowerCase().includes(term) || b.description.toLowerCase().includes(term) || b.tags.some((t) => t.includes(term))),
  );

  async function remove(b: Bond) {
    if (!window.confirm(`Togliere «${b.title}»?`)) return;
    await supabase.from("bond_searches").delete().eq("id", b.id);
    onChanged();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per parola o tag…" className={cn(field, "min-w-40 flex-1")} />
        {tag && (
          <button type="button" onClick={() => setTag(null)} className="inline-flex items-center gap-1 rounded-full bg-flamingo/25 px-2.5 py-1 text-xs text-flamingo">
            #{tag} <X className="size-3" />
          </button>
        )}
      </div>
      {bonds === null && <p className="text-sm text-muted-foreground">Caricamento…</p>}
      {bonds !== null && list.length === 0 && <p className="text-sm text-muted-foreground">Nessun legame cercato{tag || term ? " con questo filtro" : " per ora"}.</p>}
      <ul className="flex flex-col gap-2">
        {list.map((b) => (
          <li key={b.id} className="flex gap-3 rounded-xl bg-white/5 p-3 text-sm">
            <Portrait url={b.character?.avatar_url ?? null} name={b.character?.name ?? ""} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p>
                <b className="text-peach">{firstName(b.character?.name)}</b> cerca: <b>{b.title}</b>
              </p>
              {b.description && <p className="break-words whitespace-pre-line text-muted-foreground">{b.description}</p>}
              <Tags tags={b.tags} highlight={b.owner_id === uid ? [] : myTags} onClick={setTag} />
              {b.owner_id !== uid && (
                <span className="pt-1">
                  <OffLink ownerId={b.owner_id} />
                </span>
              )}
            </div>
            {(b.owner_id === uid || canManage) && (
              <button type="button" onClick={() => remove(b)} className="self-start rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Togli">
                <Trash2 className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {myTags.length > 0 && <p className="text-xs text-muted-foreground">In rosa i tag che hai anche tu. Clicca un tag per vedere solo i legami con quel tag.</p>}
    </div>
  );
}

/* ------------------------------ Trova ------------------------------ */

function Discover({ characterId, hasOwn, onAdd }: { characterId: string; hasOwn: boolean; onAdd: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState<Candidate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("bond_discover", { p_pg: characterId });
    setList((data as Candidate[] | null) ?? []);
  }, [supabase, characterId]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  if (!hasOwn) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-2xl bg-white/5 p-4 text-sm">
        <p>Per trovare chi cerca il tuo stesso legame, prima aggiungi almeno un legame che stai cercando, con i suoi tag.</p>
        <Button type="button" size="sm" onClick={onAdd} className="rounded-full">
          <Plus /> Aggiungi un legame
        </Button>
      </div>
    );
  }

  const card = list?.[0] ?? null;

  async function vote(like: boolean) {
    if (!card) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("bond_vote", { p_pg: characterId, p_search: card.id, p_like: like });
    setBusy(false);
    if (e) return setError(e.message);
    if (data === true) setMatch(card);
    setList((l) => (l ?? []).slice(1));
  }
  async function reset() {
    await supabase.rpc("bond_reset_skipped", { p_pg: characterId });
    await load();
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {match && (
        <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-flamingo/50 bg-flamingo/15 p-4 text-center">
          <p className="font-heading text-3xl tracking-wide text-sunset">È un match!</p>
          <p className="text-sm">
            Anche <b>{firstName(match.name)}</b> è interessato ai tuoi legami.
          </p>
          <div className="flex gap-2">
            <OffLink ownerId={match.owner_id} />
            <Button type="button" size="xs" variant="ghost" onClick={() => setMatch(null)} className="rounded-full">
              Continua
            </Button>
          </div>
        </div>
      )}
      {list === null && <p className="text-sm text-muted-foreground">Caricamento…</p>}
      {list !== null && !card && (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
          <p>Per ora nessun altro cerca un legame con i tuoi tag.</p>
          <p className="text-xs">Prova ad aggiungere tag ai tuoi legami, o torna più tardi.</p>
          <Button type="button" size="sm" variant="ghost" onClick={reset} className="rounded-full border border-white/15">
            <RotateCcw /> Rivedi chi hai saltato
          </Button>
        </div>
      )}
      {card && (
        <div className="glass flex w-full max-w-md flex-col items-center gap-3 rounded-3xl p-5 text-center">
          <Portrait url={card.avatar_url} name={card.name} size="size-28" />
          <p className="font-heading text-3xl tracking-wide">{firstName(card.name)}</p>
          <p className="text-sm text-muted-foreground">cerca</p>
          <p className="text-lg font-semibold text-peach">{card.title}</p>
          {card.description && <p className="max-h-40 overflow-y-auto text-sm break-words whitespace-pre-line">{card.description}</p>}
          <Tags tags={card.tags} highlight={card.shared ?? []} />
          {card.my_titles && card.my_titles.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Combacia con il tuo legame «{card.my_titles.join("», «")}» ({(card.shared ?? []).map((t) => `#${t}`).join(" ")})
            </p>
          )}
          <div className="flex gap-6 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => vote(false)}
              aria-label="Salta"
              title="Salta"
              className="grid size-14 place-items-center rounded-full border border-white/20 bg-white/5 text-muted-foreground transition hover:scale-105 hover:text-foreground"
            >
              <X className="size-7" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => vote(true)}
              aria-label="Mi interessa"
              title="Mi interessa"
              className="grid size-14 place-items-center rounded-full border border-flamingo/60 bg-flamingo/20 text-flamingo transition hover:scale-105"
            >
              <Heart className="size-7 fill-current" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {list && list.length > 1 ? `Altri ${list.length - 1} da vedere. ` : ""}Se anche lui mette ♥ a uno dei tuoi legami, è un match.
          </p>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/* ------------------------------ Match ------------------------------ */

function Matches({ characterId }: { characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<Match[] | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.rpc("bond_my_matches", { p_pg: characterId }).then(({ data }) => {
      if (alive) setList((data as Match[] | null) ?? []);
    });
    return () => {
      alive = false;
    };
  }, [supabase, characterId]);

  if (list === null) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  if (list.length === 0) return <p className="text-sm text-muted-foreground">Ancora nessun match: metti ♥ in «Trova» ai legami che ti interessano.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {list.map((m) => (
        <li key={m.character_id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3 text-sm">
          <Portrait url={m.avatar_url} name={m.name} />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-peach">{firstName(m.name)}</p>
            {m.titles.length > 0 && <p className="truncate text-xs text-muted-foreground">Cerca: {m.titles.join(" · ")}</p>}
          </div>
          <OffLink ownerId={m.owner_id} />
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------ I miei legami ------------------------------ */

type Draft = { id?: string; title: string; description: string; tags: string[] };
const emptyDraft = (): Draft => ({ title: "", description: "", tags: [] });

function MyBonds({ characterId, mine, canManage, onChanged }: { characterId: string; mine: Bond[]; canManage: boolean; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [presets, setPresets] = useState<string[]>([]);
  const [d, setD] = useState<Draft>(emptyDraft());
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPreset, setNewPreset] = useState("");

  const loadPresets = useCallback(async () => {
    const { data } = await supabase.from("bond_tag_presets").select("name").order("sort_order").order("name");
    setPresets(((data ?? []) as { name: string }[]).map((r) => r.name));
  }, [supabase]);
  useEffect(() => {
    const t = setTimeout(loadPresets, 0);
    return () => clearTimeout(t);
  }, [loadPresets]);

  const toggle = (t: string) => setD({ ...d, tags: d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t].slice(0, 8) });
  function addCustom() {
    const parts = custom
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
      .filter((t) => t.length >= 2 && t.length <= 30);
    setD({ ...d, tags: [...new Set([...d.tags, ...parts])].slice(0, 8) });
    setCustom("");
  }

  async function save() {
    if (d.title.trim().length < 3) return setError("Dai un nome al legame (almeno 3 caratteri).");
    if (d.tags.length === 0) return setError("Scegli almeno un tag: servono per trovare chi cerca lo stesso legame.");
    setBusy(true);
    setError(null);
    const row = { title: d.title.trim(), description: d.description.trim(), tags: d.tags };
    const { error: e } = d.id ? await supabase.from("bond_searches").update(row).eq("id", d.id) : await supabase.from("bond_searches").insert({ ...row, character_id: characterId });
    setBusy(false);
    if (e) return setError(e.code === "P0001" ? e.message : "Salvataggio non riuscito.");
    setD(emptyDraft());
    onChanged();
  }
  async function remove(b: Bond) {
    if (!window.confirm(`Togliere «${b.title}»?`)) return;
    await supabase.from("bond_searches").delete().eq("id", b.id);
    if (d.id === b.id) setD(emptyDraft());
    onChanged();
  }
  async function addPreset() {
    const name = newPreset.trim().toLowerCase();
    if (name.length < 2) return;
    const { error: e } = await supabase.from("bond_tag_presets").insert({ name, sort_order: 100 });
    if (e) return setError("Tag non aggiunto: solo lettere, numeri e spazi, da 2 a 30 caratteri.");
    setNewPreset("");
    loadPresets();
  }
  async function removePreset(name: string) {
    if (!window.confirm(`Togliere #${name} dai tag pronti? Gli annunci che lo usano lo tengono.`)) return;
    await supabase.from("bond_tag_presets").delete().eq("name", name);
    loadPresets();
  }

  return (
    <div className="flex flex-col gap-4">
      {mine.length > 0 && (
        <ul className="flex flex-col gap-2">
          {mine.map((b) => (
            <li key={b.id} className={cn("flex gap-2 rounded-xl p-3 text-sm", d.id === b.id ? "bg-peach/10 ring-1 ring-peach/40" : "bg-white/5")}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <b>{b.title}</b>
                {b.description && <p className="break-words whitespace-pre-line text-muted-foreground">{b.description}</p>}
                <Tags tags={b.tags} />
              </div>
              <button type="button" onClick={() => setD({ id: b.id, title: b.title, description: b.description, tags: b.tags })} className="self-start rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Modifica">
                <PenLine className="size-4" />
              </button>
              <button type="button" onClick={() => remove(b)} className="self-start rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Togli">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3">
        <p className="text-sm font-semibold">{d.id ? "Modifica il legame" : "Nuovo legame che cerchi"}</p>
        <input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} maxLength={80} placeholder="Nome del legame (es. «Il mio ex dei tempi del liceo»)" className={field} />
        <textarea
          value={d.description}
          onChange={(e) => setD({ ...d, description: e.target.value })}
          maxLength={1500}
          rows={3}
          placeholder="Descrizione: chi cerchi, com'è nato il legame, cosa vorresti giocare…"
          className={field}
        />
        <p className="text-xs text-muted-foreground">Tag (fino a 8): clicca quelli pronti o scrivine di tuoi.</p>
        <div className="flex flex-wrap gap-1">
          {presets.map((t) => (
            <span key={t} className="inline-flex items-center">
              <button
                type="button"
                onClick={() => toggle(t)}
                className={cn("rounded-full px-2 py-0.5 text-xs", d.tags.includes(t) ? "bg-flamingo/30 text-flamingo ring-1 ring-flamingo/50" : "bg-white/10 text-muted-foreground hover:bg-white/20")}
              >
                #{t}
              </button>
              {canManage && (
                <button type="button" onClick={() => removePreset(t)} className="px-0.5 text-muted-foreground hover:text-destructive" aria-label={`Togli il tag pronto ${t}`}>
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            maxLength={100}
            placeholder="Tag tuoi, separati da virgole"
            className={field}
          />
          <Button type="button" size="sm" variant="ghost" onClick={addCustom} className="rounded-full border border-white/15">
            <Plus /> Aggiungi
          </Button>
        </div>
        {d.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {d.tags.map((t) => (
              <button key={t} type="button" onClick={() => toggle(t)} className="inline-flex items-center gap-1 rounded-full bg-flamingo/25 px-2 py-0.5 text-xs text-flamingo">
                #{t} <X className="size-3" />
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          {d.id && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setD(emptyDraft())} className="rounded-full">
              Annulla
            </Button>
          )}
          <Button type="button" size="sm" disabled={busy} onClick={save} className="rounded-full">
            {d.id ? <Save /> : <Plus />} {d.id ? "Salva" : "Pubblica"}
          </Button>
        </div>
      </div>

      {canManage && (
        <div className="flex flex-col gap-2 rounded-2xl border border-white/10 p-3 text-sm">
          <p className="font-semibold">Tag pronti (staff)</p>
          <p className="text-xs text-muted-foreground">Si tolgono con la × accanto a ogni tag qui sopra.</p>
          <div className="flex gap-2">
            <input value={newPreset} onChange={(e) => setNewPreset(e.target.value)} maxLength={30} placeholder="Nuovo tag pronto" className={field} />
            <Button type="button" size="sm" variant="ghost" onClick={addPreset} className="rounded-full border border-white/15">
              <Plus /> Aggiungi
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
