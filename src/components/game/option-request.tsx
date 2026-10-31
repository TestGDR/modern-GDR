"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { OptionChoice } from "@/components/creation/option-choice";
import { Button } from "@/components/ui/button";
import type { CharacterBuild, RulesData } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { parseSettings, traitCounts } from "@/lib/interlock";
import { createClient } from "@/lib/supabase/client";
import type { Character, CreationOption } from "@/lib/types";
import { cn } from "@/lib/utils";

// Voci nuove per un personaggio già approvato: una richiesta sola, pagata con
// i PX rimasti e approvata dallo staff (option_request_* nel database).

export type OptionRequest = {
  id: number;
  character_id: string;
  character_name: string;
  px: number;
  px_cost: number;
  note: string;
  status: "in_attesa" | "approvata" | "rifiutata";
  review_note: string;
  created_at: string;
  reviewed_at: string | null;
  items: { option_id: string; name: string; kind: string; scope: string; level: number; choice: string; cost: number; description: string }[];
};

const GROUPS: { key: string; title: string; filter: (o: CreationOption) => boolean }[] = [
  { key: "vantaggi", title: "Vantaggi", filter: (o) => o.kind === "vantaggio" && o.scope !== "ambientazione" },
  { key: "svantaggi", title: "Svantaggi", filter: (o) => o.kind === "svantaggio" && o.scope !== "ambientazione" },
  { key: "tratti", title: "Tratti", filter: (o) => o.kind === "tratto" && !o.is_origin && o.scope !== "ambientazione" },
  { key: "ambientazione", title: "Ambientazione", filter: (o) => o.scope === "ambientazione" && !o.is_origin },
  { key: "provenienza", title: "Provenienza", filter: (o) => o.is_origin },
];

const pxLabel = (n: number) => (n > 0 ? `−${n} PX` : n < 0 ? `+${-n} PX` : "0 PX");

/** Le voci di una richiesta (per scheda e gestione) */
export function RequestItems({ request }: { request: OptionRequest }) {
  return (
    <ul className="flex flex-col gap-1">
      {request.items.map((it) => (
        <li key={it.option_id} className="flex items-baseline justify-between gap-2 text-sm">
          <span>
            {it.name}
            {it.level > 1 && <span className="ml-1 text-xs text-peach">livello {it.level}</span>}
            {it.choice && <span className="ml-1 text-xs text-lavender">· {it.choice}</span>}
          </span>
          <span className={cn("shrink-0 text-xs", it.cost > 0 ? "text-peach" : it.cost < 0 ? "text-mint" : "text-muted-foreground")}>{pxLabel(it.cost)}</span>
        </li>
      ))}
    </ul>
  );
}

export function OptionRequestPanel({ character, rules, build }: { character: Character; rules: RulesData; build: CharacterBuild }) {
  const supabase = useMemo(() => createClient(), []);
  const [requests, setRequests] = useState<OptionRequest[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("option_requests_list", { p_character: character.id });
    setRequests((data ?? []) as OptionRequest[]);
  }, [supabase, character.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  if (!requests) return null;
  const pending = requests.find((r) => r.status === "in_attesa");
  const approved = requests.find((r) => r.status === "approvata");
  const rejected = requests.find((r) => r.status === "rifiutata");

  async function cancel(id: number) {
    setError(null);
    const { error: e } = await supabase.rpc("option_request_cancel", { p_request: id });
    if (e) setError(e.message);
    load();
  }

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-3">
      <h3 className="flex items-center gap-2 font-heading text-lg tracking-wide text-peach">
        <Sparkles className="size-4" /> Voci nuove
      </h3>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {approved ? (
        <p className="text-sm text-muted-foreground">Hai già aggiunto le tue voci nuove il {formatDate(approved.reviewed_at ?? approved.created_at)}: ora le cambia solo lo staff.</p>
      ) : pending ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Richiesta in attesa dello staff ({pxLabel(pending.px_cost)}).
          </p>
          <RequestItems request={pending} />
          <Button type="button" size="sm" variant="ghost" className="self-start rounded-full" onClick={() => cancel(pending.id)}>
            Ritira la richiesta
          </Button>
        </div>
      ) : open ? (
        <RequestForm
          character={character}
          rules={rules}
          build={build}
          onDone={() => {
            setOpen(false);
            load();
          }}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Puoi aggiungere <strong>una volta</strong> voci del catalogo nuovo, pagandole con i PX che ti restano ({character.px} PX). Gli svantaggi ne danno. Le approva lo staff.
          </p>
          {rejected && (
            <p className="text-xs text-destructive">
              L&apos;ultima richiesta non è stata approvata{rejected.review_note ? `: ${rejected.review_note}` : "."}
            </p>
          )}
          <Button type="button" size="sm" className="self-start rounded-full" onClick={() => setOpen(true)}>
            <Sparkles /> Scegli le voci nuove
          </Button>
        </div>
      )}
    </section>
  );
}

