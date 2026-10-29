"use client";

import { useRef, useState } from "react";
import { ImagePlus, Lock, Plus, Save, X } from "lucide-react";
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
import { MiamiIllustration } from "@/components/game/miami-illustration";
import { Button } from "@/components/ui/button";
import {
  deleteDistrict,
  deleteMap,
  deleteRoom,
  deleteRoomGroup,
  moveWorldItem,
  saveDistrict,
  saveDistrictPositions,
  saveMap,
  saveRoom,
  saveRoomGroup,
} from "@/lib/actions/world";
import type { World } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import type { District, GameMap, Room, RoomGroup } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GRADIENTS, WORLD_BUCKET, WORLD_IMAGE_MAX_BYTES, WORLD_IMAGE_TYPES } from "@/lib/world";

type Tab = "mappe" | "quartieri" | "chat";

/** Pannello "Mondo" (dal Westeros: WorldManager): mappe, quartieri, chat */
export function WorldManager({ world, ownerNames }: { world: World; ownerNames: Record<string, string> }) {
  const [tab, setTab] = useState<Tab>("quartieri");
  const tabs: { id: Tab; title: string; n: number }[] = [
    { id: "mappe", title: "Mappe", n: world.maps.length },
    { id: "quartieri", title: "Quartieri", n: world.districts.length },
    { id: "chat", title: "Chat", n: world.rooms.length },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 overflow-x-auto" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm",
              tab === t.id ? "bg-flamingo/20 text-white shadow-[inset_0_0_0_1px_var(--flamingo)]" : "text-muted-foreground hover:bg-white/5",
            )}
          >
            {t.title} <span className="text-xs opacity-70">({t.n})</span>
          </button>
        ))}
      </div>
      {tab === "mappe" && <MapsTab maps={world.maps} />}
      {tab === "quartieri" && <DistrictsTab maps={world.maps} districts={world.districts} />}
      {tab === "chat" && <RoomsTab world={world} ownerNames={ownerNames} />}
    </div>
  );
}

/* ------------------------------ Immagini ------------------------------ */

/** Carica un'immagine nell'archivio "mondo" direttamente dal browser */
function ImageField({ value, onChange, folder, label }: { value: string | null; onChange: (url: string | null) => void; folder: string; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setError(null);
    if (!WORLD_IMAGE_TYPES.includes(file.type)) return setError("Formato non valido: usa PNG, JPG, WebP o GIF.");
    if (file.size > WORLD_IMAGE_MAX_BYTES) return setError("Immagine troppo grande: massimo 5 MB.");
    setUploading(true);
    const supabase = createClient();
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error: upError } = await supabase.storage.from(WORLD_BUCKET).upload(path, file, { contentType: file.type });
    setUploading(false);
    if (upError) return setError("Caricamento non riuscito. Controlla di avere il permesso «Gestire il mondo».");
    onChange(supabase.storage.from(WORLD_BUCKET).getPublicUrl(path).data.publicUrl);
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-20 w-28 rounded-lg object-cover" />
        ) : (
          <span className="grid h-20 w-28 place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">Nessuna</span>
        )}
        <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => input.current?.click()} className="rounded-full">
          <ImagePlus /> {uploading ? "Caricamento…" : value ? "Cambia" : "Carica"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} className="rounded-full">
            <X /> Togli
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept={WORLD_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) upload(f);
          }}
        />
      </div>
      <span className="text-xs text-muted-foreground">PNG, JPG, WebP o GIF, fino a 5 MB.</span>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

/* ------------------------------ Mappe ------------------------------ */

