"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Repeat, Settings2, SkipForward, Trash2, X } from "lucide-react";
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
      .on("postgres_changes", { event: "*", schema: "public", table: "room_turns" }, (payload) => {
        const row = (payload.new && "room_id" in payload.new ? payload.new : payload.old) as { room_id?: string };
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
function scenesOf(rows: TurnRow[], presentIds: Set<string>): Scene[] {
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

type Props = {
  roomId: string;
  rows: TurnRow[];
  meId: string | null;
  /** sotto-tag in cui si trova il mio personaggio ('' = Principale) */
  myScene: string;
  presentIds: Set<string>;
  tags: RoomTag[];
  /** Master: salta, dà il turno, sposta, toglie, azzera (chat.narrazione) */
  canManage: boolean;
  onChanged: () => void;
  onError: (msg: string | null) => void;
};

/** Riga «Turni» sotto i presenti: chi deve scrivere, in ordine */
export function ChatTurnsBar({ roomId, rows, meId, myScene, presentIds, tags, canManage, onChanged, onError }: Props) {
  const [manage, setManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const scenes = scenesOf(rows, presentIds).sort((a, b) => Number(b.key === myScene) - Number(a.key === myScene));
  if (!scenes.length) return null;

  async function run(action: string, character: string | null, scene: string) {
    if (busy) return;
    setBusy(true);
    onError(null);
    const { error } = await createClient().rpc("room_turn_action", { p_room: roomId, p_action: action, p_character: character, p_scene: scene });
    setBusy(false);
    if (error) onError(error.message);
    onChanged();
  }

  const sceneName = (key: string) => (key ? (tags.find((t) => t.id === key)?.name ?? "Sotto-tag") : "Principale");
  const showScene = tags.length > 0 || scenes.length > 1;

  return (
    <div className="flex shrink-0 flex-col border-b border-border">
      {scenes.map((s) => {
        const mine = s.current !== null && s.current === meId;
        return (
          <div key={s.key} className="flex items-center gap-1.5 overflow-x-auto px-3 py-1 text-xs sm:px-6">
            <Repeat className="size-3.5 shrink-0 text-lavender" />
            <span className="shrink-0 text-muted-foreground">
              Turni{showScene && <span className="text-peach"> · {sceneName(s.key)}</span>}
            </span>
            {s.list.map((r, i) => {
              const current = r.character_id === s.current;
              return (
                <span key={r.character_id} className="flex shrink-0 items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3 text-muted-foreground" />}
                  {manage && canManage && (
                    <button type="button" disabled={busy || i === 0} onClick={() => run("su", r.character_id, s.key)} className="text-muted-foreground hover:text-white disabled:opacity-30" aria-label="Prima">
                      <ChevronLeft className="size-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!manage || !canManage || busy}
                    onClick={() => run("dai", r.character_id, s.key)}
                    title={manage && canManage ? "Dai il turno" : current ? "Di turno" : undefined}
                    className={cn(
                      "rounded-full px-2 py-0.5 disabled:cursor-default",
                      current ? "bg-peach/30 font-semibold text-white ring-1 ring-peach/70" : "bg-white/10",
                      current && r.character_id === meId && "blink-call",
                    )}
                  >
                    {firstName(r.name)}
                  </button>
                  {manage && canManage && (
                    <>
                      <button type="button" disabled={busy || i === s.list.length - 1} onClick={() => run("giu", r.character_id, s.key)} className="text-muted-foreground hover:text-white disabled:opacity-30" aria-label="Dopo">
                        <ChevronRight className="size-3.5" />
                      </button>
                      <button type="button" disabled={busy} onClick={() => run("togli", r.character_id, s.key)} className="text-flamingo hover:text-white" aria-label="Togli dai turni">
                        <X className="size-3.5" />
                      </button>
                    </>
                  )}
                </span>
              );
            })}
            <span className="ml-auto flex shrink-0 items-center gap-1 pl-2">
              {mine && <span className="font-semibold text-peach">Tocca a te!</span>}
              {(mine || canManage) && s.current && (
                <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => run("passa", null, s.key)} className="rounded-full border border-white/15">
                  <SkipForward /> {mine ? "Passo" : "Salta"}
                </Button>
              )}
              {canManage && manage && (
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
              )}
              {canManage && (
                <Button type="button" size="icon-xs" variant="ghost" onClick={() => setManage((v) => !v)} aria-label={manage ? "Fine modifica dei turni" : "Modifica i turni"} aria-pressed={manage}>
                  <Settings2 className={cn(manage && "text-peach")} />
                </Button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
