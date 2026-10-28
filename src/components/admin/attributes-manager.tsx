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
import { deleteAttribute, moveItem, saveAttribute, type AttributeInput } from "@/lib/actions/admin";
import type { Attribute } from "@/lib/types";

type Props = {
  attributes: Attribute[];
  /** abilità collegate e personaggi che la usano, per caratteristica */
  skillCount: Record<string, number>;
  usage: Record<string, number>;
};

export function AttributesManager({ attributes, skillCount, usage }: Props) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const { pending, error, execute } = useAdminAction();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Le caratteristiche attive compaiono nella creazione, nella scheda e nei tiri. Una caratteristica con abilità o personaggi
        collegati non si elimina: si disattiva.
      </p>
      <ErrorText error={error} />

      {editing === "new" ? (
        <AttributeForm onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} />
      ) : (
        <Button type="button" onClick={() => setEditing("new")} className="w-fit rounded-full">
          <Plus /> Nuova caratteristica
        </Button>
      )}

      <ul className="flex flex-col gap-2">
        {attributes.map((a, i) =>
          editing === a.id ? (
            <li key={a.id}>
              <AttributeForm attribute={a} onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} />
            </li>
          ) : (
            <li key={a.id} className="glass flex items-center gap-2 rounded-2xl p-3">
              <MoveButtons
                first={i === 0}
                last={i === attributes.length - 1}
                disabled={pending}
                onMove={(d) => execute(() => moveItem("attributes", a.id, d))}
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-heading text-xl tracking-wide text-peach">{a.code}</span>
                  <span className="font-medium">{a.name}</span>
                  <StatusPill active={a.active} />
                </p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{a.description}</p>
                <p className="text-xs text-muted-foreground">
                  {skillCount[a.id] ?? 0} abilità · usata da {usage[a.id] ?? 0} personaggi
                </p>
              </div>
              <button type="button" onClick={() => setEditing(a.id)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label={`Modifica ${a.name}`}>
                <Pencil className="size-4" />
              </button>
              <DeleteButton what={`la caratteristica ${a.name}`} disabled={pending} onConfirm={() => execute(() => deleteAttribute(a.id))} />
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function AttributeForm({ attribute, onCancel, onSaved }: { attribute?: Attribute; onCancel: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<AttributeInput>({
    id: attribute?.id,
    code: attribute?.code ?? "",
    name: attribute?.name ?? "",
    description: attribute?.description ?? "",
    active: attribute?.active ?? true,
  });
  const { pending, error, execute } = useAdminAction();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(() => saveAttribute(form), onSaved);
      }}
      className="glass flex flex-col gap-3 rounded-2xl border-flamingo/40 p-4"
    >
      <p className="font-heading text-xl tracking-wide text-peach">{attribute ? `Modifica ${attribute.name}` : "Nuova caratteristica"}</p>
      <ErrorText error={error} />
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <FieldLabel label="Sigla" hint="Es. INT">
          <input className={inputClass} value={form.code} maxLength={6} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required />
        </FieldLabel>
        <FieldLabel label="Nome">
          <input className={inputClass} value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </FieldLabel>
      </div>
      <FieldLabel label="Descrizione" hint="Cosa copre ed esempi">
        <textarea className={textareaClass} value={form.description} maxLength={500} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </FieldLabel>
      <ActiveToggle checked={form.active} onChange={(active) => setForm({ ...form, active })} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annulla
        </Button>
        <Button type="submit" disabled={pending} className="rounded-full px-6">
          {pending ? "Salvataggio…" : "Salva"}
        </Button>
      </div>
    </form>
  );
}