function MapsTab({ maps }: { maps: GameMap[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        I giocatori vedono solo le mappe attive. Senza immagine si vede la Miami disegnata. Eliminando una mappa si cancellano anche i suoi quartieri e le sue chat.
      </p>
      {adding ? (
        <MapForm onDone={() => setAdding(false)} />
      ) : (
        <Button type="button" onClick={() => setAdding(true)} className="w-fit rounded-full">
          <Plus /> Nuova mappa
        </Button>
      )}
      <ul className="flex flex-col gap-2">
        {maps.map((m, i) => (
          <MapRow key={m.id} map={m} first={i === 0} last={i === maps.length - 1} />
        ))}
      </ul>
    </div>
  );
}

function MapRow({ map, first, last }: { map: GameMap; first: boolean; last: boolean }) {
  const [editing, setEditing] = useState(false);
  const { pending, error, execute } = useAdminAction();
  if (editing) return <MapForm map={map} onDone={() => setEditing(false)} />;
  return (
    <li className="glass flex flex-col gap-2 rounded-2xl p-3">
      <div className="flex items-center gap-3">
        {map.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={map.image_url} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <MiamiIllustration className="h-12 w-9 shrink-0 rounded-lg" />
        )}
        <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left">
          <p className="truncate font-medium">{map.name}</p>
          <p className="truncate text-xs text-muted-foreground">{map.description || "Nessuna descrizione"}</p>
        </button>
        <StatusPill active={map.active} />
        <MoveButtons first={first} last={last} disabled={pending} onMove={(d) => execute(() => moveWorldItem("maps", map.id, d))} />
        <DeleteButton what={`la mappa «${map.name}» con i suoi quartieri e le sue chat`} disabled={pending} onConfirm={() => execute(() => deleteMap(map.id))} />
      </div>
      <ErrorText error={error} />
    </li>
  );
}

function MapForm({ map, onDone }: { map?: GameMap; onDone: () => void }) {
  const [form, setForm] = useState({ name: map?.name ?? "", description: map?.description ?? "", imageUrl: map?.image_url ?? null, active: map?.active ?? false });
  const { pending, error, execute } = useAdminAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(() => saveMap({ id: map?.id, ...form }), onDone);
      }}
      className="glass flex flex-col gap-3 rounded-2xl p-4"
    >
      <ErrorText error={error} />
      <FieldLabel label="Nome">
        <input className={inputClass} value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </FieldLabel>
      <FieldLabel label="Descrizione">
        <textarea className={textareaClass} value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </FieldLabel>
      <ImageField label="Immagine della mappa" folder="mappe" value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
      <ActiveToggle checked={form.active} onChange={(active) => setForm({ ...form, active })} label="Attiva (visibile ai giocatori)" />
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

/* ------------------------------ Quartieri ------------------------------ */

function MapPicker({ maps, value, onChange }: { maps: GameMap[]; value: string; onChange: (id: string) => void }) {
  if (maps.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {maps.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={cn("rounded-full px-3 py-1 text-sm", m.id === value ? "bg-white/15 text-white" : "text-muted-foreground hover:bg-white/5")}
        >
          {m.name}
          {!m.active && " (spenta)"}
        </button>
      ))}
    </div>
  );
}

function DistrictsTab({ maps, districts }: { maps: GameMap[]; districts: District[] }) {
  const [mapId, setMapId] = useState(maps[0]?.id ?? "");
  const [adding, setAdding] = useState(false);
  const map = maps.find((m) => m.id === mapId);
  if (!map) return <p className="text-sm text-muted-foreground">Crea prima una mappa.</p>;
  const here = districts.filter((d) => d.map_id === map.id);
  return (
    <div className="flex flex-col gap-4">
      <MapPicker maps={maps} value={map.id} onChange={setMapId} />
      <PositionEditor key={map.id + here.map((d) => `${d.id}:${d.x}:${d.y}`).join()} map={map} districts={here} />
      {adding ? (
        <DistrictForm mapId={map.id} onDone={() => setAdding(false)} />
      ) : (
        <Button type="button" onClick={() => setAdding(true)} className="w-fit rounded-full">
          <Plus /> Nuovo quartiere
        </Button>
      )}
      <ul className="flex flex-col gap-2">
        {here.map((d, i) => (
          <DistrictRow key={d.id} district={d} first={i === 0} last={i === here.length - 1} />
        ))}
      </ul>
    </div>
  );
}