function RequestForm({
  character,
  rules,
  build,
  onDone,
  onCancel,
}: {
  character: Character;
  rules: RulesData;
  build: CharacterBuild;
  onDone: () => void;
  onCancel: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [group, setGroup] = useState(GROUPS[0].key);
  const [picked, setPicked] = useState<Record<string, { level: number; choice: string }>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settings = parseSettings(rules.settings);
  const owned = new Set(build.optionIds);
  const pickedOptions = rules.options.filter((o) => o.id in picked);
  const cost = pickedOptions.reduce((s, o) => s + o.cost_px * picked[o.id].level, 0);
  const counts = traitCounts([...rules.options.filter((o) => owned.has(o.id)), ...pickedOptions], settings);
  const current = GROUPS.find((g) => g.key === group) ?? GROUPS[0];
  const items = rules.options.filter((o) => o.kind !== "tenore" && o.active && o.available && !owned.has(o.id) && current.filter(o));
  const blockedBy = (o: CreationOption) =>
    [...owned, ...Object.keys(picked)].find((id) => id !== o.id && (o.incompatible_ids.includes(id) || rules.options.find((x) => x.id === id)?.incompatible_ids.includes(o.id)));

  function toggle(o: CreationOption) {
    setPicked((p) => {
      const next = { ...p };
      if (o.id in next) delete next[o.id];
      else next[o.id] = { level: 1, choice: "" };
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const payload = pickedOptions.map((o) => ({ option_id: o.id, level: picked[o.id].level, choice: picked[o.id].choice.trim() }));
    const { error: e } = await supabase.rpc("option_request_submit", { p_character: character.id, p_items: payload, p_note: note.trim() });
    setBusy(false);
    if (e) return setError(e.message);
    onDone();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Scelte: <strong className="text-foreground">{pickedOptions.length}</strong> · costo{" "}
        <strong className={cost > character.px ? "text-destructive" : "text-mint"}>{pxLabel(cost)}</strong> · ti restano {character.px - cost} PX
      </p>
      <p className="flex flex-wrap gap-1.5 text-[0.7rem]">
        {counts.filter(([, n]) => n > 0).map(([label, n, max]) => (
          <span key={label} className={cn("rounded-full px-2 py-0.5", n > max ? "bg-destructive/20 text-destructive" : "bg-white/10")}>
            {label} {n}/{max}
          </span>
        ))}
      </p>
      <nav className="flex flex-wrap gap-1 rounded-2xl bg-white/5 p-1" aria-label="Gruppi di voci">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setGroup(g.key)}
            aria-current={group === g.key ? "page" : undefined}
            className={cn("rounded-full px-3 py-1.5 text-xs", group === g.key ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:bg-white/5")}
          >
            {g.title}
          </button>
        ))}
      </nav>
      <ul className="grid max-h-80 gap-2 overflow-y-auto pr-1 @lg:grid-cols-2">
        {items.map((o) => {
          const sel = o.id in picked;
          const blocked = !sel && blockedBy(o);
          const d = picked[o.id];
          const c = o.cost_px * (d?.level ?? 1);
          return (
            <li key={o.id} className={cn("rounded-xl border", sel ? "border-flamingo bg-flamingo/15" : "border-white/10 bg-night/30")}>
              <button type="button" onClick={() => toggle(o)} disabled={!!blocked} aria-pressed={sel} className="flex w-full items-start gap-2 p-2.5 text-left disabled:opacity-40">
                <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded border", sel ? "border-flamingo bg-flamingo" : "border-white/30")}>
                  {sel && <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2 text-sm font-medium">
                    {o.name}
                    <span className={cn("shrink-0 text-xs", c > 0 ? "text-peach" : c < 0 ? "text-mint" : "text-muted-foreground")}>
                      {pxLabel(c)}
                      {o.max_level > 1 && !sel ? " a livello" : ""}
                    </span>
                  </span>
                  {o.description && <span className="block text-xs text-muted-foreground">{o.description}</span>}
                  {blocked && <span className="block text-xs text-destructive">Incompatibile con {rules.options.find((x) => x.id === blocked)?.name}</span>}
                </span>
              </button>
              {sel && (o.max_level > 1 || (o.requires_choice && o.requires_choice !== "master")) && (
                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-2.5 py-2 text-xs">
                  {o.max_level > 1 && (
                    <span className="flex items-center gap-1">
                      Livello
                      {Array.from({ length: o.max_level }, (_, i) => i + 1).map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setPicked((p) => ({ ...p, [o.id]: { ...p[o.id], level: l } }))}
                          aria-pressed={d.level === l}
                          className={cn("size-7 rounded-full border", d.level === l ? "border-flamingo bg-flamingo text-white" : "border-white/20 hover:bg-white/10")}
                        >
                          {l}
                        </button>
                      ))}
                    </span>
                  )}
                  {o.requires_choice && o.requires_choice !== "master" && (
                    <OptionChoice option={o} value={d.choice} onChange={(v) => setPicked((p) => ({ ...p, [o.id]: { ...p[o.id], choice: v } }))} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <textarea
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Una nota per lo staff: perché queste voci, come entrano nella storia del personaggio…"
        className="min-h-16 rounded-xl border border-input bg-night/40 p-2 text-sm outline-none"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="rounded-full" disabled={busy || pickedOptions.length === 0 || cost > character.px} onClick={submit}>
          {busy && <Loader2 className="animate-spin" />} Invia allo staff
        </Button>
        <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </div>
  );
}
