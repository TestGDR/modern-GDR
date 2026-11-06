"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, BookOpen, ClipboardList, Gem, Layers, Loader2, Megaphone, Plus, Save, Settings2, Star, Trash2, Users } from "lucide-react";
import { inputClass, textareaClass } from "@/components/admin/admin-ui";
import { SettingRow } from "@/components/admin/settings-manager";
import { FameIcon } from "@/components/fame/fame-icon";
import { LevelBar } from "@/components/fame/fame-section";
import { Button } from "@/components/ui/button";
import { signedPoints, type FameOverview } from "@/lib/fame";
import { createClient } from "@/lib/supabase/client";
import type { GameSetting } from "@/lib/types";
import { cn } from "@/lib/utils";

// Gestione → Fama: voci libere e badge dei personaggi, proposte di background,
// cataloghi (voci di background, badge, rarità, livelli), impostazioni fama_* e registro.
// Scritture dirette sulle tabelle (RLS: fama.gestire); i trigger del database
// ricalcolano i totali, scrivono il registro e mandano le notifiche.

type Tab = "personaggi" | "proposte" | "catalogo" | "badge" | "rarita" | "livelli" | "social" | "impostazioni" | "registro";
const TABS: { key: Tab; label: string; icon: typeof Star }[] = [
  { key: "personaggi", label: "Personaggi", icon: Users },
  { key: "proposte", label: "Proposte", icon: ClipboardList },
  { key: "catalogo", label: "Voci di background", icon: BookOpen },
  { key: "badge", label: "Badge", icon: BadgeCheck },
  { key: "rarita", label: "Rarità", icon: Gem },
  { key: "livelli", label: "Livelli", icon: Layers },
  { key: "social", label: "Social", icon: Megaphone },
  { key: "impostazioni", label: "Impostazioni", icon: Settings2 },
  { key: "registro", label: "Registro", icon: Star },
];

type Character = { id: string; name: string; status: string };
type BgItem = { id: string; name: string; description: string; category: string; cost_pf: number; fame_points: number; infamy_points: number; active: boolean; sort_order: number };
type Rarity = { id: string; name: string; color: string; sort_order: number };
type Badge = { id: string; name: string; description: string; icon: string; points: number; kind: "fama" | "infamia"; rarity_id: string | null; is_unique: boolean; active: boolean; sort_order: number };

export function FameManager({ settings }: { settings: GameSetting[] }) {
  const [tab, setTab] = useState<Tab>("personaggi");
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-1 self-start rounded-2xl bg-white/5 p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm", tab === key ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:bg-white/5")}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </nav>
      {tab === "personaggi" && <CharactersTab />}
      {tab === "proposte" && <ProposalsTab />}
      {tab === "catalogo" && <BgCatalog />}
      {tab === "badge" && <BadgeCatalog />}
      {tab === "rarita" && <RarityCatalog />}
      {tab === "livelli" && <LevelsCatalog />}
      {tab === "social" && <SocialPackages />}
      {tab === "impostazioni" && (
        <ul className="flex flex-col gap-3">
          {settings.map((s) => (
            <SettingRow key={s.key} setting={s} levels={[]} />
          ))}
        </ul>
      )}
      {tab === "registro" && <LogTab />}
    </div>
  );
}

/* ------------------------------ comuni ------------------------------ */

function useCharacters() {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<Character[]>([]);
  useEffect(() => {
    let alive = true;
    supabase
      .from("characters")
      .select("id, name, status")
      .order("name")
      .then(({ data }) => alive && setList((data ?? []) as Character[]));
    return () => {
      alive = false;
    };
  }, [supabase]);
  return list;
}

function useRun(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (p: PromiseLike<{ error: { message: string } | null }>) => {
      setBusy(true);
      setError(null);
      const { error: e } = await p;
      setBusy(false);
      if (e) setError(e.message);
      onDone();
      return !e;
    },
    [onDone],
  );
  return { busy, error, run };
}

/* ------------------------------ Personaggi ------------------------------ */

