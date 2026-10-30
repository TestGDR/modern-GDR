"use client";

import { useState } from "react";
import { Lock, Plus, Save } from "lucide-react";
import { ActiveToggle, DeleteButton, ErrorText, FieldLabel, MoveButtons, inputClass, useAdminAction } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { deleteForumBoard, deleteForumSection, moveForumItem, saveForumBoard, saveForumSection } from "@/lib/actions/forum-admin";
import type { ForumAccess, ForumBoard, ForumSection } from "@/lib/types";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };
type Lists = { levels: Option[]; groups: Option[] };

const ACCESS_LABEL: Record<ForumAccess, string> = {
  pubblica: "Pubblica: la leggono tutti",
  livelli: "Riservata a dei livelli (ruoli: Master, Moderatore…)",
  gruppi: "Riservata a dei gruppi (corporazioni del gioco)",
};

/** Categorie del forum con le loro sezioni (pubbliche o riservate) */
export function ForumManager({ sections, levels, groups }: { sections: ForumSection[] } & Lists) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Le categorie raggruppano le sezioni. Ogni sezione può essere pubblica o riservata a dei livelli o a dei gruppi: chi non ne fa parte non la vede proprio
        (l’Amministratore e chi ha il permesso «Leggere le sezioni riservate» le vedono tutte). Nelle sezioni «solo staff» aprono discussioni solo i membri dello staff
        con il permesso «Pubblicare annunci e scrivere a tutti». Eliminando una categoria o una sezione si eliminano anche le sue discussioni.
      </p>
      {adding ? (
        <SectionForm onDone={() => setAdding(false)} />
      ) : (
        <Button type="button" onClick={() => setAdding(true)} className="w-fit rounded-full">
          <Plus /> Nuova categoria
        </Button>
      )}
      {sections.map((s, i) => (
        <SectionBlock key={s.id} section={s} first={i === 0} last={i === sections.length - 1} levels={levels} groups={groups} />
      ))}
    </div>
  );
}

function SectionBlock({ section, first, last, levels, groups }: { section: ForumSection; first: boolean; last: boolean } & Lists) {
  const [editing, setEditing] = useState(false);
  const [addingBoard, setAddingBoard] = useState(false);
  const { pending, error, execute } = useAdminAction();
  const boards = section.forum_boards;
  return (
    <section className="glass flex flex-col gap-3 rounded-2xl p-4">
      {editing ? (
        <SectionForm section={section} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left">
            <p className="truncate font-heading text-2xl tracking-wide text-peach">{section.title}</p>
            <p className="text-xs text-muted-foreground">{section.is_on_game ? "On Game" : "Off Game"} · {boards.length} sezioni</p>
          </button>
          <MoveButtons first={first} last={last} disabled={pending} onMove={(d) => execute(() => moveForumItem("forum_sections", section.id, d))} />
          <DeleteButton what={`la categoria «${section.title}» con tutte le sue sezioni e discussioni`} disabled={pending} onConfirm={() => execute(() => deleteForumSection(section.id))} />
        </div>
      )}
      <ErrorText error={error} />
      <ul className="flex flex-col gap-2">
        {boards.map((b, i) => (
          <BoardRow key={b.id} board={b} first={i === 0} last={i === boards.length - 1} levels={levels} groups={groups} />
        ))}
      </ul>
      {addingBoard ? (
        <BoardForm sectionId={section.id} onDone={() => setAddingBoard(false)} levels={levels} groups={groups} />
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setAddingBoard(true)} className="w-fit rounded-full">
          <Plus /> Nuova sezione
        </Button>
      )}
    </section>
  );
}

function SectionForm({ section, onDone }: { section?: ForumSection; onDone: () => void }) {
  const [form, setForm] = useState({ title: section?.title ?? "", isOnGame: section?.is_on_game ?? true });
  const { pending, error, execute } = useAdminAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(() => saveForumSection({ id: section?.id, ...form }), onDone);
      }}
      className="flex flex-col gap-3 rounded-xl bg-white/5 p-3"
    >
      <ErrorText error={error} />
      <FieldLabel label="Nome della categoria">
        <input className={inputClass} value={form.title} maxLength={60} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
      </FieldLabel>
      <ActiveToggle checked={form.isOnGame} onChange={(isOnGame) => setForm({ ...form, isOnGame })} label="On Game (si scrive anche come personaggio)" />
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