/** Trascina i punti dei quartieri sulla mappa e salva le posizioni */
function PositionEditor({ map, districts }: { map: GameMap; districts: District[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>(() =>
    Object.fromEntries(districts.map((d) => [d.id, { x: Number(d.x), y: Number(d.y) }])),
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const { pending, error, execute } = useAdminAction();

  function move(e: React.PointerEvent, id: string) {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    setPos((p) => ({ ...p, [id]: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 } }));
    setDirty(true);
  }

  return (
    <div className="glass flex flex-col gap-3 rounded-2xl p-3">
      <p className="text-sm text-muted-foreground">Trascina i punti nella posizione giusta, poi salva.</p>
      <div ref={box} className="relative mx-auto w-full max-w-lg touch-none overflow-hidden rounded-xl select-none">
        {map.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={map.image_url} alt={map.name} className="block w-full" draggable={false} />
        ) : (
          <MiamiIllustration className="block h-auto w-full" />
        )}
        {districts.map((d) => {
          const p = pos[d.id] ?? { x: 50, y: 50 };
          return (
            <button
              key={d.id}
              type="button"
              className={cn("absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none p-1", dragging === d.id && "z-10 cursor-grabbing")}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setDragging(d.id);
              }}
              onPointerMove={(e) => dragging === d.id && move(e, d.id)}
              onPointerUp={() => setDragging(null)}
              aria-label={`Sposta ${d.name}`}
            >
              <span className="block size-3.5 rounded-full border-2 border-white bg-flamingo shadow-[0_0_8px_var(--flamingo)]" />
              <span className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 rounded bg-night/85 px-1.5 text-[0.7rem] whitespace-nowrap text-white">
                {d.name}
              </span>
            </button>
          );
        })}
      </div>
      <ErrorText error={error} />
      <div className="flex justify-end">
        <Button
          type="button"
          disabled={!dirty || pending}
          onClick={() => execute(() => saveDistrictPositions(Object.entries(pos).map(([id, p]) => ({ id, ...p }))), () => setDirty(false))}
          className="rounded-full"
        >
          <Save /> Salva posizioni
        </Button>
      </div>
    </div>
  );
}

function DistrictRow({ district, first, last }: { district: District; first: boolean; last: boolean }) {
  const [editing, setEditing] = useState(false);
  const { pending, error, execute } = useAdminAction();
  if (editing) return <DistrictForm district={district} mapId={district.map_id} onDone={() => setEditing(false)} />;
  return (
    <li className="glass flex flex-col gap-2 rounded-2xl p-2.5">
      <div className="flex items-center gap-2">
        <span className={cn("size-8 shrink-0 rounded-lg bg-gradient-to-br", district.gradient)} />
        <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left">
          <p className="truncate font-medium">{district.name}</p>
          {district.tagline && <p className="truncate text-xs text-muted-foreground">{district.tagline}</p>}
        </button>
        <MoveButtons first={first} last={last} disabled={pending} onMove={(d) => execute(() => moveWorldItem("locations", district.id, d))} />
        <DeleteButton what={`il quartiere «${district.name}» con tutte le sue chat`} disabled={pending} onConfirm={() => execute(() => deleteDistrict(district.id))} />
      </div>
      <ErrorText error={error} />
    </li>
  );
}

