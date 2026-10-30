"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  ActiveToggle,
  DeleteButton,
  ErrorText,
  FieldLabel,
  MoveButtons,
  StatusPill,
  inputClass,
  textareaClass,
  useAdminAction,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { deleteOption, moveItem, saveOption, type OptionInput } from "@/lib/actions/admin";
import type { CreationOption, Skill } from "@/lib/types";
import { formatDollars } from "@/lib/bank";
import { cn } from "@/lib/utils";

const ALL_KINDS: { kind: CreationOption["kind"]; title: string; hint: string }[] = [
  { kind: "tenore", title: "Patrimonio", hint: "Scelta singola alla creazione: costo in PX, entrata e mantenimento mensili, quota iniziale sul conto." },
  { kind: "vantaggio", title: "Vantaggi", hint: "Costano PX (costo positivo)." },
  { kind: "svantaggio", title: "Svantaggi", hint: "Danno PX (costo negativo)." },
  { kind: "tratto", title: "Tratti", hint: "Hanno il loro costo in PX." },
];

type Props = {
  options: CreationOption[];
  skills: Skill[];
  usage: Record<string, number>;
  pxPerLevel: number;
  /** Quali elenchi mostrare (il Patrimonio ha la sua pagina) */
  kinds: CreationOption["kind"][];
};

