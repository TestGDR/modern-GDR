"use client";

import { useState } from "react";
import { Lock, Plus, Save } from "lucide-react";
import { ActiveToggle, DeleteButton, ErrorText, FieldLabel, MoveButtons, inputClass, useAdminAction } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { deleteForumBoard, deleteForumSection, moveForumItem, saveForumBoard, saveForumSection } from "@/lib/actions/forum-admin";
import type { ForumBoard, ForumSection } from "@/lib/types";

/** Sezioni del forum (On Game / Off Game) con le loro bacheche */
export function ForumManager({ sections }: { sections: ForumSection[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Le sezioni raggruppano le bacheche. Nelle bacheche «solo staff» aprono discussioni solo i membri dello staff con il permesso «Pubblicare notizie e scrivere a tutti».
        Eliminando una sezione o una bacheca si eliminano anche le sue discussioni.
      </p>
      {adding ? (
        <SectionForm onDone={() => setAdding(false)} />
      ) : (
        <Button type="button" onClick={() => setAdding(true)} className="w-fit rounded-full">
          <Plus /> Nuova sezione
        </Button>
      )}
      {sections.map((s, i) => (
        <SectionBlock key={s.id} section={s} first={i === 0} last={i === sections.length - 1} />
      ))}
    </div>
  );
}

function SectionBlock({ section, first, last }: { section: ForumSection; first: boolean; last: boolean }) {
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
            <p className="text-xs text-muted-foreground">{section.is_on_game ? "On Game" : "Off Game"} · {boards.length} bacheche</p>
          </button>
          <MoveButtons first={first} last={last} disabled={pending} onMove={(d) => execute(() => moveForumItem("forum_sections", section.id, d))} />
          <DeleteButton what={`la sezione «${section.title}» con tutte le sue bacheche e discussioni`} disabled={pending} onConfirm={() => execute(() => deleteForumSection(section.id))} />
        </div>
      )}
      <ErrorText error={error} />
      <ul className="flex flex-col gap-2">
        {boards.map((b, i) => (
          <BoardRow key={b.id} board={b} first={i === 0} last={i === boards.length - 1} />
        ))}
      </ul>
      {addingBoard ? (
        <BoardForm sectionId={section.id} onDone={() => setAddingBoard(false)} />
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setAddingBoard(true)} className="w-fit rounded-full">
          <Plus /> Nuova bacheca
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
      <FieldLabel label="Nome della sezione">
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

function BoardRow({ board, first, last }: { board: ForumBoard; first: boolean; last: boolean }) {
  const [editing, setEditing] = useState(false);
  const { pending, error, execute } = useAdminAction();
  if (editing) return <BoardForm board={board} sectionId={board.section_id} onDone={() => setEditing(false)} />;
  return (
    <li className="flex flex-col gap-1 rounded-xl bg-white/5 p-2.5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left">
          <p className="truncate font-medium">
            {board.staff_only && <Lock className="mr-1 inline size-3.5 text-lavender" aria-label="Solo staff" />}
            {board.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">/forum/{board.slug} · {board.description || "Nessuna descrizione"}</p>
        </button>
        <MoveButtons first={first} last={last} disabled={pending} onMove={(d) => execute(() => moveForumItem("forum_boards", board.id, d))} />
        <DeleteButton what={`la bacheca «${board.name}» con tutte le sue discussioni`} disabled={pending} onConfirm={() => execute(() => deleteForumBoard(board.id))} />
      </div>
      <ErrorText error={error} />
    </li>
  );
}

function BoardForm({ board, sectionId, onDone }: { board?: ForumBoard; sectionId: string; onDone: () => void }) {
  const [form, setForm] = useState({ name: board?.name ?? "", description: board?.description ?? "", staffOnly: board?.staff_only ?? false });
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
      <FieldLabel label="Nome della bacheca">
        <input className={inputClass} value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </FieldLabel>
      <FieldLabel label="Descrizione">
        <input className={inputClass} value={form.description} maxLength={300} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </FieldLabel>
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
