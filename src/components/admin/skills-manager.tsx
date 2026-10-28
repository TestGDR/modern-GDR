"use client";

import { useState } from "react";
import { AlertTriangle, Pencil, Plus, Search } from "lucide-react";
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
import { deleteSkill, moveItem, saveSkill, type SkillInput } from "@/lib/actions/admin";
import type { Attribute, Skill } from "@/lib/types";

const CATEGORIES = ["Studio", "Sport", "Arti", "Sociale", "Pratico"] as const;

type Props = { skills: Skill[]; attributes: Attribute[]; usage: Record<string, number> };

export function SkillsManager({ skills, attributes, usage }: Props) {
  const [query, setQuery] = useState("");
  const [attrFilter, setAttrFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const { pending, error, execute } = useAdminAction();
  const attrOf = (id: string) => attributes.find((a) => a.id === id);

  const q = query.trim().toLowerCase();
  const visible = skills.filter(
    (s) =>
      (!q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) &&
      (!attrFilter || s.attribute_id === attrFilter) &&
      (!catFilter || s.category === catFilter),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_10rem]">
        <label className="relative">
          <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
          <input className={`${inputClass} pl-9`} placeholder="Cerca un'abilità…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <select className={inputClass} value={attrFilter} onChange={(e) => setAttrFilter(e.target.value)} aria-label="Filtra per caratteristica">
          <option value="">Tutte le caratteristiche</option>
          {attributes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name}
            </option>
          ))}
        </select>
        <select className={inputClass} value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="Filtra per categoria">
          <option value="">Tutte le categorie</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <ErrorText error={error} />

      {editing === "new" ? (
        <SkillForm attributes={attributes} usage={0} onDone={() => setEditing(null)} defaultAttribute={attrFilter || attributes[0]?.id} />
      ) : (
        <Button type="button" onClick={() => setEditing("new")} className="w-fit rounded-full">
          <Plus /> Nuova abilità
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        {visible.length} abilità su {skills.length}. Un&apos;abilità posseduta da qualche personaggio non si elimina: si disattiva.
      </p>

      <ul className="flex flex-col gap-2">
        {visible.map((s) => {
          const siblings = skills.filter((x) => x.attribute_id === s.attribute_id);
          const index = siblings.findIndex((x) => x.id === s.id);
          const attr = attrOf(s.attribute_id);
          return editing === s.id ? (
            <li key={s.id}>
              <SkillForm skill={s} attributes={attributes} usage={usage[s.id] ?? 0} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={s.id} className="glass flex items-center gap-2 rounded-2xl p-3">
              <MoveButtons first={index === 0} last={index === siblings.length - 1} disabled={pending} onMove={(d) => execute(() => moveItem("skills", s.id, d))} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-white/10 px-1.5 text-xs font-semibold text-peach">{attr?.code ?? "?"}</span>
                  <span className="font-medium">{s.name}</span>
                  {s.category && <span className="text-xs text-lavender">{s.category}</span>}
                  <StatusPill active={s.active} />
                </p>
                <p className="line-clamp-1 text-xs text-muted-foreground">{s.description}</p>
                <p className="text-xs text-muted-foreground">Posseduta da {usage[s.id] ?? 0} personaggi</p>
              </div>
              <button type="button" onClick={() => setEditing(s.id)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label={`Modifica ${s.name}`}>
                <Pencil className="size-4" />
              </button>
              <DeleteButton what={`l'abilità ${s.name}`} disabled={pending} onConfirm={() => execute(() => deleteSkill(s.id))} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SkillForm({
  skill,
  attributes,
  usage,
  onDone,
  defaultAttribute,
}: {
  skill?: Skill;
  attributes: Attribute[];
  usage: number;
  onDone: () => void;
  defaultAttribute?: string;
}) {
  const [form, setForm] = useState<SkillInput>({
    id: skill?.id,
    attributeId: skill?.attribute_id ?? defaultAttribute ?? "",
    name: skill?.name ?? "",
    description: skill?.description ?? "",
    category: skill?.category ?? null,
    active: skill?.active ?? true,
  });
  const { pending, error, execute } = useAdminAction();
  const attributeChanged = !!skill && form.attributeId !== skill.attribute_id;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (attributeChanged && usage > 0 && !window.confirm(`Cambiare la caratteristica cambia i tiri futuri di ${usage} personaggi. Continuare?`)) return;
        execute(() => saveSkill(form), onDone);
      }}
      className="glass flex flex-col gap-3 rounded-2xl border-flamingo/40 p-4"
    >
      <p className="font-heading text-xl tracking-wide text-peach">{skill ? `Modifica ${skill.name}` : "Nuova abilità"}</p>
      <ErrorText error={error} />
      <FieldLabel label="Nome">
        <input className={inputClass} value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </FieldLabel>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldLabel label="Caratteristica collegata">
          <select className={inputClass} value={form.attributeId} onChange={(e) => setForm({ ...form, attributeId: e.target.value })} required>
            {attributes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="Categoria (facoltativa)">
          <select className={inputClass} value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value || null })}>
            <option value="">— Nessuna —</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </FieldLabel>
      </div>
      {attributeChanged && usage > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-peach/10 px-3 py-2 text-sm text-peach">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Cambiando la caratteristica cambiano i tiri futuri dei {usage} personaggi che hanno questa abilità.
        </p>
      )}
      <FieldLabel label="Descrizione" hint="Cosa copre, con esempi">
        <textarea className={textareaClass} value={form.description} maxLength={500} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </FieldLabel>
      <ActiveToggle checked={form.active} onChange={(active) => setForm({ ...form, active })} />
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