export function OptionsManager({ options, skills, usage, pxPerLevel, kinds }: Props) {
  const KINDS = ALL_KINDS.filter((k) => kinds.includes(k.kind));
  const [kind, setKind] = useState<CreationOption["kind"]>(kinds[0]);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const { pending, error, execute } = useAdminAction();
  const list = options.filter((o) => o.kind === kind);
  const current = KINDS.find((k) => k.kind === kind)!;
  const nameOf = (id: string) => options.find((o) => o.id === id)?.name;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Riferimento per calibrare i costi: portare un&apos;abilità da 0 a 6 costa {(pxPerLevel * 6 * 7) / 2} PX.
      </p>
      <div className={cn("flex gap-1 overflow-x-auto", KINDS.length < 2 && "hidden")} role="tablist">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="tab"
            aria-selected={kind === k.kind}
            onClick={() => {
              setKind(k.kind);
              setEditing(null);
            }}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm",
              kind === k.kind ? "bg-flamingo/20 text-white shadow-[inset_0_0_0_1px_var(--flamingo)]" : "text-muted-foreground hover:bg-white/5",
            )}
          >
            {k.title} <span className="text-xs opacity-70">({options.filter((o) => o.kind === k.kind).length})</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{current.hint}</p>
      <ErrorText error={error} />

      {editing === "new" ? (
        <OptionForm kind={kind} options={options} skills={skills} onDone={() => setEditing(null)} />
      ) : (
        <Button type="button" onClick={() => setEditing("new")} className="w-fit rounded-full">
          <Plus /> Nuova voce in {current.title}
        </Button>
      )}

      <ul className="flex flex-col gap-2">
        {list.map((o, i) =>
          editing === o.id ? (
            <li key={o.id}>
              <OptionForm option={o} kind={kind} options={options} skills={skills} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={o.id} className="glass flex items-center gap-2 rounded-2xl p-3">
              <MoveButtons first={i === 0} last={i === list.length - 1} disabled={pending} onMove={(d) => execute(() => moveItem("creation_options", o.id, d))} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{o.name}</span>
                  <span className={cn("text-xs font-semibold", o.cost_px > 0 ? "text-peach" : o.cost_px < 0 ? "text-mint" : "text-muted-foreground")}>
                    {o.cost_px > 0 ? `costa ${o.cost_px} PX` : o.cost_px < 0 ? `dà ${-o.cost_px} PX` : "0 PX"}
                  </span>
                  {o.roll_modifier !== null && o.roll_modifier !== 0 && (
                    <span className="text-xs text-lavender">
                      {o.roll_modifier > 0 ? "+" : ""}
                      {o.roll_modifier} ai tiri{o.roll_skill_id ? ` di ${skills.find((s) => s.id === o.roll_skill_id)?.name ?? "?"}` : ""}
                    </span>
                  )}
                  {o.kind === "tenore" && (
                    <span className="text-xs text-sand">
                      entrata {formatDollars(o.salary)} · mantenimento {formatDollars(o.upkeep)} · iniziale {formatDollars(o.initial_amount)}
                    </span>
                  )}
                  <StatusPill active={o.active} />
                </p>
                <p className="line-clamp-1 text-xs text-muted-foreground">{o.description}</p>
                <p className="text-xs text-muted-foreground">
                  Scelta da {usage[o.id] ?? 0} personaggi
                  {o.incompatible_ids.length > 0 && ` · incompatibile con ${o.incompatible_ids.map(nameOf).filter(Boolean).join(", ")}`}
                </p>
              </div>
              <button type="button" onClick={() => setEditing(o.id)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label={`Modifica ${o.name}`}>
                <Pencil className="size-4" />
              </button>
              <DeleteButton what={o.name} disabled={pending} onConfirm={() => execute(() => deleteOption(o.id))} />
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function OptionForm({
  option,
  kind,
  options,
  skills,
  onDone,
}: {
  option?: CreationOption;
  kind: CreationOption["kind"];
  options: CreationOption[];
  skills: Skill[];
  onDone: () => void;
}) {
  const [form, setForm] = useState<OptionInput>({
    id: option?.id,
    kind: option?.kind ?? kind,
    name: option?.name ?? "",
    costPx: option?.cost_px ?? 0,
    description: option?.description ?? "",
    rollModifier: option?.roll_modifier ?? null,
    rollSkillId: option?.roll_skill_id ?? null,
    incompatibleIds: option?.incompatible_ids ?? [],
    salary: option?.salary ?? 0,
    upkeep: option?.upkeep ?? 0,
    initialAmount: option?.initial_amount ?? 0,
    active: option?.active ?? true,
    scope: option?.scope ?? "generale",
    subgroup: option?.subgroup ?? "",
    maxLevel: option?.max_level ?? 1,
    requiresChoice: option?.requires_choice ?? null,
    choiceHint: option?.choice_hint ?? "",
    effects: JSON.stringify(option?.effects ?? [], null, 1),
    isOrigin: option?.is_origin ?? false,
    secretDefault: option?.secret_default ?? false,
    available: option?.available ?? true,
  });
  const { pending, error, execute } = useAdminAction();
  const others = options.filter((o) => o.id !== option?.id);

  function toggleIncompatible(id: string) {
    setForm((f) => ({
      ...f,
      incompatibleIds: f.incompatibleIds.includes(id) ? f.incompatibleIds.filter((x) => x !== id) : [...f.incompatibleIds, id],
    }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(() => saveOption(form), onDone);
      }}
      className="glass flex flex-col gap-3 rounded-2xl border-flamingo/40 p-4"
    >
      <p className="font-heading text-xl tracking-wide text-peach">{option ? `Modifica ${option.name}` : "Nuova voce"}</p>
      <ErrorText error={error} />
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem]">
        <FieldLabel label="Nome">
          <input className={inputClass} value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </FieldLabel>
        <FieldLabel label="Tipo">
          <select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as OptionInput["kind"] })}>
            <option value="tenore">Patrimonio</option>
            <option value="vantaggio">Vantaggio</option>
            <option value="svantaggio">Svantaggio</option>
            <option value="tratto">Tratto</option>
          </select>
        </FieldLabel>
        <FieldLabel label="Costo in PX" hint={form.kind === "tenore" ? "Alla creazione del personaggio" : "Negativo se dà PX"}>
          <input className={inputClass} type="number" min={-1000} max={1000} value={form.costPx} onChange={(e) => setForm({ ...form, costPx: Number(e.target.value) })} />
        </FieldLabel>
      </div>
      {form.kind === "tenore" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <FieldLabel label="Entrata mensile in $" hint="Arriva da sola ogni mese">
            <input className={inputClass} type="number" min={0} max={1000000} value={form.salary} onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })} />
          </FieldLabel>
          <FieldLabel label="Mantenimento mensile in $" hint="Uscita automatica ogni mese">
            <input className={inputClass} type="number" min={0} max={1000000} value={form.upkeep} onChange={(e) => setForm({ ...form, upkeep: Number(e.target.value) })} />
          </FieldLabel>
          <FieldLabel label="Quota iniziale in $" hint="Sul conto all'approvazione">
            <input className={inputClass} type="number" min={0} max={100000000} value={form.initialAmount} onChange={(e) => setForm({ ...form, initialAmount: Number(e.target.value) })} />
          </FieldLabel>
        </div>
      )}
      <FieldLabel label="Descrizione">
        <textarea className={textareaClass} value={form.description} maxLength={500} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </FieldLabel>
      {form.kind !== "tenore" && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <FieldLabel label="Livello della voce">
              <select className={inputClass} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as OptionInput["scope"] })}>
                <option value="generale">Generale (tiri in chat)</option>
                <option value="ambientazione">Ambientazione (narrativa)</option>
                <option value="accademica">Accademica (esami)</option>
                <option value="sportiva">Sportiva (gare)</option>
              </select>
            </FieldLabel>
            <FieldLabel label="Sottogruppo" hint="legami, risorse, ruoli, interpretativo, provenienza">
              <input className={inputClass} value={form.subgroup} maxLength={30} onChange={(e) => setForm({ ...form, subgroup: e.target.value })} />
            </FieldLabel>
            <FieldLabel label="Livelli" hint="Costo × livello (es. Contatti 1–3)">
              <input className={inputClass} type="number" min={1} max={5} value={form.maxLevel} onChange={(e) => setForm({ ...form, maxLevel: Number(e.target.value) })} />
            </FieldLabel>
            <FieldLabel label="Scelta richiesta">
              <select className={inputClass} value={form.requiresChoice ?? ""} onChange={(e) => setForm({ ...form, requiresChoice: (e.target.value || null) as OptionInput["requiresChoice"] })}>
                <option value="">Nessuna</option>
                <option value="testo">Testo libero</option>
                <option value="dipartimento">Dipartimento</option>
                <option value="master">La decide il Master</option>
              </select>
            </FieldLabel>
          </div>
          {form.requiresChoice && (
            <FieldLabel label="Cosa indicare" hint="es. l'oggetto della fobia">
              <input className={inputClass} value={form.choiceHint} maxLength={80} onChange={(e) => setForm({ ...form, choiceHint: e.target.value })} />
            </FieldLabel>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.available} onChange={(e) => setForm({ ...form, available: e.target.checked })} /> Selezionabile alla creazione
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.secretDefault} onChange={(e) => setForm({ ...form, secretDefault: e.target.checked })} /> Segreta (solo giocatore e staff)
            </label>
            {form.kind === "tratto" && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.isOrigin} onChange={(e) => setForm({ ...form, isOrigin: e.target.checked })} /> Provenienza
              </label>
            )}
          </div>
          <FieldLabel
            label="Effetti (JSON)"
            hint='Es. [{"type":"roll_modifier","value":2,"when":{"category":["percezione"]}}] · situazionale: "situational":true,"label":"di notte" · tipi: roll_modifier, crit_range, reroll, forced_reroll, cd_modifier, credit_limit, narrative, narrative_privilege, access, linked_npc…'
          >
            <textarea className={cn(textareaClass, "font-mono text-xs")} rows={5} value={form.effects} onChange={(e) => setForm({ ...form, effects: e.target.value })} />
          </FieldLabel>
        </>
      )}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <FieldLabel label="Effetto sui tiri" hint="Da −3 a +3 (facoltativo)">
          <select
            className={inputClass}
            value={form.rollModifier ?? ""}
            onChange={(e) => setForm({ ...form, rollModifier: e.target.value === "" ? null : Number(e.target.value) })}
          >
            <option value="">Nessuno</option>
            {[-3, -2, -1, 1, 2, 3].map((v) => (
              <option key={v} value={v}>
                {v > 0 ? `+${v}` : v}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="Su quale abilità" hint="Vuoto = vale per tutti i tiri">
          <select className={inputClass} value={form.rollSkillId ?? ""} onChange={(e) => setForm({ ...form, rollSkillId: e.target.value || null })} disabled={form.rollModifier === null}>
            <option value="">Tutti i tiri</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FieldLabel>
      </div>
      {others.length > 0 && (
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1 font-medium">Incompatibile con (facoltativo)</legend>
          <div className="flex flex-wrap gap-1.5">
            {others.map((o) => {
              const on = form.incompatibleIds.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleIncompatible(o.id)}
                  className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-destructive/60 bg-destructive/15 text-destructive" : "border-white/15 text-muted-foreground")}
                >
                  {o.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      <ActiveToggle checked={form.active} onChange={(active) => setForm({ ...form, active })} label="Attiva" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Annulla
        </Button>
        <Button type="submit" disabled={pending} className="rounded-full px-6">
          {pending ? "Salvataggio…" : "Salva"}
        </Button>
      </div>
    </form>
  );
}
