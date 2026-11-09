"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { formatDollars } from "@/lib/bank";
import type { Attribute, CreationOption, Skill } from "@/lib/types";
import { cn } from "@/lib/utils";

// Utility → Regole del gioco: vantaggi, svantaggi e tratti, e le abilità, da consultare.
// I dati arrivano dalla pagina (una lettura); ricerca e linguette lavorano nel browser.

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-full border border-white/15 bg-night/30 px-3 text-sm">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
    </label>
  );
}

/* ------------------------------ Vantaggi, svantaggi e tratti ------------------------------ */

type Tab = { key: string; title: string; hint: string; filter: (o: CreationOption) => boolean };
const TABS: Tab[] = [
  { key: "vantaggi", title: "Vantaggi", hint: "Capacità o circostanze favorevoli: costano PX.", filter: (o) => o.kind === "vantaggio" && o.scope !== "ambientazione" && !o.is_origin },
  { key: "svantaggi", title: "Svantaggi", hint: "Debolezze o complicazioni: danno PX (fino a un massimo in tutto).", filter: (o) => o.kind === "svantaggio" && o.scope !== "ambientazione" && !o.is_origin },
  { key: "tratti", title: "Tratti", hint: "Carattere: un pro e un contro.", filter: (o) => o.kind === "tratto" && !o.is_origin && o.scope !== "ambientazione" },
  { key: "ambientazione", title: "Ambientazione", hint: "Legami, risorse, ruoli e privilegi narrativi: non cambiano i tiri, costano la metà.", filter: (o) => o.scope === "ambientazione" && !o.is_origin },
  { key: "provenienza", title: "Provenienza", hint: "Da dove vieni: un punto di partenza per il Master (una sola).", filter: (o) => o.is_origin },
  { key: "patrimonio", title: "Patrimonio", hint: "La fascia economica del personaggio (una sola).", filter: (o) => o.kind === "tenore" },
];
const SCOPE_LABEL: Record<CreationOption["scope"], string | null> = { generale: null, ambientazione: null, accademica: "Accademica", sportiva: "Sportiva" };
const SUBGROUP_LABEL: Record<string, string> = { legami: "Legami", risorse: "Risorse e luoghi", ruoli: "Ruoli e reputazione", interpretativo: "Interpretativo" };

/** Voce di background di fama (si sceglie con i Punti Fama in creazione) */
export type FameBgItem = {
  id: string;
  name: string;
  description: string;
  category: string;
  cost_pf: number;
  fame_points: number;
  infamy_points: number;
  social_followers: number;
};
export type FameRules = { pf: number; maxFame: number; maxFollowers: number };

const FAME_TAB = "fama";
const thousands = (n: number) => n.toLocaleString("it-IT");

function FameList({ items }: { items: FameBgItem[] }) {
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {items.map((i) => (
        <li key={i.id} className="flex flex-col gap-1 rounded-xl border border-white/10 bg-night/30 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{i.name}</span>
            <span className="shrink-0 text-xs font-semibold text-peach">costa {i.cost_pf} PF</span>
          </div>
          <div className="flex flex-wrap gap-1 text-[0.65rem]">
            <span className="rounded-full bg-white/10 px-2 py-0.5">{i.category}</span>
            {i.fame_points !== 0 && <span className="rounded-full bg-sand/20 px-2 py-0.5 text-sand">⭐ {i.fame_points > 0 ? "+" : ""}{i.fame_points} fama</span>}
            {i.infamy_points !== 0 && <span className="rounded-full bg-flamingo/20 px-2 py-0.5 text-flamingo">💬 {i.infamy_points > 0 ? "+" : ""}{i.infamy_points} infamia</span>}
            {i.social_followers > 0 && <span className="rounded-full bg-mint/20 px-2 py-0.5 text-mint">📱 {thousands(i.social_followers)} follower</span>}
          </div>
          {i.description && <p className="text-xs leading-relaxed whitespace-pre-line text-foreground/85">{i.description}</p>}
        </li>
      ))}
    </ul>
  );
}

