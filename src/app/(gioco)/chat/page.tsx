import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, Lock } from "lucide-react";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePlayer } from "@/lib/auth";
import { getRoomActivity, getWorld } from "@/lib/data";

export const metadata: Metadata = { title: "Chat" };

export default function ChatIndexPage() {
  return (
    <>
      <PageHeader title="Chat di gioco" subtitle="Tutte le chat dei quartieri di Miami." />
      <Suspense fallback={<LoadingBlocks count={4} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePlayer();
  const [world, activity] = await Promise.all([getWorld(), getRoomActivity()]);
  const activeMaps = new Set(world.maps.filter((m) => m.active).map((m) => m.id));
  const districts = world.districts.filter((d) => activeMaps.has(d.map_id) && world.rooms.some((r) => r.location_id === d.id));

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {districts.map((district) => (
        <section key={district.id} className="glass overflow-hidden rounded-2xl">
          <h2 className={`bg-gradient-to-r px-5 py-2 font-heading text-2xl tracking-wide text-white ${district.gradient}`}>{district.name}</h2>
          <ul className="divide-y divide-border">
            {world.rooms
              .filter((r) => r.location_id === district.id)
              .map((room) => {
                const active = activity.get(room.id) ?? 0;
                return (
                  <li key={room.id}>
                    <Link href={`/chat/${room.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/5">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {room.access === "su_invito" && <Lock className="mr-1 inline size-3.5 text-lavender" aria-label="Su invito" />}
                          {room.name}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">{room.description}</p>
                      </div>
                      {active > 0 && <span className="shrink-0 rounded-full bg-mint/15 px-2 py-0.5 text-xs text-mint">{active} in gioco</span>}
                      {!room.is_open && <span className="shrink-0 text-xs text-muted-foreground">Chiusa</span>}
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
