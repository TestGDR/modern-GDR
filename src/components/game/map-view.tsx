"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock, MapPin } from "lucide-react";
import { FloatingWindow } from "@/components/floating-window";
import { MiamiIllustration } from "@/components/game/miami-illustration";
import type { District, GameMap, Room, RoomGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  maps: GameMap[];
  districts: District[];
  groups: RoomGroup[];
  rooms: Room[];
  /** Chat → quanti personaggi in giocata */
  activity: Record<string, number>;
  /** Quartiere da aprire subito (tornando da una chat) */
  initialDistrictId: string | null;
};

/**
 * Mappa con i punti dei quartieri (dal Westeros: MapView). Cliccando un punto
 * si apre la finestra con le chat del quartiere, divise per gruppo.
 * Con più mappe attive si passa dall'una all'altra con le schede.
 */
export function MapView({ maps, districts, groups, rooms, activity, initialDistrictId }: Props) {
  const initial = districts.find((d) => d.id === initialDistrictId) ?? null;
  const [mapId, setMapId] = useState(initial?.map_id ?? maps[0]?.id ?? null);
  const [openId, setOpenId] = useState<string | null>(initial?.id ?? null);
  const map = maps.find((m) => m.id === mapId) ?? maps[0];
  const open = districts.find((d) => d.id === openId) ?? null;

  if (!map) {
    return <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">Nessuna mappa attiva per ora.</p>;
  }
  const here = districts.filter((d) => d.map_id === map.id);
  const people = (districtId: string) =>
    rooms.filter((r) => r.location_id === districtId).reduce((n, r) => n + (activity[r.id] ?? 0), 0);

  // Chiudendo tolgo "quartiere" dall'indirizzo: aggiornando la pagina non si riapre
  function close() {
    setOpenId(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("quartiere")) {
      url.searchParams.delete("quartiere");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {maps.length > 1 && (
        <div className="flex gap-1 overflow-x-auto" role="tablist">
          {maps.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={m.id === map.id}
              onClick={() => setMapId(m.id)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm",
                m.id === map.id ? "bg-flamingo/20 text-white shadow-[inset_0_0_0_1px_var(--flamingo)]" : "text-muted-foreground hover:bg-white/5",
              )}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      <div className="glass rounded-3xl p-3 sm:p-4">
        <div
          className={cn(
            "relative mx-auto w-full overflow-hidden rounded-2xl",
            // grande: tutta la larghezza (la Miami disegnata è verticale, l'area centrale scorre)
            map.image_url ? "max-w-6xl" : "max-w-3xl",
          )}
        >
            {map.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={map.image_url} alt={map.name} className="block w-full select-none" draggable={false} />
            ) : (
              <MiamiIllustration className="block h-auto w-full" />
            )}
            {here.map((d) => (
              <MapDot key={d.id} district={d} people={people(d.id)} onOpen={() => setOpenId(d.id)} />
            ))}
        </div>
        {map.description && <p className="mt-3 text-center text-sm text-muted-foreground">{map.description}</p>}
      </div>

      {open && (
        <FloatingWindow
          label={open.name}
          onClose={close}
          initialWidth={520}
          header={
            <div className="pb-4">
              <p className="text-xs tracking-widest text-muted-foreground uppercase">{map.name}</p>
              <h2 className="font-heading text-3xl tracking-wide">{open.name}</h2>
              {open.tagline && <p className="text-sm text-peach">{open.tagline}</p>}
            </div>
          }
        >
          <RoomList
            district={open}
            rooms={rooms.filter((r) => r.location_id === open.id)}
            groups={groups.filter((g) => g.location_id === open.id)}
            activity={activity}
          />
        </FloatingWindow>
      )}
    </div>
  );
}

/** Punto del quartiere sulla mappa, con il nome al passaggio del mouse */
function MapDot({ district: d, people, onOpen }: { district: District; people: number; onOpen: () => void }) {
  const x = Number(d.x);
  const y = Number(d.y);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={d.name}
      className="group absolute -translate-x-1/2 -translate-y-1/2 p-1.5"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <span className="relative block size-4">
        <span className="absolute inset-0 animate-ping rounded-full bg-flamingo/50" />
        <span className="absolute inset-0 rounded-full border-2 border-white bg-flamingo shadow-[0_0_10px_var(--flamingo)] transition group-hover:scale-125" />
        {people > 0 && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-mint ring-2 ring-night" title={`${people} in gioco`} />}
      </span>
      <span
        className={cn(
          // nome sempre visibile (non c'è più l'elenco a fianco); al passaggio si illumina
          "pointer-events-none absolute top-6 z-10 rounded-md bg-night/80 px-1.5 py-0.5 font-heading text-[0.7rem] tracking-wide whitespace-nowrap text-white/90 transition group-hover:bg-flamingo group-hover:text-white group-focus-visible:bg-flamingo sm:text-sm",
          // vicino ai bordi il nome si allinea al punto invece di uscire dalla mappa
          x < 15 ? "left-0" : x > 85 ? "right-0" : "left-1/2 -translate-x-1/2",
        )}
      >
        {d.name}
      </span>
    </button>
  );
}

/** Chat del quartiere: prima quelle senza gruppo, poi un blocco per gruppo */
function RoomList({ district, rooms, groups, activity }: { district: District; rooms: Room[]; groups: RoomGroup[]; activity: Record<string, number> }) {
  const sections = [
    { id: "senza-gruppo", name: null as string | null, rooms: rooms.filter((r) => !groups.some((g) => g.id === r.group_id)) },
    ...groups.map((g) => ({ id: g.id, name: g.name as string | null, rooms: rooms.filter((r) => r.group_id === g.id) })),
  ].filter((s) => s.rooms.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {district.description && <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{district.description}</p>}
      {rooms.length === 0 && <p className="text-center text-sm text-muted-foreground">Nessuna chat in questo quartiere.</p>}
      {sections.map((section) => (
        <section key={section.id}>
          {section.name && <h3 className="mb-2 border-b border-border pb-1 font-heading text-xl tracking-wide text-peach">{section.name}</h3>}
          <ul className="flex flex-col gap-2">
            {section.rooms.map((room) => {
              const n = activity[room.id] ?? 0;
              return (
                <li key={room.id}>
                  <Link href={`/chat/${room.id}`} className="flex gap-3 rounded-xl border border-border bg-white/5 p-3 transition-colors hover:bg-white/10">
                    {room.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={room.image_url} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className={cn("grid size-14 shrink-0 place-items-center rounded-lg bg-gradient-to-br font-heading text-2xl text-white", district.gradient)}>
                        {room.name[0]}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2">
                        <span className="font-medium">
                          {room.access === "su_invito" && <Lock className="mr-1 inline size-3.5 text-lavender" aria-label="Su invito" />}
                          {room.name}
                        </span>
                        {n > 0 && <span className="text-xs text-mint">{n} in gioco</span>}
                        {!room.is_open && <span className="text-xs text-muted-foreground">chiusa</span>}
                      </span>
                      {room.description && <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{room.description}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="size-3.5" /> Entra in una chat e premi «Entra in giocata» per partecipare.
      </p>
    </div>
  );
}
