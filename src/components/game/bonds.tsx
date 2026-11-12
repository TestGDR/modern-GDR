"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Heart, Mail, PenLine, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { firstName } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Cerca legami: ogni personaggio ha un annuncio (titolo e presentazione) con
// i ruoli che cerca (nome, descrizione, tag). «Trova» come Tinder propone i
// ruoli degli altri con almeno un tag in comune con i propri (✕ salta, ♥ mi
// interessa); ♥ a vicenda = match.

type Person = { id: string; name: string; avatar_url: string | null };
type Role = { id: string; title: string; description: string; tags: string[]; created_at: string };
type Ad = { character_id: string; owner_id: string; title: string; description: string; created_at: string; updated_at: string; character: Person | null; roles: Role[] };
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
  ad_title: string | null;
  shared: string[] | null;
  my_titles: string[] | null;
};
type Match = { character_id: string; name: string; avatar_url: string | null; owner_id: string; created_at: string; titles: string[] };
type Tab = "bacheca" | "trova" | "match" | "mio";

const field = "w-full rounded-lg border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring";
const AD_SELECT =
  "character_id, owner_id, title, description, created_at, updated_at, character:characters!bond_ads_character_id_fkey(id, name, avatar_url), roles:bond_searches!bond_searches_ad_fk(id, title, description, tags, created_at)";

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

const byDate = (a: Role, b: Role) => a.created_at.localeCompare(b.created_at);

export function BondsPanel({ characterId, canManage }: { characterId: string | null; canManage: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("bacheca");
  const [ads, setAds] = useState<Ad[] | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data }, { data: u }] = await Promise.all([
      supabase.from("bond_ads").select(AD_SELECT).order("updated_at", { ascending: false }).limit(200).overrideTypes<Ad[], { merge: false }>(),
      supabase.auth.getUser(),
    ]);
    setAds((data ?? []).map((a) => ({ ...a, roles: [...(a.roles ?? [])].sort(byDate) })));
    setUid(u.user?.id ?? null);
  }, [supabase]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const myAd = (ads ?? []).find((a) => a.character_id === characterId) ?? null;
  const myTags = [...new Set((myAd?.roles ?? []).flatMap((r) => r.tags))];

  const tabs: [Tab, string][] = [
    ["bacheca", "Bacheca"],
    ["trova", "Trova"],
    ["match", "Match"],
    ["mio", "Il mio annuncio"],
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
      {tab === "bacheca" && <Board ads={ads} myTags={myTags} uid={uid} canManage={canManage} onChanged={load} />}
      {tab !== "bacheca" && !characterId && <p className="rounded-xl bg-white/5 p-3 text-sm text-muted-foreground">Per cercare legami serve un personaggio approvato.</p>}
      {tab === "trova" && characterId && <Discover characterId={characterId} hasOwn={(myAd?.roles.length ?? 0) > 0} onAdd={() => setTab("mio")} />}
      {tab === "match" && characterId && <Matches characterId={characterId} />}
      {tab === "mio" && characterId && ads !== null && <MyAd characterId={characterId} ad={myAd} canManage={canManage} onChanged={load} />}
    </div>
  );
}

/* ------------------------------ Bacheca ------------------------------ */