function DistrictForm({ district, mapId, onDone }: { district?: District; mapId: string; onDone: () => void }) {
  const [form, setForm] = useState({
    name: district?.name ?? "",
    tagline: district?.tagline ?? "",
    description: district?.description ?? "",
    gradient: district?.gradient ?? GRADIENTS[0],
  });
  const { pending, error, execute } = useAdminAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(() => saveDistrict({ id: district?.id, mapId, ...form }), onDone);
      }}
      className="glass flex flex-col gap-3 rounded-2xl p-4"
    >
      <ErrorText error={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldLabel label="Nome">
          <input className={inputClass} value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </FieldLabel>
        <FieldLabel label="Sottotitolo" hint="Una riga, es. «Spiaggia, neon e Art Déco»">
          <input className={inputClass} value={form.tagline} maxLength={120} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
        </FieldLabel>
      </div>
      <FieldLabel label="Descrizione" hint="Compare nella finestra del quartiere, sopra le chat">
        <textarea className={textareaClass} value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </FieldLabel>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Colori</span>
        <div className="flex flex-wrap gap-2">
          {GRADIENTS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setForm({ ...form, gradient: g })}
              className={cn("h-8 w-12 rounded-lg bg-gradient-to-r", g, form.gradient === g && "ring-2 ring-white")}
              aria-label={g}
              aria-pressed={form.gradient === g}
            />
          ))}
        </div>
      </div>
      {!district && <p className="text-xs text-muted-foreground">Il nuovo quartiere compare al centro della mappa: poi trascinalo nella posizione giusta.</p>}
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

/* ------------------------------ Chat ------------------------------ */