function CharactersTab() {
  const supabase = useMemo(() => createClient(), []);
  const characters = useCharacters();
  const [id, setId] = useState("");
  const [data, setData] = useState<(FameOverview & { pf_spent?: number }) | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [items, setItems] = useState<BgItem[]>([]);
  const load = useCallback(async () => {
    if (!id) return setData(null);
    const [o, b, i] = await Promise.all([
      supabase.rpc("fame_overview", { p_character: id }),
      supabase.from("fame_badges").select("*").eq("active", true).order("sort_order"),
      supabase.from("fame_bg_items").select("*").eq("active", true).order("category").order("sort_order"),
    ]);
    setData((o.data ?? null) as FameOverview | null);
    setBadges((b.data ?? []) as Badge[]);
    setItems((i.data ?? []) as BgItem[]);
  }, [supabase, id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura del personaggio scelto
    load();
  }, [load]);
  const { busy, error, run } = useRun(load);
  const [entry, setEntry] = useState({ title: "", description: "", points: "1", kind: "fama", is_public: true });
  const [give, setGive] = useState({ badge: "", reason: "" });
  const [bgItem, setBgItem] = useState("");
  const [pool, setPool] = useState("");
  // correzione dello staff: punti in più o in meno, con il motivo
  const [fix, setFix] = useState({ points: "-5", kind: "fama", reason: "", visible: false });
  // esito del ricalcolo (quanti personaggi)
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null);
  const recalc = async (character: string | null) => {
    setRecalcMsg(null);
    const res = await supabase.rpc("fame_recalc_staff", { p_character: character });
    const ok = await run(Promise.resolve(res));
    if (ok) setRecalcMsg(character ? "Fama e infamia ricalcolate." : `Ricalcolati ${Number(res.data ?? 0)} personaggi.`);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
      <select className={cn(inputClass, "sm:max-w-sm")} value={id} onChange={(e) => setId(e.target.value)} aria-label="Personaggio">
        <option value="">Scegli un personaggio…</option>
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.status !== "approvata" ? ` (${c.status})` : ""}
          </option>
        ))}
      </select>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Ricalcolare fama e infamia di tutti i personaggi?")) void recalc(null);
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : null}
          Ricalcola tutti
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {recalcMsg && !error && <p className="text-sm text-mint">{recalcMsg}</p>}
      {id && !data && <Loader2 className="animate-spin text-muted-foreground" />}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.fame && <LevelBar title="Fama" level={data.fame} />}
            {data.infamy && <LevelBar title="Infamia" level={data.infamy} infamy />}
          </div>

          {/* correzione */}
          <section className="glass flex flex-col gap-2 rounded-2xl border border-flamingo/30 p-3">
            <h3 className="font-heading text-lg tracking-wide text-flamingo">Correggi la fama</h3>
            <p className="text-xs text-muted-foreground">
              Per un errore: aggiunge una voce «Correzione dello staff» con i punti indicati (negativi per togliere, positivi per ridare). Fama e infamia non scendono mai sotto zero.
              In alternativa puoi modificare o eliminare la voce sbagliata qui sotto.
            </p>
            <div className="grid gap-2 sm:grid-cols-[6rem_8rem_1fr]">
              <input className={inputClass} type="number" min={-1000} max={1000} value={fix.points} onChange={(e) => setFix({ ...fix, points: e.target.value })} aria-label="Punti della correzione" />
              <select className={inputClass} value={fix.kind} onChange={(e) => setFix({ ...fix, kind: e.target.value })} aria-label="Fama o infamia">
                <option value="fama">Fama</option>
                <option value="infamia">Infamia</option>
              </select>
              <input className={inputClass} maxLength={1000} placeholder="Motivo (es. voce data due volte per errore)" value={fix.reason} onChange={(e) => setFix({ ...fix, reason: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={fix.visible} onChange={(e) => setFix({ ...fix, visible: e.target.checked })} /> La vede il giocatore (con avviso)
              </label>
              <Button
                type="button"
                size="sm"
                className="ml-auto"
                disabled={busy || fix.reason.trim().length < 3 || !Number.isInteger(Number(fix.points)) || Number(fix.points) === 0}
                onClick={async () => {
                  const ok = await run(
                    supabase.from("fame_entries").insert({
                      character_id: id,
                      title: "Correzione dello staff",
                      description: fix.reason.trim(),
                      points: Number(fix.points),
                      kind: fix.kind,
                      is_public: fix.visible,
                    }),
                  );
                  if (ok) setFix({ points: "-5", kind: "fama", reason: "", visible: false });
                }}
              >
                Applica la correzione
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void recalc(id)} title="Ricalcola i totali di questo personaggio">
                Ricalcola
              </Button>
            </div>
          </section>

          {/* voce libera */}
          <section className="glass flex flex-col gap-2 rounded-2xl p-3">
            <h3 className="font-heading text-lg tracking-wide text-peach">Nuova voce (impresa o reputazione)</h3>
            <div className="grid gap-2 sm:grid-cols-[1fr_6rem_8rem]">
              <input className={inputClass} maxLength={120} placeholder="Titolo (es. Ha vinto il torneo di primavera)" value={entry.title} onChange={(e) => setEntry({ ...entry, title: e.target.value })} />
              <input className={inputClass} type="number" min={-1000} max={1000} value={entry.points} onChange={(e) => setEntry({ ...entry, points: e.target.value })} aria-label="Punti" />
              <select className={inputClass} value={entry.kind} onChange={(e) => setEntry({ ...entry, kind: e.target.value })} aria-label="Tipo">
                <option value="fama">Fama</option>
                <option value="infamia">Infamia</option>
              </select>
            </div>
            <textarea className={textareaClass} rows={2} maxLength={1000} placeholder="Descrizione (facoltativa)" value={entry.description} onChange={(e) => setEntry({ ...entry, description: e.target.value })} />
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={entry.is_public} onChange={(e) => setEntry({ ...entry, is_public: e.target.checked })} /> Pubblica (la vedono tutti e il giocatore riceve un avviso)
              </label>
              <Button
                type="button"
                size="sm"
                className="ml-auto"
                disabled={busy || entry.title.trim().length < 2 || !Number.isInteger(Number(entry.points))}
                onClick={async () => {
                  const ok = await run(
                    supabase.from("fame_entries").insert({ character_id: id, title: entry.title.trim(), description: entry.description.trim(), points: Number(entry.points), kind: entry.kind, is_public: entry.is_public }),
                  );
                  if (ok) setEntry({ title: "", description: "", points: "1", kind: "fama", is_public: true });
                }}
              >
                <Plus /> Aggiungi
              </Button>
            </div>
          </section>

          {/* badge */}
          <section className="glass flex flex-col gap-2 rounded-2xl p-3">
            <h3 className="font-heading text-lg tracking-wide text-peach">Dai un badge</h3>
            <div className="grid gap-2 sm:grid-cols-[16rem_1fr_auto]">
              <select className={inputClass} value={give.badge} onChange={(e) => setGive({ ...give, badge: e.target.value })} aria-label="Badge">
                <option value="">Badge…</option>
                {badges.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.icon.startsWith("https://") ? "" : `${b.icon} `}
                    {b.name} ({signedPoints(b.points)} {b.kind}
                    {b.is_unique ? ", unico" : ""})
                  </option>
                ))}
              </select>
              <input className={inputClass} maxLength={500} placeholder="Motivazione" value={give.reason} onChange={(e) => setGive({ ...give, reason: e.target.value })} />
              <Button
                type="button"
                size="sm"
                className="self-center"
                disabled={busy || !give.badge}
                onClick={async () => {
                  if (await run(supabase.from("character_badges").insert({ character_id: id, badge_id: give.badge, reason: give.reason.trim() }))) setGive({ badge: "", reason: "" });
                }}
              >
                <Plus /> Dai
              </Button>
            </div>
          </section>

          {/* elenchi con modifica e cancellazione */}
          <section className="flex flex-col gap-2">
            <h3 className="font-heading text-lg tracking-wide text-peach">Voci</h3>
            {data.entries.length === 0 && <p className="text-sm text-muted-foreground">Nessuna voce.</p>}
            {data.entries.map((e) => (
              <EntryRow key={e.id} entry={e} busy={busy} run={run} />
            ))}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-heading text-lg tracking-wide text-peach">Badge</h3>
            {data.badges.length === 0 && <p className="text-sm text-muted-foreground">Nessun badge.</p>}
            <ul className="flex flex-col gap-1">
              {data.badges.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm">
                  <FameIcon icon={b.icon} label={b.name} />
                  <strong className="font-medium">{b.name}</strong>
                  <span className="text-xs text-muted-foreground">
                    {signedPoints(b.points)} {b.kind}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="ml-auto text-destructive"
                    disabled={busy}
                    onClick={() => window.confirm(`Togliere il badge «${b.name}»?`) && run(supabase.from("character_badges").delete().eq("id", b.id))}
                  >
                    <Trash2 /> Togli
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-heading text-lg tracking-wide text-peach">Background</h3>
            <ul className="flex flex-col gap-1">
              {data.background.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm">
                  <strong className="font-medium">{b.name}</strong>
                  <span className="text-xs text-muted-foreground">
                    {b.category} · {b.cost ?? "—"} PF · +{b.fame ?? 0} fama{b.infamy ? ` · +${b.infamy} infamia` : ""} · {b.status}
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="ml-auto text-destructive"
                    disabled={busy}
                    onClick={() => window.confirm(`Togliere «${b.name}» dal background?`) && run(supabase.from("character_fame_bg").delete().eq("id", b.id))}
                  >
                    <Trash2 /> Togli
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <select className={cn(inputClass, "h-9 sm:max-w-sm")} value={bgItem} onChange={(e) => setBgItem(e.target.value)} aria-label="Voce di background">
                <option value="">Aggiungi una voce del catalogo…</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.category} · {i.name} ({i.cost_pf} PF, +{i.fame_points} fama)
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                disabled={busy || !bgItem}
                onClick={async () => {
                  const i = items.find((x) => x.id === bgItem);
                  if (i && (await run(supabase.from("character_fame_bg").insert({ character_id: id, item_id: i.id, category: i.category, cost_pf: i.cost_pf, status: "approvata" })))) setBgItem("");
                }}
              >
                <Plus /> Aggiungi
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                Punti Fama iniziali: {data.pf_pool}
                {data.converted ? ` · già convertiti (${data.pf_converted} PF → ${data.px_from_conversion} PX)` : " · non ancora convertiti"}
              </span>
              {!data.converted && (
                <>
                  <input className={cn(inputClass, "h-8 w-20")} type="number" min={0} value={pool} placeholder={String(data.pf_pool)} onChange={(e) => setPool(e.target.value)} aria-label="Nuovi PF iniziali" />
                  <Button type="button" size="xs" disabled={busy || pool === ""} onClick={() => run(supabase.rpc("fame_set_pool", { p_character: id, p_pool: Number(pool) })).then(() => setPool(""))}>
                    Cambia
                  </Button>
                </>
              )}
              {/* personaggio sbloccato che non ha mai avuto PX dalla fama: il giocatore può scegliere lui il background */}
              {data.converted && data.px_from_conversion === 0 && ["bozza", "rifiutata"].includes(characters.find((c) => c.id === id)?.status ?? "") && (
                <>
                  <input className={cn(inputClass, "h-8 w-20")} type="number" min={0} value={pool} placeholder="10" onChange={(e) => setPool(e.target.value)} aria-label="PF da dare" />
                  <Button
                    type="button"
                    size="xs"
                    disabled={busy}
                    onClick={() =>
                      window.confirm("Riaprire i Punti Fama? Il giocatore sceglie il background in creazione e alla nuova approvazione i PF non spesi diventano PX.") &&
                      run(supabase.rpc("fame_reopen", { p_character: id, p_pool: pool === "" ? null : Number(pool) })).then(() => setPool(""))
                    }
                  >
                    Riapri i Punti Fama
                  </Button>
                </>
              )}
            </div>
            <p className="text-[0.7rem] text-muted-foreground">
              Le voci aggiunte o tolte dallo staff contano subito nella fama; dopo l&apos;approvazione non cambiano più i PX.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function EntryRow({ entry, busy, run }: { entry: FameOverview["entries"][number]; busy: boolean; run: (p: PromiseLike<{ error: { message: string } | null }>) => Promise<boolean> }) {
  const supabase = useMemo(() => createClient(), []);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: entry.title, description: entry.description, points: String(entry.points), kind: entry.kind, is_public: entry.public });
  if (!edit) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm">
        <strong className="font-medium">{entry.title}</strong>
        <span className={cn("text-xs font-semibold", entry.kind === "infamia" ? "text-flamingo" : "text-mint")}>
          {signedPoints(entry.points)} {entry.kind}
        </span>
        {!entry.public && <span className="rounded bg-violet/40 px-1.5 text-[0.6rem] text-lavender uppercase">solo staff</span>}
        <span className="ml-auto flex gap-1">
          <Button type="button" size="xs" variant="ghost" onClick={() => setEdit(true)}>
            Modifica
          </Button>
          <Button type="button" size="xs" variant="ghost" className="text-destructive" disabled={busy} onClick={() => window.confirm(`Eliminare «${entry.title}»?`) && run(supabase.from("fame_entries").delete().eq("id", entry.id))}>
            <Trash2 />
          </Button>
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-2.5 text-sm">
      <div className="grid gap-2 sm:grid-cols-[1fr_6rem_8rem]">
        <input className={inputClass} maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Titolo" />
        <input className={inputClass} type="number" value={f.points} onChange={(e) => setF({ ...f, points: e.target.value })} aria-label="Punti" />
        <select className={inputClass} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "fama" | "infamia" })} aria-label="Tipo">
          <option value="fama">Fama</option>
          <option value="infamia">Infamia</option>
        </select>
      </div>
      <textarea className={textareaClass} rows={2} maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} aria-label="Descrizione" />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={f.is_public} onChange={(e) => setF({ ...f, is_public: e.target.checked })} /> Pubblica
        </label>
        <Button
          type="button"
          size="xs"
          className="ml-auto"
          disabled={busy}
          onClick={async () => {
            const ok = await run(
              supabase.from("fame_entries").update({ title: f.title.trim(), description: f.description.trim(), points: Number(f.points), kind: f.kind, is_public: f.is_public }).eq("id", entry.id),
            );
            if (ok) setEdit(false);
          }}
        >
          <Save /> Salva
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => setEdit(false)}>
          Annulla
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ Proposte ------------------------------ */

