"use client";

import { useState } from "react";
import { Plus, Save } from "lucide-react";
import { ActiveToggle, DeleteButton, ErrorText, FieldLabel, MoveButtons, StatusPill, inputClass, textareaClass, useAdminAction } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { deleteTicketSection, moveTicketSection, saveTicketSection } from "@/lib/actions/tickets";
import type { TicketSection } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Sezioni dei ticket: nome, istruzioni per chi scrive, ordine, attiva */
export function TicketSectionsManager({ sections }: { sections: TicketSection[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Le istruzioni compaiono a chi apre un ticket in quella sezione. Le sezioni disattivate non si scelgono più, ma i loro ticket restano.
      </p>
      {adding ? (
        <SectionForm onDone={() => setAdding(false)} />
      ) : (
        <Button type="button" onClick={() => setAdding(true)} className="w-fit rounded-full">
          <Plus /> Nuova sezione
        </Button>
      )}
      <ul className="flex flex-col gap-2">
        {sections.map((s, i) => (
          <SectionRow key={s.id} section={s} first={i === 0} last={i === sections.length - 1} />
        ))}
      </ul>
    </div>
  );
}

function SectionRow({ section, first, last }: { section: TicketSection; first: boolean; last: boolean }) {
  const [editing, setEditing] = useState(false);
  const { pending, error, execute } = useAdminAction();
  if (editing) return <SectionForm section={section} onDone={() => setEditing(false)} />;
  return (
    <li className={cn("glass flex flex-col gap-2 rounded-2xl p-3", !section.active && "opacity-60")}>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left">
          <p className="truncate font-medium">{section.name}</p>
          <p className="truncate text-xs text-muted-foreground">{section.instructions || "Nessuna istruzione"}</p>
        </button>
        <StatusPill active={section.active} />
        <MoveButtons first={first} last={last} disabled={pending} onMove={(d) => execute(() => moveTicketSection(section.id, d))} />
        <DeleteButton what={`la sezione «${section.name}» (i suoi ticket restano senza sezione)`} disabled={pending} onConfirm={() => execute(() => deleteTicketSection(section.id))} />
      </div>
      <ErrorText error={error} />
    </li>
  );
}

function SectionForm({ section, onDone }: { section?: TicketSection; onDone: () => void }) {
  const [form, setForm] = useState({ name: section?.name ?? "", instructions: section?.instructions ?? "", active: section?.active ?? true });
  const { pending, error, execute } = useAdminAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(() => saveTicketSection({ id: section?.id, ...form }), onDone);
      }}
      className="glass flex flex-col gap-3 rounded-2xl p-4"
    >
      <ErrorText error={error} />
      <FieldLabel label="Nome">
        <input className={inputClass} value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </FieldLabel>
      <FieldLabel label="Istruzioni per chi scrive">
        <textarea className={cn(textareaClass, "min-h-32")} value={form.instructions} maxLength={4000} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
      </FieldLabel>
      <ActiveToggle checked={form.active} onChange={(active) => setForm({ ...form, active })} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} className="rounded-full">
          Annulla
        </Button>
        <Button type="submit" disabled={pending} className="rounded-full">
          <Save /> Salva
        </Button>
      </div>
    </form>
  );
}
