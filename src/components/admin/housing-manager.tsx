"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, UserMinus } from "lucide-react";
import { inputClass, textareaClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { ROOM_BEDS, ROOM_KIND_LABEL, bySortThenName, type Dorm, type DormResident, type DormRoom, type DormRoomKind } from "@/lib/housing";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Gestione → Alloggi (permesso alloggi.gestire): dormitori del college con le
// camere e chi ci dorme.
// Quali camere spettano a ogni patrimonio si sceglie in Gestione → Patrimonio.

type Pg = { id: string; name: string };

export function HousingManager() {
  const supabase = useMemo(() => createClient(), []);
  const [characters, setCharacters] = useState<Pg[]>([]);
  useEffect(() => {
    let alive = true;
    supabase
      .from("characters")
      .select("id, name")
      .eq("status", "approvata")
      .order("name")
      .then(({ data }) => alive && setCharacters((data ?? []) as Pg[]));
    return () => {
      alive = false;
    };
  }, [supabase]);

  return <DormsAdmin characters={characters} />;
}

/* ------------------------------ Dormitori ------------------------------ */

function DormsAdmin({ characters }: { characters: Pg[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [dorms, setDorms] = useState<Dorm[] | null>(null);
  const [rooms, setRooms] = useState<DormRoom[]>([]);
  const [residents, setResidents] = useState<DormResident[]>([]);
  const [editing, setEditing] = useState<Dorm | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, r, res] = await Promise.all([
      supabase.from("dorms").select("*"),
      supabase.from("dorm_rooms").select("*"),
      supabase.from("dorm_residents").select("character_id, room_id, since, character:characters(id, name, sex, avatar_url)"),
    ]);
    setDorms(((d.data ?? []) as Dorm[]).sort(bySortThenName));
    setRooms(((r.data ?? []) as DormRoom[]).sort(bySortThenName));
    setResidents((res.data ?? []) as unknown as DormResident[]);
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  async function call(p: PromiseLike<{ error: { message: string } | null }>) {
    setError(null);
    const { error: e } = await p;
    if (e) setError(e.message);
    load();
    return !e;
  }

  if (!dorms) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        I dormitori sono misti: in una doppia stanno due ragazzi o due ragazze, chi ha sesso «non specificato» va dove vuole. Le camere si pagano ogni mese (prezzi e retta del
        college in Impostazioni del sistema); la borsa di studio paga la doppia. Assegnando una camera da qui non si paga il primo mese e non vale il limite sul sesso.
      </p>
      <Button type="button" size="sm" className="w-fit rounded-full" onClick={() => setEditing("new")}>
        <Plus /> Nuovo dormitorio
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {editing && (
        <DormForm
          key={editing === "new" ? "new" : editing.id}
          dorm={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async (row) => {
            const ok = await call(editing === "new" ? supabase.from("dorms").insert({ ...row, sort_order: dorms.length + 1 }) : supabase.from("dorms").update(row).eq("id", editing.id));
            if (ok) setEditing(null);
          }}
          onDelete={
            editing === "new"
              ? undefined
              : async () => {
                  if (!window.confirm(`Eliminare ${editing.name} con tutte le camere? Chi ci dorme resta senza camera.`)) return;
                  if (await call(supabase.from("dorms").delete().eq("id", editing.id))) setEditing(null);
                }
          }
        />
      )}
      {dorms.length === 0 && <p className="text-sm text-muted-foreground">Nessun dormitorio.</p>}
      {dorms.map((d) => (
        <DormBlock
          key={d.id}
          dorm={d}
          rooms={rooms.filter((r) => r.dorm_id === d.id)}
          residents={residents}
          characters={characters}
          onEdit={() => setEditing(d)}
          call={call}
        />
      ))}
    </div>
  );
}

type DormRow = Pick<Dorm, "name" | "description" | "image_url" | "active">;

function DormForm({ dorm, onCancel, onSave, onDelete }: { dorm: Dorm | null; onCancel: () => void; onSave: (row: DormRow) => void; onDelete?: () => void }) {
  const [f, setF] = useState({ name: dorm?.name ?? "", description: dorm?.description ?? "", image_url: dorm?.image_url ?? "", active: dorm?.active ?? true });
  return (
    <div className="glass flex flex-col gap-2 rounded-2xl p-3 text-sm">
      <input className={inputClass} value={f.name} maxLength={60} placeholder="Nome del dormitorio (es. Palm Hall)" onChange={(e) => setF({ ...f, name: e.target.value })} />
      <textarea className={textareaClass} value={f.description} maxLength={1000} placeholder="Descrizione" onChange={(e) => setF({ ...f, description: e.target.value })} />
      <input className={inputClass} value={f.image_url} maxLength={500} placeholder="Immagine (link https, facoltativa)" onChange={(e) => setF({ ...f, image_url: e.target.value })} />
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Visibile ai giocatori
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={f.name.trim().length < 2}
          onClick={() => onSave({ name: f.name.trim(), description: f.description.trim(), image_url: f.image_url.trim() || null, active: f.active })}
        >
          Salva
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Chiudi
        </Button>
        {onDelete && (
          <Button type="button" size="sm" variant="ghost" className="ml-auto text-destructive" onClick={onDelete}>
            <Trash2 /> Elimina
          </Button>
        )}
      </div>
    </div>
  );
}

type Call = (p: PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>;

function DormBlock({ dorm, rooms, residents, characters, onEdit, call }: { dorm: Dorm; rooms: DormRoom[]; residents: DormResident[]; characters: Pg[]; onEdit: () => void; call: Call }) {
  const supabase = useMemo(() => createClient(), []);
  const [add, setAdd] = useState({ from: "101", count: 1, kind: "doppia" as DormRoomKind });
  const beds = rooms.reduce((n, r) => n + ROOM_BEDS[r.kind], 0);
  const taken = residents.filter((r) => rooms.some((room) => room.id === r.room_id)).length;

  // "101" e 3 camere → 101, 102, 103 (se non è un numero si aggiunge " 2", " 3"…)
  function addRooms() {
    const n = Math.max(1, Math.min(50, Math.round(add.count)));
    const base = add.from.trim();
    const num = /^\d+$/.test(base) ? Number(base) : null;
    const names = Array.from({ length: n }, (_, i) => (num !== null ? String(num + i) : n === 1 ? base : `${base} ${i + 1}`));
    const start = rooms.length;
    call(supabase.from("dorm_rooms").insert(names.map((name, i) => ({ dorm_id: dorm.id, name, kind: add.kind, sort_order: start + i + 1 }))));
  }

  return (
    <section className={cn("glass flex flex-col gap-2 rounded-2xl p-3", !dorm.active && "opacity-60")}>
      <div className="flex flex-wrap items-baseline gap-2">
        <button type="button" onClick={onEdit} className="font-heading text-2xl tracking-wide text-peach hover:underline">
          {dorm.name}
        </button>
        <span className="text-xs text-muted-foreground">
          {rooms.length} camere · {taken}/{beds} posti occupati{!dorm.active && " · nascosto"}
        </span>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {rooms.map((room) => (
          <RoomAdmin key={room.id} room={room} residents={residents.filter((r) => r.room_id === room.id)} characters={characters} call={call} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2 text-xs">
        <span>Aggiungi</span>
        <input className={cn(inputClass, "h-8 w-16")} type="number" min={1} max={50} value={add.count} onChange={(e) => setAdd({ ...add, count: Number(e.target.value) })} aria-label="Quante camere" />
        <span>camere</span>
        <select className={cn(inputClass, "h-8 w-28")} value={add.kind} onChange={(e) => setAdd({ ...add, kind: e.target.value as DormRoomKind })} aria-label="Tipo">
          <option value="doppia">doppie</option>
          <option value="singola">singole</option>
        </select>
        <span>a partire da</span>
        <input className={cn(inputClass, "h-8 w-24")} value={add.from} maxLength={40} onChange={(e) => setAdd({ ...add, from: e.target.value })} aria-label="Nome o numero della prima camera" />
        <Button type="button" size="sm" disabled={!add.from.trim()} onClick={addRooms}>
          <Plus /> Aggiungi
        </Button>
      </div>
    </section>
  );
}

function RoomAdmin({ room, residents, characters, call }: { room: DormRoom; residents: DormResident[]; characters: Pg[]; call: Call }) {
  const supabase = useMemo(() => createClient(), []);
  const [pick, setPick] = useState("");
  const full = residents.length >= ROOM_BEDS[room.kind];
  return (
    <li className={cn("flex flex-col gap-1 rounded-lg bg-white/5 p-2 text-sm", !room.active && "opacity-60")}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 font-medium">
          Camera {room.name} <span className="text-xs font-normal text-muted-foreground">· {ROOM_KIND_LABEL[room.kind].toLowerCase()}</span>
        </span>
        <select
          className="h-7 rounded-md border border-input bg-night/40 px-1 text-xs"
          value={room.kind}
          aria-label="Tipo di camera"
          onChange={(e) => call(supabase.from("dorm_rooms").update({ kind: e.target.value }).eq("id", room.id))}
        >
          <option value="doppia">Doppia</option>
          <option value="singola" disabled={residents.length > 1}>
            Singola
          </option>
        </select>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={`Elimina la camera ${room.name}`}
          onClick={() => window.confirm(`Eliminare la camera ${room.name}?${residents.length ? " Chi ci dorme resta senza camera." : ""}`) && call(supabase.from("dorm_rooms").delete().eq("id", room.id))}
        >
          <Trash2 />
        </Button>
      </div>
      {residents.map((r) => (
        <p key={r.character_id} className="flex items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 truncate">{r.character?.name ?? "?"}</span>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={`Togli ${r.character?.name ?? ""} dalla camera`}
            onClick={() => window.confirm(`Togliere ${r.character?.name ?? ""} dalla camera?`) && call(supabase.rpc("dorm_evict", { p_character: r.character_id }))}
          >
            <UserMinus />
          </Button>
        </p>
      ))}
      {!full && (
        <div className="flex gap-1">
          <select className="h-7 min-w-0 flex-1 rounded-md border border-input bg-night/40 px-1 text-xs" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Personaggio da assegnare">
            <option value="">Assegna a…</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="xs"
            disabled={!pick}
            onClick={async () => {
              if (await call(supabase.rpc("dorm_assign", { p_character: pick, p_room: room.id }))) setPick("");
            }}
          >
            Assegna
          </Button>
        </div>
      )}
    </li>
  );
}