function Board({ ads, myTags, uid, canManage, onChanged }: { ads: Ad[] | null; myTags: string[]; uid: string | null; canManage: boolean; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const roleFits = (r: Role) =>
    (!tag || r.tags.includes(tag)) && (!term || r.title.toLowerCase().includes(term) || r.description.toLowerCase().includes(term) || r.tags.some((t) => t.includes(term)));
  const list = (ads ?? [])
    .filter((a) => a.roles.length > 0)
    .filter((a) => a.roles.some(roleFits) || (!tag && term !== "" && (a.title.toLowerCase().includes(term) || a.description.toLowerCase().includes(term))));

  async function remove(a: Ad) {
    if (!window.confirm(`Togliere tutto l'annuncio «${a.title}» con i suoi ruoli?`)) return;
    await supabase.from("bond_ads").delete().eq("character_id", a.character_id);
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
      {ads === null && <p className="text-sm text-muted-foreground">Caricamento…</p>}
      {ads !== null && list.length === 0 && <p className="text-sm text-muted-foreground">Nessun annuncio{tag || term ? " con questo filtro" : " per ora"}.</p>}
      <ul className="flex flex-col gap-3">
        {list.map((a) => {
          const mine = a.owner_id === uid;
          return (
            <li key={a.character_id} className="flex flex-col gap-3 rounded-2xl bg-white/5 p-4 text-sm">
              <div className="flex items-start gap-3">
                <Portrait url={a.character?.avatar_url ?? null} name={a.character?.name ?? ""} size="size-12" />
                <div className="min-w-0 flex-1">
                  <p className="font-heading text-2xl leading-tight tracking-wide">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    di <b className="text-peach">{firstName(a.character?.name)}</b> · {a.roles.length} {a.roles.length === 1 ? "ruolo cercato" : "ruoli cercati"}
                  </p>
                </div>
                {!mine && <OffLink ownerId={a.owner_id} />}
                {(mine || canManage) && (
                  <button type="button" onClick={() => remove(a)} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Togli l'annuncio">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              {a.description && <p className="break-words whitespace-pre-line text-muted-foreground">{a.description}</p>}
              <ul className="grid gap-2 sm:grid-cols-2">
                {a.roles.map((r) => (
                  <li key={r.id} className={cn("flex flex-col gap-1 rounded-xl border p-2.5", roleFits(r) && (tag || term) ? "border-peach/50 bg-peach/10" : "border-white/10 bg-night/30")}>
                    <b>{r.title}</b>
                    {r.description && <p className="break-words whitespace-pre-line text-xs text-muted-foreground">{r.description}</p>}
                    <Tags tags={r.tags} highlight={mine ? [] : myTags} onClick={setTag} />
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      {myTags.length > 0 && <p className="text-xs text-muted-foreground">In rosa i tag che hai anche tu. Clicca un tag per vedere solo gli annunci con quel tag.</p>}
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
        <p>Per trovare chi cerca il tuo stesso legame, prima aggiungi al tuo annuncio almeno un ruolo che stai cercando, con i suoi tag.</p>
        <Button type="button" size="sm" onClick={onAdd} className="rounded-full">
          <Plus /> Aggiungi un ruolo
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
          {card.ad_title && <p className="text-xs text-muted-foreground">dall&apos;annuncio «{card.ad_title}»</p>}
          {card.description && <p className="max-h-40 overflow-y-auto text-sm break-words whitespace-pre-line">{card.description}</p>}
          <Tags tags={card.tags} highlight={card.shared ?? []} />
          {card.my_titles && card.my_titles.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Combacia con il tuo ruolo «{card.my_titles.join("», «")}» ({(card.shared ?? []).map((t) => `#${t}`).join(" ")})
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
            {list && list.length > 1 ? `Altri ${list.length - 1} da vedere. ` : ""}Se anche lui mette ♥ a uno dei tuoi ruoli, è un match.
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

/* ------------------------------ Il mio annuncio ------------------------------ */

type Draft = { id?: string; title: string; description: string; tags: string[] };
const emptyDraft = (): Draft => ({ title: "", description: "", tags: [] });

function MyAd({ characterId, ad, canManage, onChanged }: { characterId: string; ad: Ad | null; canManage: boolean; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [presets, setPresets] = useState<string[]>([]);
  const [head, setHead] = useState({ title: ad?.title ?? "", description: ad?.description ?? "" });
  const [headMsg, setHeadMsg] = useState<string | null>(null);
  const [d, setD] = useState<Draft>(emptyDraft());
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPreset, setNewPreset] = useState("");
  const roles = ad?.roles ?? [];

  const loadPresets = useCallback(async () => {
    const { data } = await supabase.from("bond_tag_presets").select("name").order("sort_order").order("name");
    setPresets(((data ?? []) as { name: string }[]).map((r) => r.name));
  }, [supabase]);
  useEffect(() => {
    const t = setTimeout(loadPresets, 0);
    return () => clearTimeout(t);
  }, [loadPresets]);

  async function saveHead() {
    if (head.title.trim().length < 3) return setHeadMsg("Il titolo deve avere almeno 3 caratteri.");
    setBusy(true);
    setHeadMsg(null);
    const row = { title: head.title.trim(), description: head.description.trim() };
    const { error: e } = ad ? await supabase.from("bond_ads").update(row).eq("character_id", characterId) : await supabase.from("bond_ads").insert({ ...row, character_id: characterId });
    setBusy(false);
    if (e) return setHeadMsg(e.code === "P0001" ? e.message : "Annuncio non salvato.");
    setHeadMsg("Salvato.");
    onChanged();
  }

  const toggle = (t: string) => setD({ ...d, tags: d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t].slice(0, 8) });
  function addCustom() {
    const parts = custom
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
      .filter((t) => t.length >= 2 && t.length <= 30);
    setD({ ...d, tags: [...new Set([...d.tags, ...parts])].slice(0, 8) });
    setCustom("");
  }

  async function saveRole() {
    if (d.title.trim().length < 3) return setError("Dai un nome al ruolo (almeno 3 caratteri).");
    if (d.tags.length === 0) return setError("Scegli almeno un tag: servono per trovare chi cerca lo stesso legame.");
    setBusy(true);
    setError(null);
    // senza annuncio si crea con il titolo scritto sopra (o «Cerco legami»)
    if (!ad) {
      const title = head.title.trim().length >= 3 ? head.title.trim() : "Cerco legami";
      const { error: a } = await supabase.from("bond_ads").insert({ character_id: characterId, title, description: head.description.trim() });
      if (a && a.code !== "23505") {
        setBusy(false);
        return setError(a.code === "P0001" ? a.message : "Annuncio non creato.");
      }
    }
    const row = { title: d.title.trim(), description: d.description.trim(), tags: d.tags };
    const { error: e } = d.id ? await supabase.from("bond_searches").update(row).eq("id", d.id) : await supabase.from("bond_searches").insert({ ...row, character_id: characterId });
    setBusy(false);
    if (e) return setError(e.code === "P0001" ? e.message : "Ruolo non salvato.");
    setD(emptyDraft());
    onChanged();
  }
  async function removeRole(r: Role) {
    if (!window.confirm(`Togliere il ruolo «${r.title}»?`)) return;
    await supabase.from("bond_searches").delete().eq("id", r.id);
    if (d.id === r.id) setD(emptyDraft());
    onChanged();
  }
  async function removeAd() {
    if (!ad || !window.confirm("Togliere tutto l'annuncio con i suoi ruoli?")) return;
    await supabase.from("bond_ads").delete().eq("character_id", characterId);
    setHead({ title: "", description: "" });
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
      {/* l'annuncio: titolo e presentazione */}
      <div className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3">
        <p className="text-sm font-semibold">Il tuo annuncio</p>
        <input value={head.title} onChange={(e) => setHead({ ...head, title: e.target.value })} maxLength={100} placeholder="Titolo (es. «Cerco la mia famiglia e i miei vecchi amici»)" className={field} />
        <textarea
          value={head.description}
          onChange={(e) => setHead({ ...head, description: e.target.value })}
          maxLength={3000}
          rows={3}
          placeholder="Presentazione: chi è il tuo personaggio, che tipo di gioco cerchi…"
          className={field}
        />
        <div className="flex items-center justify-end gap-2">
          {headMsg && <span className={cn("text-xs", headMsg === "Salvato." ? "text-mint" : "text-destructive")}>{headMsg}</span>}
          {ad && (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={removeAd} className="rounded-full text-destructive">
              <Trash2 /> Togli l&apos;annuncio
            </Button>
          )}
          <Button type="button" size="sm" disabled={busy} onClick={saveHead} className="rounded-full">
            <Save /> {ad ? "Salva" : "Crea l'annuncio"}
          </Button>
        </div>
      </div>

      {/* i ruoli cercati */}
      <p className="text-sm font-semibold">Ruoli cercati{roles.length > 0 ? ` (${roles.length})` : ""}</p>
      {roles.length === 0 && <p className="text-sm text-muted-foreground">Nessun ruolo ancora: aggiungi qui sotto i legami che cerchi, quanti ne vuoi.</p>}
      {roles.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {roles.map((r) => (
            <li key={r.id} className={cn("flex gap-2 rounded-xl p-3 text-sm", d.id === r.id ? "bg-peach/10 ring-1 ring-peach/40" : "bg-white/5")}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <b>{r.title}</b>
                {r.description && <p className="break-words whitespace-pre-line text-xs text-muted-foreground">{r.description}</p>}
                <Tags tags={r.tags} />
              </div>
              <button type="button" onClick={() => setD({ id: r.id, title: r.title, description: r.description, tags: r.tags })} className="self-start rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Modifica">
                <PenLine className="size-4" />
              </button>
              <button type="button" onClick={() => removeRole(r)} className="self-start rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Togli">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded-2xl border border-peach/30 bg-white/5 p-3">
        <p className="text-sm font-semibold">{d.id ? "Modifica il ruolo" : "Aggiungi un ruolo"}</p>
        <input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} maxLength={80} placeholder="Nome del ruolo (es. «Il mio ex dei tempi del liceo»)" className={field} />
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
          <Button type="button" size="sm" disabled={busy} onClick={saveRole} className="rounded-full">
            {d.id ? <Save /> : <Plus />} {d.id ? "Salva il ruolo" : "Aggiungi all'annuncio"}
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