export function TraitsReference({ options, fameItems = [], fameRules }: { options: CreationOption[]; fameItems?: FameBgItem[]; fameRules?: FameRules }) {
  const [tab, setTab] = useState(TABS[0].key);
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o.name])), [options]);
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const q = norm(query.trim());
  const fameTab = !q && tab === FAME_TAB;
  // con una ricerca si cerca in tutte le linguette
  const items = fameTab ? [] : options.filter((o) => (q ? true : current.filter(o)) && (!q || norm(`${o.name} ${o.description}`).includes(q)));
  const fameMatches = fameTab ? fameItems : q ? fameItems.filter((i) => norm(`${i.name} ${i.description} ${i.category}`).includes(q)) : [];

  return (
    <div className="flex flex-col gap-3">
      <SearchBox value={query} onChange={setQuery} placeholder="Cerca un vantaggio, uno svantaggio o un tratto…" />
      {!q && (
        <>
          <nav className="flex flex-wrap gap-1 rounded-2xl bg-white/5 p-1" aria-label="Gruppi di voci">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn("rounded-full px-3 py-1.5 text-xs", tab === t.key ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:bg-white/5")}
              >
                {t.title} <span className="text-muted-foreground">{options.filter(t.filter).length}</span>
              </button>
            ))}
            {fameItems.length > 0 && (
              <button
                type="button"
                onClick={() => setTab(FAME_TAB)}
                aria-current={fameTab ? "page" : undefined}
                className={cn("rounded-full px-3 py-1.5 text-xs", fameTab ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:bg-white/5")}
              >
                Background di fama <span className="text-muted-foreground">{fameItems.length}</span>
              </button>
            )}
          </nav>
          <p className="text-xs text-muted-foreground">
            {fameTab
              ? `Si scelgono in creazione (passaggio 3) con i Punti Fama${fameRules ? ` (${fameRules.pf})` : ""}: danno fama, infamia e follower al social${
                  fameRules ? `. Dal background al massimo ${fameRules.maxFame} di fama e ${thousands(fameRules.maxFollowers)} follower in tutto` : ""
                }. I Punti Fama non spesi diventano PX all'approvazione.`
              : current.hint}
          </p>
        </>
      )}
      {fameTab ? null : items.length === 0 && fameMatches.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna voce trovata.</p>
      ) : items.length === 0 ? null : (
        <ul className="grid gap-2 md:grid-cols-2">
          {items.map((o) => {
            const scope = SCOPE_LABEL[o.scope];
            const incompatible = [...new Set(o.incompatible_ids)].map((id) => byId.get(id)).filter(Boolean);
            return (
              <li key={o.id} className="flex flex-col gap-1 rounded-xl border border-white/10 bg-night/30 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{o.name}</span>
                  <span className={cn("shrink-0 text-xs font-semibold", o.cost_px > 0 ? "text-peach" : o.cost_px < 0 ? "text-mint" : "text-muted-foreground")}>
                    {o.cost_px > 0 ? `costa ${o.cost_px}` : o.cost_px < 0 ? `dà ${-o.cost_px}` : "0"} PX{o.max_level > 1 ? ` per livello (fino a ${o.max_level})` : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 text-[0.65rem]">
                  {q && <span className="rounded-full bg-white/10 px-2 py-0.5">{TABS.find((t) => t.filter(o))?.title}</span>}
                  {scope && <span className="rounded-full bg-lavender/20 px-2 py-0.5 text-lavender">{scope}</span>}
                  {o.subgroup && SUBGROUP_LABEL[o.subgroup] && <span className="rounded-full bg-sand/15 px-2 py-0.5 text-sand">{SUBGROUP_LABEL[o.subgroup]}</span>}
                  {o.secret_default && <span className="rounded-full bg-orchid/20 px-2 py-0.5 text-orchid">Segreto</span>}
                  {!o.available && <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-destructive">Non ancora selezionabile</span>}
                </div>
                {o.description && <p className="text-xs leading-relaxed whitespace-pre-line text-foreground/85">{o.description}</p>}
                {o.kind === "tenore" && (
                  <p className="text-xs text-sand">
                    Entrata {formatDollars(o.salary)} al mese · mantenimento {formatDollars(o.upkeep)} al mese · quota iniziale {formatDollars(o.initial_amount)}
                  </p>
                )}
                {o.choice_hint && <p className="text-[0.7rem] text-muted-foreground">Da scegliere: {o.choice_hint}</p>}
                {incompatible.length > 0 && <p className="text-[0.7rem] text-flamingo">Incompatibile con: {incompatible.join(", ")}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {/* voci di background di fama: nella loro linguetta o tra i risultati della ricerca */}
      {fameMatches.length > 0 && (
        <>
          {q && <h3 className="font-heading text-lg tracking-wide text-peach">Background di fama</h3>}
          <FameList items={fameMatches} />
        </>
      )}
    </div>
  );
}

/* ------------------------------ Abilità ------------------------------ */

export function SkillsReference({ attributes, skills }: { attributes: Attribute[]; skills: Skill[] }) {
  const [query, setQuery] = useState("");
  const q = norm(query.trim());
  const match = (s: Skill) => !q || norm(`${s.name} ${s.description} ${s.category ?? ""}`).includes(q);

  return (
    <div className="flex flex-col gap-4">
      <SearchBox value={query} onChange={setQuery} placeholder="Cerca un'abilità…" />
      <p className="text-xs text-muted-foreground">Ogni abilità dipende da una caratteristica: nei tiri si sommano caratteristica + abilità + d10. Un&apos;abilità non può superare la sua caratteristica.</p>
      {attributes.map((a) => {
        const list = skills.filter((s) => s.attribute_id === a.id && match(s));
        if (q && list.length === 0) return null;
        return (
          <section key={a.id} className="flex flex-col gap-2">
            <h3 className="flex items-baseline gap-2 border-b border-white/10 pb-1 font-heading text-xl tracking-wide text-peach">
              <span className="rounded-md bg-peach/20 px-1.5 font-sans text-xs font-bold tracking-normal">{a.code}</span>
              {a.name}
            </h3>
            {a.description && !q && <p className="text-xs text-muted-foreground">{a.description}</p>}
            {list.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nessuna abilità.</p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">
                {list.map((s) => (
                  <li key={s.id} className="flex flex-col gap-1 rounded-xl border border-white/10 bg-night/30 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{s.name}</span>
                      {s.category && <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem]">{s.category}</span>}
                    </div>
                    {s.description && <p className="text-xs leading-relaxed whitespace-pre-line text-foreground/85">{s.description}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
