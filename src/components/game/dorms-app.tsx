"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BedDouble, BedSingle, Building2, GraduationCap, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDollars } from "@/lib/bank";
import { firstName } from "@/lib/format";
import { ROOM_BEDS, ROOM_KIND_LABEL, bySortThenName, type CollegeCosts, type Dorm, type DormResident, type DormRoom } from "@/lib/housing";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Utility → Dormitori: le camere del college, a pagamento ogni mese (la borsa
// di studio paga la doppia). In una doppia stanno due ragazzi o due ragazze
// (chi ha sesso X va dove vuole). I controlli veri sono nel database.

type Me = { id: string; sex: "M" | "F" | "X" | null; costs: CollegeCosts | null };

export function DormsApp({ characterId }: { characterId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [dorms, setDorms] = useState<Dorm[] | null>(null);
  const [rooms, setRooms] = useState<DormRoom[]>([]);
  const [residents, setResidents] = useState<DormResident[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [dormId, setDormId] = useState<string | null>(null);
  const [onlyFree, setOnlyFree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [d, r, res, c, k] = await Promise.all([
      supabase.from("dorms").select("*").eq("active", true),
      supabase.from("dorm_rooms").select("*").eq("active", true),
      supabase.from("dorm_residents").select("character_id, room_id, since, character:characters(id, name, sex, avatar_url)"),
      characterId ? supabase.from("characters").select("id, sex").eq("id", characterId).maybeSingle<{ id: string; sex: Me["sex"] }>() : Promise.resolve({ data: null }),
      characterId ? supabase.rpc("college_costs", { p_character: characterId }) : Promise.resolve({ data: null }),
    ]);
    setDorms(((d.data ?? []) as Dorm[]).sort(bySortThenName));
    setRooms(((r.data ?? []) as DormRoom[]).sort(bySortThenName));
    setResidents((res.data ?? []) as unknown as DormResident[]);
    setMe(c.data ? { id: c.data.id, sex: c.data.sex, costs: (k.data as CollegeCosts | null) ?? null } : null);
  }, [supabase, characterId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  const mine = me ? residents.find((r) => r.character_id === me.id) : undefined;
  const myRoom = mine ? rooms.find((r) => r.id === mine.room_id) : undefined;
  const myDorm = myRoom ? dorms?.find((d) => d.id === myRoom.dorm_id) : undefined;
  const current = dorms?.find((d) => d.id === dormId) ?? myDorm ?? dorms?.[0];

  async function book(room: DormRoom) {
    if (!me) return;
    const fee = me.costs?.[room.kind] ?? 0;
    const pay = fee > 0 ? ` Il primo mese (${formatDollars(fee)}) si paga subito, poi ogni mese con gli altri accrediti.` : "";
    const question = mine ? `Lasci la camera ${myRoom?.name ?? ""} per la ${room.name}?` : `Prenotare la camera ${room.name}?`;
    if (!window.confirm(question + pay)) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error: e } = await supabase.rpc("dorm_book", { p_character: me.id, p_room: room.id });
    setBusy(false);
    if (e) return setError(e.message);
    setInfo(`Camera ${room.name} prenotata: benvenuto/a!`);
    load();
  }
  async function leave() {
    if (!me || !window.confirm("Lasciare la camera al college?")) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc("dorm_leave", { p_character: me.id });
    setBusy(false);
    if (e) return setError(e.message);
    setInfo("Hai lasciato la camera.");
    load();
  }

  if (!dorms) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  if (dorms.length === 0) return <p className="text-sm text-muted-foreground">Non ci sono ancora dormitori.</p>;

  const residentsOf = (roomId: string) => residents.filter((r) => r.room_id === roomId);
  const shownRooms = rooms.filter((r) => r.dorm_id === current?.id && (!onlyFree || residentsOf(r.id).length < ROOM_BEDS[r.kind]));

  return (
    <div className="flex flex-col gap-3">
      {me && (
        <section className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3 text-sm">
          {myRoom && myDorm ? (
            <>
              <BedDouble className="size-5 text-mint" />
              <span className="min-w-0 flex-1">
                La tua camera: <b>{myDorm.name}</b>, camera <b>{myRoom.name}</b> ({ROOM_KIND_LABEL[myRoom.kind].toLowerCase()})
              </span>
              <Button type="button" size="sm" variant="ghost" className="rounded-full" disabled={busy} onClick={leave}>
                <LogOut /> Lascia la camera
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground">Non hai ancora una camera.</span>
          )}
        </section>
      )}
      {me?.costs && <CostsBox costs={me.costs} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && <p className="text-sm text-mint">{info}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-1 rounded-full bg-white/5 p-1">
          {dorms.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDormId(d.id)}
              className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs", current?.id === d.id ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:bg-white/5")}
            >
              <Building2 className="size-3.5" /> {d.name}
            </button>
          ))}
        </nav>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> Solo con posti liberi
        </label>
      </div>

      {current && (
        <section className="flex flex-col gap-3">
          <div className="flex gap-3">
            {current.image_url && (
              // immagine esterna scelta dallo staff
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.image_url} alt="" className="hidden h-24 w-36 shrink-0 rounded-xl object-cover sm:block" />
            )}
            {current.description && <p className="text-sm whitespace-pre-line text-muted-foreground">{current.description}</p>}
          </div>
          {shownRooms.length === 0 && <p className="text-sm text-muted-foreground">Nessuna camera da mostrare.</p>}
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shownRooms.map((room) => (
              <RoomCard key={room.id} room={room} residents={residentsOf(room.id)} me={me} isMine={mine?.room_id === room.id} busy={busy} onBook={() => book(room)} />
            ))}
          </ul>
        </section>
      )}
      {!characterId && <p className="text-sm text-muted-foreground">Per prenotare una camera serve un personaggio approvato.</p>}
    </div>
  );
}