function BoardRow({ board, first, last, levels, groups }: { board: ForumBoard; first: boolean; last: boolean } & Lists) {
  const [editing, setEditing] = useState(false);
  const { pending, error, execute } = useAdminAction();
  if (editing) return <BoardForm board={board} sectionId={board.section_id} onDone={() => setEditing(false)} levels={levels} groups={groups} />;
  const who =
    board.access === "livelli"
      ? `Livelli: ${levels.filter((l) => board.level_ids.includes(l.id)).map((l) => l.name).join(", ") || "—"}`
      : board.access === "gruppi"
        ? `Gruppi: ${groups.filter((g) => board.group_ids.includes(g.id)).map((g) => g.name).join(", ") || "—"}`
        : "Pubblica";
  return (
    <li className="flex flex-col gap-1 rounded-xl bg-white/5 p-2.5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left">
          <p className="truncate font-medium">
            {board.access !== "pubblica" && <Lock className="mr-1 inline size-3.5 text-lavender" aria-label="Riservata" />}
            {board.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {who}
            {board.staff_only && " · scrive solo lo staff"} · {board.description || "Nessuna descrizione"}
          </p>
        </button>
        <MoveButtons first={first} last={last} disabled={pending} onMove={(d) => execute(() => moveForumItem("forum_boards", board.id, d))} />
        <DeleteButton what={`la sezione «${board.name}» con tutte le sue discussioni`} disabled={pending} onConfirm={() => execute(() => deleteForumBoard(board.id))} />
      </div>
      <ErrorText error={error} />
    </li>
  );
}

function BoardForm({ board, sectionId, onDone, levels, groups }: { board?: ForumBoard; sectionId: string; onDone: () => void } & Lists) {
  const [form, setForm] = useState({
    name: board?.name ?? "",
    description: board?.description ?? "",
    staffOnly: board?.staff_only ?? false,
    access: board?.access ?? ("pubblica" as ForumAccess),
    levelIds: board?.level_ids ?? [],
    groupIds: board?.group_ids ?? [],
  });
  const toggle = (key: "levelIds" | "groupIds", id: string) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));
  const { pending, error, execute } = useAdminAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(() => saveForumBoard({ id: board?.id, sectionId, ...form }), onDone);
      }}
      className="flex flex-col gap-3 rounded-xl bg-white/5 p-3"
    >
      <ErrorText error={error} />
      <FieldLabel label="Nome della sezione">
        <input className={inputClass} value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </FieldLabel>
      <FieldLabel label="Descrizione">
        <input className={inputClass} value={form.description} maxLength={300} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </FieldLabel>
      <FieldLabel label="Chi la legge">
        <select className={inputClass} value={form.access} onChange={(e) => setForm({ ...form, access: e.target.value as ForumAccess })}>
          {(Object.keys(ACCESS_LABEL) as ForumAccess[]).map((a) => (
            <option key={a} value={a}>
              {ACCESS_LABEL[a]}
            </option>
          ))}
        </select>
      </FieldLabel>
      {form.access !== "pubblica" && (
        <div className="flex flex-wrap gap-2">
          {(form.access === "livelli" ? levels : groups).map((o) => {
            const key = form.access === "livelli" ? "levelIds" : "groupIds";
            const on = form[key].includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(key, o.id)}
                className={cn("rounded-full border px-3 py-1 text-xs", on ? "border-peach bg-peach/15 text-peach" : "border-white/15 text-muted-foreground hover:bg-white/5")}
              >
                {o.name}
              </button>
            );
          })}
          {form.access === "gruppi" && groups.length === 0 && <p className="text-xs text-muted-foreground">Nessun gruppo: crealo prima in Gestione → Gruppi.</p>}
        </div>
      )}
      <ActiveToggle checked={form.staffOnly} onChange={(staffOnly) => setForm({ ...form, staffOnly })} label="Solo lo staff apre discussioni" />
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
