"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Gift, Home, Loader2, Plus, Trash2, UserMinus } from "lucide-react";
import { inputClass, textareaClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { formatDollars } from "@/lib/bank";
import { ROOM_BEDS, ROOM_KIND_LABEL, bySortThenName, type CharacterHome, type Dorm, type DormResident, type DormRoom, type DormRoomKind, type HomeMode, type HouseType } from "@/lib/housing";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Gestione → Alloggi (permesso alloggi.gestire): dormitori del college con le
// camere e chi ci dorme; catalogo delle case e case dei personaggi.
// Quali camere spettano a ogni patrimonio si sceglie in Gestione → Patrimonio.

type Tab = "dormitori" | "case";
type Pg = { id: string; name: string };

export function HousingManager() {
  const [tab, setTab] = useState<Tab>("dormitori");
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

  return (
    <div className="flex flex-col gap-3">
      <nav className="flex w-fit gap-1 rounded-full bg-white/5 p-1">
        {(
          [
            ["dormitori", "Dormitori", Building2],
            ["case", "Case", Home],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs", tab === key ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:bg-white/5")}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </nav>
      {tab === "dormitori" ? <DormsAdmin characters={characters} /> : <HousesAdmin characters={characters} />}
    </div>
  );
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
        I dormitori sono misti: in una doppia stanno due ragazzi o due ragazze, chi ha sesso «non specificato» va dove vuole. La retta è nel patrimonio: quali camere (singola, doppia)
        può prenotare ogni patrimonio si sceglie in Gestione → Patrimonio. Assegnando una camera da qui non valgono i limiti di patrimonio e sesso.
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

/* ------------------------------ Case ------------------------------ */

type HomeWithPg = CharacterHome & { character: { name: string } | null };

function HousesAdmin({ characters }: { characters: Pg[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [types, setTypes] = useState<HouseType[] | null>(null);
  const [homes, setHomes] = useState<HomeWithPg[]>([]);
  const [editing, setEditing] = useState<HouseType | "new" | null>(null);
  const [gift, setGift] = useState({ character: "", type: "", mode: "proprieta" as HomeMode });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, h] = await Promise.all([
      supabase.from("house_types").select("*"),
      supabase.from("character_homes").select("*, character:characters(name)").order("created_at", { ascending: false }),
    ]);
    setTypes(((t.data ?? []) as HouseType[]).sort(bySortThenName));
    setHomes((h.data ?? []) as HomeWithPg[]);
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  async function call(p: PromiseLike<{ error: { message: string } | null }>) {
    setError(null);
    setDone(null);
    const { error: e } = await p;
    if (e) setError(e.message);
    load();
    return !e;
  }

  if (!types) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Tipi di casa (monolocale, appartamento, villa…): lo stesso tipo lo possono prendere più personaggi. Lascia vuoto il prezzo d&apos;acquisto o l&apos;affitto se quella casa non si
        compra o non si affitta. Quante case per personaggio e quanto torna vendendo si cambiano in Impostazioni del sistema.
      </p>
      <Button type="button" size="sm" className="w-fit rounded-full" onClick={() => setEditing("new")}>
        <Plus /> Nuovo tipo di casa
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {editing && (
        <HouseForm
          key={editing === "new" ? "new" : editing.id}
          house={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async (row) => {
            const ok = await call(editing === "new" ? supabase.from("house_types").insert({ ...row, sort_order: types.length + 1 }) : supabase.from("house_types").update(row).eq("id", editing.id));
            if (ok) setEditing(null);
          }}
          onDelete={
            editing === "new"
              ? undefined
              : async () => {
                  if (!window.confirm(`Eliminare ${editing.name} dal catalogo? Chi l'ha già presa la tiene.`)) return;
                  if (await call(supabase.from("house_types").delete().eq("id", editing.id))) setEditing(null);
                }
          }
        />
      )}
      <ul className="flex flex-col gap-1">
        {types.map((t) => (
          <li key={t.id} className={cn("flex flex-wrap items-baseline gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm", !t.active && "opacity-50")}>
            <button type="button" className="font-medium hover:underline" onClick={() => setEditing(t)}>
              {t.name}
            </button>
            <span className="text-xs text-muted-foreground">
              {t.buy_price !== null ? `compra ${formatDollars(t.buy_price)}` : "non in vendita"} · {t.rent_price !== null ? `affitto ${formatDollars(t.rent_price)}/mese` : "non in affitto"}
              {!t.active && " · nascosta"}
            </span>
          </li>
        ))}
      </ul>

      <section className="glass flex flex-col gap-2 rounded-2xl p-3 text-sm">
        <h3 className="flex items-center gap-1.5 font-heading text-lg tracking-wide text-peach">
          <Gift className="size-4" /> Dai una casa
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <select className={cn(inputClass, "w-52")} value={gift.character} onChange={(e) => setGift({ ...gift, character: e.target.value })}>
            <option value="">Personaggio…</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className={cn(inputClass, "w-52")} value={gift.type} onChange={(e) => setGift({ ...gift, type: e.target.value })}>
            <option value="">Casa…</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select className={cn(inputClass, "w-40")} value={gift.mode} onChange={(e) => setGift({ ...gift, mode: e.target.value as HomeMode })}>
            <option value="proprieta">Di proprietà</option>
            <option value="affitto">In affitto</option>
          </select>
          <Button
            type="button"
            size="sm"
            disabled={!gift.character || !gift.type}
            onClick={async () => {
              if (await call(supabase.rpc("home_give", { p_character: gift.character, p_type: gift.type, p_mode: gift.mode }))) setDone("Fatto.");
            }}
          >
            Dai
          </Button>
          {done && <span className="text-xs text-mint">{done}</span>}
        </div>
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="font-heading text-lg tracking-wide text-peach">Case dei personaggi ({homes.length})</h3>
        {homes.length === 0 && <p className="text-sm text-muted-foreground">Nessuno ha ancora una casa.</p>}
        <ul className="flex flex-col gap-1">
          {homes.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm">
              <span className="font-medium">{h.character?.name ?? "?"}</span>
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                {h.name} · {h.mode === "affitto" ? `affitto ${formatDollars(h.rent)}/mese` : "proprietà"}
                {h.address && ` · ${h.address}`}
              </span>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Togli la casa a ${h.character?.name ?? ""}`}
                onClick={() => window.confirm(`Togliere ${h.name} a ${h.character?.name ?? ""}? Non riceve rimborsi.`) && call(supabase.rpc("home_remove", { p_home: h.id }))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

type HouseRow = Pick<HouseType, "name" | "description" | "image_url" | "buy_price" | "rent_price" | "active">;

function HouseForm({ house, onCancel, onSave, onDelete }: { house: HouseType | null; onCancel: () => void; onSave: (row: HouseRow) => void; onDelete?: () => void }) {
  const [f, setF] = useState({
    name: house?.name ?? "",
    description: house?.description ?? "",
    image_url: house?.image_url ?? "",
    buy: house?.buy_price?.toString() ?? "",
    rent: house?.rent_price?.toString() ?? "",
    active: house?.active ?? true,
  });
  const price = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.round(Number(s) || 0)));
  const valid = f.name.trim().length >= 2 && (price(f.buy) !== null || price(f.rent) !== null);
  return (
    <div className="glass flex flex-col gap-2 rounded-2xl p-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-[1fr_9rem_9rem]">
        <input className={inputClass} value={f.name} maxLength={60} placeholder="Nome (es. Monolocale a Wynwood)" onChange={(e) => setF({ ...f, name: e.target.value })} />
        <label className="flex items-center gap-1.5 text-xs">
          Compra $
          <input className={inputClass} type="number" min={0} value={f.buy} placeholder="—" onChange={(e) => setF({ ...f, buy: e.target.value })} />
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          Affitto $
          <input className={inputClass} type="number" min={0} value={f.rent} placeholder="—" onChange={(e) => setF({ ...f, rent: e.target.value })} />
        </label>
      </div>
      <textarea className={textareaClass} value={f.description} maxLength={1000} placeholder="Descrizione" onChange={(e) => setF({ ...f, description: e.target.value })} />
      <input className={inputClass} value={f.image_url} maxLength={500} placeholder="Immagine (link https, facoltativa)" onChange={(e) => setF({ ...f, image_url: e.target.value })} />
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Disponibile in agenzia
      </label>
      {!valid && f.name.trim().length >= 2 && <p className="text-xs text-flamingo">Indica almeno il prezzo d&apos;acquisto o l&apos;affitto.</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!valid}
          onClick={() =>
            onSave({ name: f.name.trim(), description: f.description.trim(), image_url: f.image_url.trim() || null, buy_price: price(f.buy), rent_price: price(f.rent), active: f.active })
          }
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
