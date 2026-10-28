import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { MapView } from "@/components/game/map-view";
import { PageHeader } from "@/components/game/page-header";
import { requirePlayer } from "@/lib/auth";
import { getRoomActivity, getWorld } from "@/lib/data";

export const metadata: Metadata = { title: "Mappa" };

export default function MappaPage({ searchParams }: PageProps<"/mappa">) {
  return (
    <>
      <PageHeader title="Mappa di Miami" subtitle="Scegli un quartiere e raggiungi le sue chat." />
      <Suspense fallback={<LoadingBlocks count={4} />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/mappa">["searchParams"] }) {
  await requirePlayer();
  const [{ quartiere }, world, activity] = await Promise.all([searchParams, getWorld(), getRoomActivity()]);
  // Sulla mappa dei giocatori solo le mappe attive (chi gestisce il mondo le riceve tutte)
  const maps = world.maps.filter((m) => m.active);
  const districts = world.districts.filter((d) => maps.some((m) => m.id === d.map_id));

  return (
    <MapView
      maps={maps}
      districts={districts}
      groups={world.groups}
      rooms={world.rooms}
      activity={Object.fromEntries(activity)}
      initialDistrictId={typeof quartiere === "string" ? quartiere : null}
    />
  );
}