function RoomsTab({ world, ownerNames }: { world: World; ownerNames: Record<string, string> }) {
  const [districtId, setDistrictId] = useState(world.districts[0]?.id ?? "");
  const [adding, setAdding] = useState(false);
  const district = world.districts.find((d) => d.id === districtId);
  if (!district) return <p className="text-sm text-muted-foreground">Crea prima un quartiere.</p>;
  const groups = world.groups.filter((g) => g.location_id === district.id);
  const rooms = world.rooms.filter((r) => r.location_id === district.id);

  return (
    <div className="flex flex-col gap-4">
      <FieldLabel label="Quartiere">
        <select
          className={inputClass}
          value={district.id}
          onChange={(e) => {
            setDistrictId(e.target.value);
            setAdding(false);
          }}
        >
          {world.maps.map((m) => (
            <optgroup key={m.id} label={m.name}>
              {world.districts
                .filter((d) => d.map_id === m.id)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({world.rooms.filter((r) => r.location_id === d.id).length})
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </FieldLabel>

      <GroupsEditor key={`g-${district.id}`} districtId={district.id} groups={groups} />

      {adding ? (
        <RoomForm districtId={district.id} groups={groups} onDone={() => setAdding(false)} />
      ) : (
        <Button type="button" onClick={() => setAdding(true)} className="w-fit rounded-full">
          <Plus /> Nuova chat in {district.name}
        </Button>
      )}
      <ul className="flex flex-col gap-2">
        {rooms.map((r, i) => (
          <RoomRow key={r.id} room={r} groups={groups} ownerName={r.owner_character_id ? (ownerNames[r.owner_character_id] ?? "") : ""} first={i === 0} last={i === rooms.length - 1} />
        ))}
      </ul>
      {rooms.length === 0 && <p className="text-sm text-muted-foreground">Nessuna chat in questo quartiere.</p>}
    </div>
  );
}

/** Gruppi di chat del quartiere (dal Westeros: GroupsEditor) */
function GroupsEditor({ districtId, groups }: { districtId: string; groups: RoomGroup[] }) {
  const [name, setName] = useState("");
  const { pending, error, execute } = useAdminAction();
  return (
    <div className="glass flex flex-col gap-2 rounded-2xl p-3">
      <p className="text-sm font-medium">Gruppi di chat</p>
      <p className="text-xs text-muted-foreground">Dividono le chat nella finestra del quartiere (es. «Locali», «Case», «Campus»). Eliminando un gruppo le chat restano, senza gruppo.</p>
      <ErrorText error={error} />
      <ul className="flex flex-wrap gap-2">
        {groups.map((g, i) => (
          <li key={g.id} className="flex items-center gap-1 rounded-full bg-white/10 py-0.5 pr-1 pl-3 text-sm">
            {g.name}
            <MoveButtons first={i === 0} last={i === groups.length - 1} disabled={pending} onMove={(d) => execute(() => moveWorldItem("room_groups", g.id, d))} />
            <DeleteButton what={`il gruppo «${g.name}»`} disabled={pending} onConfirm={() => execute(() => deleteRoomGroup(g.id))} />
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          execute(() => saveRoomGroup({ districtId, name }), () => setName(""));
        }}
        className="flex gap-2"
      >
        <input className={inputClass} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Nuovo gruppo…" required />
        <Button type="submit" disabled={pending} className="h-10 shrink-0 rounded-full">
          <Plus /> Aggiungi
        </Button>
      </form>
    </div>
  );
}

function RoomRow({ room, groups, ownerName, first, last }: { room: Room; groups: RoomGroup[]; ownerName: string; first: boolean; last: boolean }) {
  const [editing, setEditing] = useState(false);
  const { pending, error, execute } = useAdminAction();
  if (editing) return <RoomForm room={room} districtId={room.location_id} groups={groups} ownerName={ownerName} onDone={() => setEditing(false)} />;
  const group = groups.find((g) => g.id === room.group_id);
  return (
    <li className={cn("glass flex flex-col gap-2 rounded-2xl p-2.5", !room.is_open && "opacity-70")}>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left">
          <p className="truncate font-medium">
            {room.access === "su_invito" && <Lock className="mr-1 inline size-3.5 text-lavender" />}
            {room.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[group?.name, room.access === "su_invito" ? `su invito${ownerName ? ` di ${ownerName}` : ""}` : null, room.is_open ? null : "chiusa"].filter(Boolean).join(" · ") ||
              room.description ||
              "—"}
          </p>
        </button>
        <MoveButtons first={first} last={last} disabled={pending} onMove={(d) => execute(() => moveWorldItem("rooms", room.id, d))} />
        <DeleteButton what={`la chat «${room.name}» e i suoi messaggi`} disabled={pending} onConfirm={() => execute(() => deleteRoom(room.id))} />
      </div>
      <ErrorText error={error} />
    </li>
  );
}

function RoomForm({ room, districtId, groups, ownerName = "", onDone }: { room?: Room; districtId: string; groups: RoomGroup[]; ownerName?: string; onDone: () => void }) {
  const [form, setForm] = useState({
    name: room?.name ?? "",
    description: room?.description ?? "",
    groupId: room?.group_id ?? null,
    imageUrl: room?.image_url ?? null,
    isOpen: room?.is_open ?? true,
    // le chat con password non si gestiscono da qui
    access: (room?.access === "su_invito" ? "su_invito" : "pubblica") as "pubblica" | "su_invito",
    ownerName,
  });
  const { pending, error, execute } = useAdminAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(() => saveRoom({ id: room?.id, districtId, ...form }), onDone);
      }}
      className="glass flex flex-col gap-3 rounded-2xl p-4"
    >
      <ErrorText error={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldLabel label="Nome">
          <input className={inputClass} value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </FieldLabel>
        <FieldLabel label="Gruppo">
          <select className={inputClass} value={form.groupId ?? ""} onChange={(e) => setForm({ ...form, groupId: e.target.value || null })}>
            <option value="">Senza gruppo</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </FieldLabel>
      </div>
      <FieldLabel label="Descrizione">
        <textarea className={textareaClass} value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </FieldLabel>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldLabel label="Accesso">
          <select className={inputClass} value={form.access} onChange={(e) => setForm({ ...form, access: e.target.value as "pubblica" | "su_invito" })}>
            <option value="pubblica">Pubblica</option>
            <option value="su_invito">Su invito (case, appartamenti, locali privati)</option>
          </select>
        </FieldLabel>
        {form.access === "su_invito" && (
          <FieldLabel label="Proprietario" hint="Nome e cognome del personaggio che invita e allontana (facoltativo)">
            <input className={inputClass} value={form.ownerName} maxLength={60} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
          </FieldLabel>
        )}
      </div>
      <ImageField label="Immagine della chat" folder="chat" value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
      <ActiveToggle checked={form.isOpen} onChange={(isOpen) => setForm({ ...form, isOpen })} label="Aperta (si può entrare in giocata)" />
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
