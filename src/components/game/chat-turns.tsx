"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Repeat, SkipForward, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { firstName } from "@/lib/format";
import type { RoomTag } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Una riga della turnazione (da room_turns_get) */
export type TurnRow = {
  character_id: string;
  name: string;
  /** id del sotto-tag, '' = Principale */
  scene: string;
  position: number;
  is_current: boolean;
  live: boolean;
  /** ha già scritto fuori turno: quando arriva il suo turno si salta */
  acted_ahead: boolean;
};

/** Turnazione della chat, aggiornata in tempo reale */
export function useRoomTurns(roomId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<TurnRow[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc("room_turns_get", { p_room: roomId });
    if (data) setRows(data as TurnRow[]);
  }, [supabase, roomId]);
  useEffect(() => {
    // un'azione cambia più righe insieme: si rilegge una volta sola
    let timer: ReturnType<typeof setTimeout> | null = null;
    const later = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 400);
    };
    const channel = supabase
      .channel(`turni:${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_turns", filter: `room_id=eq.${roomId}` }, later)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "room_turns", filter: `room_id=eq.${roomId}` }, later)
      // le eliminazioni non si filtrano: la chat è nella chiave della riga
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "room_turns" }, (payload) => {
        const row = payload.old as { room_id?: string };
        if (!row.room_id || row.room_id === roomId) later();
      })
      // collegato (anche dopo una caduta): si leggono i turni
      .subscribe((status) => {
        if (status === "SUBSCRIBED") load();
      });
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, roomId, load]);
  return { rows, reload: load };
}

type Scene = { key: string; list: TurnRow[]; current: string | null };

/** Le turnazioni di ogni sotto-tag, solo con chi è ancora in giocata */
export function scenesOf(rows: TurnRow[], presentIds: Set<string>): Scene[] {
  const groups = new Map<string, TurnRow[]>();
  for (const r of rows) {
    if (!groups.has(r.scene)) groups.set(r.scene, []);
    groups.get(r.scene)!.push(r);
  }
  const out: Scene[] = [];
  for (const [key, all] of groups) {
    all.sort((a, b) => a.position - b.position);
    const list = all.filter((r) => r.live && presentIds.has(r.character_id));
    if (!list.length) continue;
    // se chi era di turno non è più in giocata, tocca al primo vivo dopo di lui
    const cur = all.find((r) => r.is_current);
    let current: string | null = null;
    if (cur) {
      const live = list.find((r) => r.character_id === cur.character_id);
      current = live ? live.character_id : (list.find((r) => r.position > cur.position) ?? list[0]).character_id;
    }
    out.push({ key, list, current });
  }
  return out;
}

/** Per ogni presente: il suo numero nel giro e se è di turno */
export type TurnMark = { n: number; current: boolean; scene: string; done: boolean };
export function turnMarks(scenes: Scene[]): Record<string, TurnMark> {
  const out: Record<string, TurnMark> = {};
  for (const s of scenes) s.list.forEach((r, i) => (out[r.character_id] = { n: i + 1, current: r.character_id === s.current, scene: s.key, done: r.acted_ahead }));
  return out;
}

/** Comandi dei turni (room_turn_action) */
export async function turnAction(roomId: string, action: string, character: string | null, scene: string) {
  const { error } = await createClient().rpc("room_turn_action", { p_room: roomId, p_action: action, p_character: character, p_scene: scene });
  return error?.message ?? null;
}

type Props = {
  roomId: string;
  scenes: Scene[];
  tags: RoomTag[];
  onChanged: () => void;
  onError: (msg: string | null) => void;
};

/** Pannello del Master (rotella nella barra dei presenti): dai il turno, sposta, togli, salta, azzera */
export function ChatTurnsManager({ roomId, scenes, tags, onChanged, onError }: Props) {
  const [busy, setBusy] = useState(false);

  async function run(action: string, character: string | null, scene: string) {
    if (busy) return;
    setBusy(true);
    onError(null);
    const err = await turnAction(roomId, action, character, scene);
    setBusy(false);
    if (err) onError(err);
    onChanged();
  }

  const sceneName = (key: string) => (key ? (tags.find((t) => t.id === key)?.name ?? "Sotto-tag") : "Principale");

  return (
    <div className="flex shrink-0 flex-col border-b border-border bg-white/5">
      {!scenes.length && <p className="px-3 py-1.5 text-xs text-muted-foreground sm:px-6">Turni: nessuno ha ancora scritto un’azione.</p>}
      {scenes.map((s) => (
        <div key={s.key} className="flex items-center gap-1.5 overflow-x-auto px-3 py-1 text-xs sm:px-6">
          <Repeat className="size-3.5 shrink-0 text-lavender" />
          <span className="shrink-0 text-muted-foreground">
            Turni <span className="text-peach">· {sceneName(s.key)}</span>
          </span>
          {s.list.map((r, i) => {
            const current = r.character_id === s.current;
            return (
              <span key={r.character_id} className="flex shrink-0 items-center gap-0.5">
                {i > 0 && <span className="px-0.5 text-muted-foreground">›</span>}
                <button type="button" disabled={busy || i === 0} onClick={() => run("su", r.character_id, s.key)} className="text-muted-foreground hover:text-white disabled:opacity-30" aria-label="Prima">
                  <ChevronLeft className="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run("dai", r.character_id, s.key)}
                  title="Dai il turno"
                  className={cn("rounded-full px-2 py-0.5", current ? "bg-peach/30 font-semibold text-white ring-1 ring-peach/70" : "bg-white/10 hover:bg-white/20")}
                >
                  {firstName(r.name)}
                </button>
                <button type="button" disabled={busy || i === s.list.length - 1} onClick={() => run("giu", r.character_id, s.key)} className="text-muted-foreground hover:text-white disabled:opacity-30" aria-label="Dopo">
                  <ChevronRight className="size-3.5" />
                </button>
                <button type="button" disabled={busy} onClick={() => run("togli", r.character_id, s.key)} className="text-flamingo hover:text-white" aria-label="Togli dai turni">
                  <X className="size-3.5" />
                </button>
              </span>
            );
          })}
          <span className="ml-auto flex shrink-0 items-center gap-1 pl-2">
            {s.current && (
              <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => run("passa", null, s.key)} className="rounded-full border border-white/15">
                <SkipForward /> Salta
              </Button>
            )}
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={busy}
              onClick={() => window.confirm("Azzerare i turni? La lista ricomincia dalla prossima azione.") && run("azzera", null, s.key)}
              className="rounded-full text-flamingo"
            >
              <Trash2 /> Azzera
            </Button>
          </span>
        </div>
      ))}
    </div>
  );
}