type Proposal = { id: string; custom_name: string; custom_description: string; created_at: string; characters: { name: string } | null };

function ProposalsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Proposal[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase
      .from("character_fame_bg")
      .select("id, custom_name, custom_description, created_at, characters(name)")
      .eq("status", "in_attesa")
      .order("created_at");
    setRows((data ?? []) as unknown as Proposal[]);
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);
  const { busy, error, run } = useRun(load);
  const [cost, setCost] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [fame, setFame] = useState<Record<string, string>>({});
  const [infamy, setInfamy] = useState<Record<string, string>>({});

  if (!rows) return <Loader2 className="animate-spin text-muted-foreground" />;
  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Nessuna proposta in attesa.</p>}
      {rows.map((p) => (
        <div key={p.id} className="glass flex flex-col gap-2 rounded-2xl p-3 text-sm">
          <p>
            <strong>{p.characters?.name}</strong> propone: <strong className="text-peach">{p.custom_name}</strong>
          </p>
          {p.custom_description && <p className="text-muted-foreground">{p.custom_description}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <input className={cn(inputClass, "h-8 w-24")} type="number" min={0} max={100} placeholder="Costo PF" value={cost[p.id] ?? ""} onChange={(e) => setCost({ ...cost, [p.id]: e.target.value })} aria-label="Costo in PF" />
            <input className={cn(inputClass, "h-8 w-24")} type="number" placeholder="Fama" title="Punti di fama (vuoto = 5 per PF)" value={fame[p.id] ?? ""} onChange={(e) => setFame({ ...fame, [p.id]: e.target.value })} aria-label="Punti di fama" />
            <input className={cn(inputClass, "h-8 w-24")} type="number" placeholder="Infamia" value={infamy[p.id] ?? ""} onChange={(e) => setInfamy({ ...infamy, [p.id]: e.target.value })} aria-label="Punti di infamia" />
            <input className={cn(inputClass, "h-8 min-w-0 flex-1")} maxLength={300} placeholder="Nota per il giocatore (facoltativa)" value={note[p.id] ?? ""} onChange={(e) => setNote({ ...note, [p.id]: e.target.value })} />
            <Button type="button" size="xs" disabled={busy || (cost[p.id] ?? "") === ""} onClick={() =>
                run(
                  supabase.rpc("fame_bg_review", {
                    p_id: p.id,
                    p_approve: true,
                    p_cost: Number(cost[p.id]),
                    p_note: note[p.id] ?? "",
                    p_fame: (fame[p.id] ?? "") === "" ? null : Number(fame[p.id]),
                    p_infamy: Number(infamy[p.id] || 0),
                  }),
                )
              }>
              Approva
            </Button>
            <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => run(supabase.rpc("fame_bg_review", { p_id: p.id, p_approve: false, p_cost: null, p_note: note[p.id] ?? "" }))}>
              Rifiuta
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Cataloghi ------------------------------ */

type Field = { key: string; label: string; type: "text" | "number" | "textarea" | "checkbox" | "color" | "select"; options?: { value: string; label: string }[]; width?: string };
type Row = Record<string, string | number | boolean | null> & { id?: string };

/** Elenco modificabile di una tabella del catalogo: ogni riga con Salva ed Elimina, in fondo una riga nuova */
function CatalogEditor({ table, fields, order, empty, hint, filter }: { table: string; fields: Field[]; order: string[]; empty: Row; hint?: string; filter?: { key: string; value: string } }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  // chiavi semplici: elenchi e oggetti nuovi a ogni render farebbero ricaricare all'infinito
  const orderKey = order.join(",");
  const filterKey = filter?.key ?? "";
  const filterValue = filter?.value ?? "";
  const load = useCallback(async () => {
    let q = supabase.from(table).select("*");
    if (filterKey) q = q.eq(filterKey, filterValue);
    for (const o of orderKey.split(",")) q = q.order(o);
    const { data } = await q;
    setRows((data ?? []) as Row[]);
  }, [supabase, table, orderKey, filterKey, filterValue]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);
  const { busy, error, run } = useRun(load);

  if (!rows) return <Loader2 className="animate-spin text-muted-foreground" />;
  return (
    <div className="flex flex-col gap-2">
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {rows.map((r) => (
        <CatalogRow key={String(r.id)} row={r} fields={fields} busy={busy} onSave={(v) => run(supabase.from(table).update(v).eq("id", String(r.id)))} onDelete={() => run(supabase.from(table).delete().eq("id", String(r.id)))} />
      ))}
      <CatalogRow key={`nuova-${rows.length}`} row={empty} fields={fields} busy={busy} isNew onSave={(v) => run(supabase.from(table).insert(v))} />
    </div>
  );
}

function CatalogRow({ row, fields, busy, isNew = false, onSave, onDelete }: { row: Row; fields: Field[]; busy: boolean; isNew?: boolean; onSave: (v: Row) => Promise<boolean>; onDelete?: () => void }) {
  const [f, setF] = useState<Row>(row);
  const set = (k: string, v: string | number | boolean | null) => setF({ ...f, [k]: v });
  const value = () => Object.fromEntries(fields.map((x) => [x.key, x.type === "number" ? Number(f[x.key] ?? 0) : x.type === "select" && f[x.key] === "" ? null : (f[x.key] ?? null)])) as Row;
  return (
    <div className={cn("flex flex-wrap items-end gap-2 rounded-xl p-2.5 text-xs", isNew ? "border border-dashed border-white/20" : "glass")}>
      {fields.map((x) => (
        <label key={x.key} className={cn("flex flex-col gap-0.5", x.type === "textarea" && "w-full", x.type === "checkbox" && "h-8 flex-row items-center gap-1.5")}>
          {x.type === "checkbox" ? (
            <>
              <input type="checkbox" checked={Boolean(f[x.key])} onChange={(e) => set(x.key, e.target.checked)} /> {x.label}
            </>
          ) : (
            <>
              <span className="text-[0.65rem] text-muted-foreground uppercase">{x.label}</span>
              {x.type === "textarea" ? (
                <textarea className={textareaClass} rows={2} value={String(f[x.key] ?? "")} onChange={(e) => set(x.key, e.target.value)} />
              ) : x.type === "select" ? (
                <select className={cn(inputClass, "h-8", x.width ?? "w-36")} value={String(f[x.key] ?? "")} onChange={(e) => set(x.key, e.target.value)}>
                  {x.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : x.type === "color" ? (
                <input type="color" className="h-8 w-12 cursor-pointer rounded border border-input bg-transparent" value={String(f[x.key] ?? "#b8a8e4")} onChange={(e) => set(x.key, e.target.value)} />
              ) : (
                <input className={cn(inputClass, "h-8", x.width ?? (x.type === "number" ? "w-20" : "w-48"))} type={x.type} value={String(f[x.key] ?? "")} onChange={(e) => set(x.key, e.target.value)} />
              )}
            </>
          )}
        </label>
      ))}
      <span className="ml-auto flex gap-1">
        <Button type="button" size="xs" disabled={busy} onClick={async () => (await onSave(value())) && isNew && setF(row)}>
          {isNew ? <Plus /> : <Save />} {isNew ? "Aggiungi" : "Salva"}
        </Button>
        {onDelete && (
          <Button type="button" size="xs" variant="ghost" className="text-destructive" disabled={busy} onClick={() => window.confirm("Eliminare questa voce?") && onDelete()} aria-label="Elimina">
            <Trash2 />
          </Button>
        )}
      </span>
    </div>
  );
}

function BgCatalog() {
  return (
    <CatalogEditor
      table="fame_bg_items"
      order={["category", "sort_order", "name"]}
      hint="Le voci che i giocatori scelgono in creazione. Costo PF = quanto la pagano con i Punti Fama; Fama e Infamia = quanto li rende famosi; Follower = follower fissi sul social (es. Influencer 50.000). Cambiandoli, cambiano per tutti quelli che le hanno. Disattivata = non si sceglie più, chi l'ha già la tiene."
      fields={[
        { key: "name", label: "Nome", type: "text", width: "w-64" },
        { key: "category", label: "Categoria", type: "text", width: "w-32" },
        { key: "cost_pf", label: "Costo PF", type: "number" },
        { key: "fame_points", label: "Fama", type: "number" },
        { key: "infamy_points", label: "Infamia", type: "number" },
        { key: "social_followers", label: "Follower", type: "number" },
        { key: "sort_order", label: "Ordine", type: "number" },
        { key: "active", label: "Attiva", type: "checkbox" },
        { key: "description", label: "Descrizione", type: "textarea" },
      ]}
      empty={{ name: "", category: "Altro", cost_pf: 1, fame_points: 5, infamy_points: 0, social_followers: 0, sort_order: 0, active: true, description: "" }}
    />
  );
}

function useRarities() {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<Rarity[]>([]);
  useEffect(() => {
    supabase
      .from("fame_rarities")
      .select("*")
      .order("sort_order")
      .then(({ data }) => setList((data ?? []) as Rarity[]));
  }, [supabase]);
  return list;
}

function BadgeCatalog() {
  const rarities = useRarities();
  return (
    <CatalogEditor
      key={rarities.length}
      table="fame_badges"
      order={["sort_order", "name"]}
      hint="Icona: un'emoji (🏆) oppure un link https a un'immagine. Unico = si dà una volta sola allo stesso personaggio. Punti negativi = tolgono fama."
      fields={[
        { key: "icon", label: "Icona", type: "text", width: "w-24" },
        { key: "name", label: "Nome", type: "text", width: "w-56" },
        { key: "points", label: "Punti", type: "number" },
        {
          key: "kind",
          label: "Tipo",
          type: "select",
          width: "w-28",
          options: [
            { value: "fama", label: "Fama" },
            { value: "infamia", label: "Infamia" },
          ],
        },
        { key: "rarity_id", label: "Rarità", type: "select", options: [{ value: "", label: "—" }, ...rarities.map((r) => ({ value: r.id, label: r.name }))] },
        { key: "sort_order", label: "Ordine", type: "number" },
        { key: "is_unique", label: "Unico", type: "checkbox" },
        { key: "active", label: "Attivo", type: "checkbox" },
        { key: "description", label: "Descrizione", type: "textarea" },
      ]}
      empty={{ icon: "🏅", name: "", points: 1, kind: "fama", rarity_id: "", sort_order: 0, is_unique: true, active: true, description: "" }}
    />
  );
}

function RarityCatalog() {
  return (
    <CatalogEditor
      table="fame_rarities"
      order={["sort_order"]}
      hint="La rarità dà il colore della cornice del badge in scheda."
      fields={[
        { key: "name", label: "Nome", type: "text" },
        { key: "color", label: "Colore", type: "color" },
        { key: "sort_order", label: "Ordine", type: "number" },
      ]}
      empty={{ name: "", color: "#b8a8e4", sort_order: 0 }}
    />
  );
}

function LevelsCatalog() {
  const fields: Field[] = [
    { key: "icon", label: "Icona", type: "text", width: "w-24" },
    { key: "name", label: "Nome", type: "text" },
    { key: "min_points", label: "Da punti", type: "number" },
    { key: "color", label: "Colore", type: "color" },
    { key: "sort_order", label: "Ordine", type: "number" },
    { key: "gossip_bonus", label: "Pettegolezzi +", type: "number" },
    { key: "description", label: "Come si gioca", type: "textarea" },
  ];
  // solo la fama fa crescere il pubblico del social
  const fameFields: Field[] = [
    ...fields,
    { key: "min_followers", label: "Oppure follower", type: "number", width: "w-28" },
    { key: "social_followers_day", label: "Follower PNG al giorno", type: "number", width: "w-24" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Ogni livello parte dalla sua soglia di punti; il primo dovrebbe essere da 0. Icona: emoji o link https (vuota = niente icona nei presenti). «Come si gioca» compare in scheda → Fama.
        Pettegolezzi +: quanto si somma al dado dei pettegolezzi a fine giocata in una chat pubblica (vale il più alto tra fama e infamia).
        Oppure follower: con questi follower sul social (tutti, anche comprati) si è almeno a questo livello anche con meno punti; 0 = solo con i punti.
      </p>
      <h3 className="font-heading text-lg tracking-wide text-peach">Fama</h3>
      <CatalogEditor
        table="fame_levels"
        filter={{ key: "kind", value: "fama" }}
        order={["min_points"]}
        fields={fameFields}
        hint="Follower PNG al giorno: quanto pubblico guadagna ogni giorno sul social chi è a questo livello (se pubblica)."
        empty={{ kind: "fama", icon: "", name: "", min_points: 0, color: "#f2b39c", sort_order: 0, gossip_bonus: 0, description: "", min_followers: 0, social_followers_day: 0 }}
      />
      <h3 className="font-heading text-lg tracking-wide text-flamingo">Infamia</h3>
      <CatalogEditor table="fame_levels" filter={{ key: "kind", value: "infamia" }} order={["min_points"]} fields={fields} empty={{ kind: "infamia", icon: "", name: "", min_points: 0, color: "#ec8cb8", sort_order: 0, gossip_bonus: 0, description: "" }} />
    </div>
  );
}

/** Pacchetti del social: follower comprati e campagne sponsorizzate */
function SocialPackages() {
  return (
    <CatalogEditor
      table="social_packages"
      order={["sort_order", "name"]}
      hint="Follower = quanti follower comprati dà subito (non calano mai e crescono ogni giorno con la fama, vedi Impostazioni; possono far scoprire l'acquisto). Campagna = per quanti giorni moltiplica crescita del pubblico e like dei post nuovi. Prezzo in dollari dal conto. Crescita per livello in Livelli, il resto in Impostazioni."
      fields={[
        { key: "name", label: "Nome", type: "text", width: "w-56" },
        {
          key: "kind",
          label: "Tipo",
          type: "select",
          width: "w-32",
          options: [
            { value: "follower", label: "Follower" },
            { value: "campagna", label: "Campagna" },
          ],
        },
        { key: "amount", label: "Follower", type: "number", width: "w-24" },
        { key: "days", label: "Giorni", type: "number" },
        { key: "multiplier", label: "Moltiplicatore", type: "number" },
        { key: "price", label: "Prezzo $", type: "number", width: "w-24" },
        { key: "sort_order", label: "Ordine", type: "number" },
        { key: "active", label: "In vendita", type: "checkbox" },
        { key: "description", label: "Descrizione", type: "textarea" },
      ]}
      empty={{ name: "", kind: "follower", amount: 1000, days: 0, multiplier: 1, price: 100, sort_order: 0, active: true, description: "" }}
    />
  );
}

/* ------------------------------ Registro ------------------------------ */

type LogRow = { id: number; action: string; detail: string; points: number | null; created_at: string; characters: { name: string } | null; profiles: { username: string } | null };

function LogTab() {
  const supabase = useMemo(() => createClient(), []);
  const characters = useCharacters();
  const [id, setId] = useState("");
  const [rows, setRows] = useState<LogRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    let q = supabase.from("fame_log").select("id, action, detail, points, created_at, characters(name), profiles(username)").order("created_at", { ascending: false }).limit(300);
    if (id) q = q.eq("character_id", id);
    q.then(({ data }) => alive && setRows((data ?? []) as unknown as LogRow[]));
    return () => {
      alive = false;
    };
  }, [supabase, id]);
  return (
    <div className="flex flex-col gap-2">
      <select className={cn(inputClass, "sm:max-w-sm")} value={id} onChange={(e) => setId(e.target.value)} aria-label="Filtra per personaggio">
        <option value="">Tutti i personaggi</option>
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {!rows ? (
        <Loader2 className="animate-spin text-muted-foreground" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna operazione.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap gap-x-2 rounded-lg bg-white/5 px-2.5 py-1.5">
              <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}</span>
              <strong>{r.characters?.name ?? "—"}</strong>
              <span className="text-peach">{r.action}</span>
              <span>{r.detail}</span>
              {r.points !== null && <span className="text-lavender">({signedPoints(r.points)})</span>}
              <span className="ml-auto text-muted-foreground">{r.profiles?.username ?? "sistema"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
