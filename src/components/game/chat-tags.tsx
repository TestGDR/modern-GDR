"use client";

import { useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { RoomTag } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  roomId: string;
  tags: RoomTag[];
  /** sotto-tag scelto (null = parte principale) */
  current: string | null;
  /** può scegliere (è in giocata) */
  canPick: boolean;
  /** può creare, rinominare ed eliminare (permesso chat.sottotag) */
  canManage: boolean;
  onPick: (tag: string | null) => void;
  onChanged: () => void;
  onError: (msg: string | null) => void;
};

/**
 * Sotto-tag della chat: un piccolo menu a tendina che apre una fila di
 * etichette da scorrere di lato. Chi ne sceglie una vede normali i messaggi
 * del suo sotto-tag e più piccoli e sbiaditi quelli degli altri.
 */
export function ChatTagsBar({ roomId, tags, current, canPick, canManage, onPick, onChanged, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<RoomTag | null>(null);
  const [busy, setBusy] = useState(false);

  if (!tags.length && !canManage) return null;
  const currentName = tags.find((t) => t.id === current)?.name ?? "Principale";

  async function create() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    const { error } = await createClient()
      .from("room_tags")
      .insert({ room_id: roomId, name: n.slice(0, 40), position: (tags.at(-1)?.position ?? 0) + 1 });
    setBusy(false);
    if (error) return onError(error.code === "23505" ? "C'è già un sotto-tag con questo nome." : error.message);
    onError(null);
    setName("");
    setAdding(false);
    onChanged();
  }

  async function rename(t: RoomTag) {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    const { error } = await createClient().from("room_tags").update({ name: n.slice(0, 40) }).eq("id", t.id);
    setBusy(false);
    if (error) return onError(error.code === "23505" ? "C'è già un sotto-tag con questo nome." : error.message);
    onError(null);
    setEditing(null);
    setName("");
    onChanged();
  }

  async function remove(t: RoomTag) {
    if (!window.confirm(`Eliminare il sotto-tag «${t.name}»? Chi è lì torna nella parte principale.`)) return;
    setBusy(true);
    const { error } = await createClient().from("room_tags").delete().eq("id", t.id);
    setBusy(false);
    if (error) return onError(error.message);
    onError(null);
    setEditing(null);
    if (current === t.id) onPick(null);
    onChanged();
  }

  const chip = (active: boolean) =>
    cn(
      "flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs whitespace-nowrap transition-colors",
      active ? "border-flamingo bg-flamingo/25 text-white" : "border-white/15 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
    );

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-3 py-1.5 sm:px-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Tag className="size-3.5 text-peach" />
        Sotto-tag: <span className="font-medium text-foreground">{currentName}</span>
        {tags.length > 0 && <span className="text-muted-foreground">({tags.length})</span>}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
          <button type="button" disabled={!canPick || busy} onClick={() => onPick(null)} className={chip(current === null)} title={canPick ? undefined : "Entra in giocata per scegliere"}>
            Principale
          </button>
          {tags.map((t) =>
            editing?.id === t.id ? (
              <span key={t.id} className="flex shrink-0 items-center gap-1 rounded-full border border-peach/50 bg-night/60 py-0.5 pr-1 pl-2">
                <input
                  autoFocus
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename(t);
                  }}
                  aria-label="Nuovo nome del sotto-tag"
                  className="w-28 bg-transparent text-xs outline-none"
                />
                <button type="button" disabled={busy} onClick={() => rename(t)} className="rounded-full p-0.5 text-mint hover:bg-white/10" aria-label="Salva">
                  <Check className="size-3.5" />
                </button>
                <button type="button" disabled={busy} onClick={() => remove(t)} className="rounded-full p-0.5 text-flamingo hover:bg-white/10" aria-label="Elimina">
                  <Trash2 className="size-3.5" />
                </button>
                <button type="button" onClick={() => setEditing(null)} className="rounded-full p-0.5 text-muted-foreground hover:bg-white/10" aria-label="Annulla">
                  <X className="size-3.5" />
                </button>
              </span>
            ) : (
              <button
                key={t.id}
                type="button"
                disabled={busy || (!manage && !canPick)}
                onClick={() => {
                  if (manage) {
                    setAdding(false);
                    setEditing(t);
                    setName(t.name);
                  } else onPick(t.id);
                }}
                className={chip(!manage && current === t.id)}
                title={manage ? "Rinomina o elimina" : canPick ? undefined : "Entra in giocata per scegliere"}
              >
                {manage && <Pencil className="size-3" />}
                {t.name}
              </button>
            ),
          )}
          {canManage &&
            (adding ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full border border-peach/50 bg-night/60 py-0.5 pr-1 pl-2">
                <input
                  autoFocus
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") create();
                  }}
                  placeholder="Nome del sotto-tag"
                  aria-label="Nome del sotto-tag"
                  className="w-32 bg-transparent text-xs outline-none"
                />
                <button type="button" disabled={busy || !name.trim()} onClick={create} className="rounded-full p-0.5 text-mint hover:bg-white/10" aria-label="Crea">
                  <Check className="size-3.5" />
                </button>
                <button type="button" onClick={() => (setAdding(false), setName(""))} className="rounded-full p-0.5 text-muted-foreground hover:bg-white/10" aria-label="Annulla">
                  <X className="size-3.5" />
                </button>
              </span>
            ) : (
              <>
                <button type="button" onClick={() => (setAdding(true), setEditing(null), setName(""))} className={cn(chip(false), "border-dashed")}>
                  <Plus className="size-3" /> Nuovo
                </button>
                {tags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => (setManage((v) => !v), setEditing(null))}
                    className={cn(chip(manage), "border-dashed")}
                    aria-pressed={manage}
                  >
                    <Pencil className="size-3" /> {manage ? "Fatto" : "Modifica"}
                  </button>
                )}
              </>
            ))}
        </div>
      )}
    </div>
  );
}
