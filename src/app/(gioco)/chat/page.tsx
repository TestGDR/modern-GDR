import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePlayer } from "@/lib/auth";
import { getDistrictsWithPlaces, getPlaceActivity } from "@/lib/data";

export const metadata: Metadata = { title: "Chat" };

export default function ChatIndexPage() {
  return (
    <>
      <PageHeader title="Chat di gioco" subtitle="Scegli un quartiere di Miami e gioca la tua scena." />
      <Suspense fallback={<LoadingBlocks count={4} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePlayer();
  const [districts, activity] = await Promise.all([getDistrictsWithPlaces(), getPlaceActivity()]);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {districts.map((district) => (
        <section key={district.id} className="glass overflow-hidden rounded-2xl">
          <h2 className={`bg-gradient-to-r px-5 py-2 font-heading text-2xl tracking-wide text-white ${district.gradient}`}>
            {district.name}
          </h2>
          <ul className="divide-y divide-border">
            {district.places.map((place) => {
              const active = activity.get(place.id) ?? 0;
              return (
                <li key={place.id}>
                  <Link href={`/chat/${place.slug}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{place.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{place.description}</p>
                    </div>
                    {active > 0 && (
                      <span className="shrink-0 rounded-full bg-mint/15 px-2 py-0.5 text-xs text-mint">{active} in gioco</span>
                    )}
                    {!place.is_open && <span className="shrink-0 text-xs text-muted-foreground">Chiuso</span>}
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