/** Quanto costa il college al mese per me */
function CostsBox({ costs }: { costs: CollegeCosts }) {
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
      <GraduationCap className="size-4 text-lavender" />
      {costs.scholarship && <span className="text-mint">Hai la borsa di studio: niente retta e camera doppia pagata.</span>}
      {!costs.scholarship && costs.student && <span>
          Retta del college: <b className="text-sand">{formatDollars(costs.tuition_year ?? costs.tuition * 12)}</b> l&apos;anno, in rate da {formatDollars(costs.tuition)} al mese
        </span>}
      <span>
        Doppia: <b className="text-sand">{costs.doppia > 0 ? `${formatDollars(costs.doppia)}/mese` : "pagata"}</b>
      </span>
      <span>
        Singola: <b className="text-sand">{formatDollars(costs.singola)}/mese</b>
      </span>
      <span className="text-muted-foreground">Si paga con gli altri accrediti (Utility → Servizi bancari).</span>
    </section>
  );
}

/** Perché non posso prenotare questa camera (null = posso) */
function blockReason(room: DormRoom, residents: DormResident[], me: Me): string | null {
  if (residents.length >= ROOM_BEDS[room.kind]) return "Occupata";
  if ((me.sex === "M" || me.sex === "F") && residents.some((r) => (r.character?.sex === "M" || r.character?.sex === "F") && r.character.sex !== me.sex)) {
    return me.sex === "M" ? "Camera di ragazze" : "Camera di ragazzi";
  }
  return null;
}

function RoomCard({ room, residents, me, isMine, busy, onBook }: { room: DormRoom; residents: DormResident[]; me: Me | null; isMine: boolean; busy: boolean; onBook: () => void }) {
  const beds = ROOM_BEDS[room.kind];
  const full = residents.length >= beds;
  const reason = me && !isMine ? blockReason(room, residents, me) : null;
  const Icon = room.kind === "singola" ? BedSingle : BedDouble;
  return (
    <li className={cn("glass flex flex-col gap-2 rounded-xl p-3", isMine && "border border-mint/50")}>
      <div className="flex items-center gap-2">
        <Icon className={cn("size-5", full ? "text-flamingo" : "text-mint")} />
        <span className="min-w-0 flex-1 truncate font-heading text-lg tracking-wide">Camera {room.name}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[0.7rem]", full ? "bg-flamingo/20 text-flamingo" : "bg-mint/15 text-mint")}>
          {ROOM_KIND_LABEL[room.kind]} · {full ? "occupata" : `${beds - residents.length} ${beds - residents.length === 1 ? "posto libero" : "posti liberi"}`}
        </span>
      </div>
      {room.description && <p className="text-xs text-muted-foreground">{room.description}</p>}
      <ul className="flex flex-col gap-1">
        {Array.from({ length: beds }, (_, i) => {
          const r = residents[i];
          return (
            <li key={i} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-sm">
              {r?.character ? (
                <Link href={`/scheda/${r.character.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
                  {r.character.avatar_url ? (
                    // ritratto del personaggio (link esterno)
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.character.avatar_url} alt="" className="size-6 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-orchid/30 text-[0.65rem]">{r.character.name.charAt(0)}</span>
                  )}
                  <span className="truncate">{firstName(r.character.name)}</span>
                </Link>
              ) : (
                <span className="text-muted-foreground italic">Posto libero</span>
              )}
            </li>
          );
        })}
      </ul>
      {me && !isMine && !full && (
        <Button type="button" size="sm" className="rounded-full" disabled={busy || !!reason} title={reason ?? undefined} onClick={onBook}>
          {reason ?? `Prenota${me.costs && me.costs[room.kind] > 0 ? ` · ${formatDollars(me.costs[room.kind])}/mese` : ""}`}
        </Button>
      )}
      {isMine && <p className="text-center text-xs text-mint">La tua camera</p>}
    </li>
  );
}
