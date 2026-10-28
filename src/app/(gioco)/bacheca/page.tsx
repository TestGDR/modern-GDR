import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Clock, MapPin } from "lucide-react";
import { CharacterAvatar } from "@/components/game/character-avatar";
import { EmptyState, LoadingBlocks } from "@/components/game/loading";
import { NeedsCharacter } from "@/components/game/needs-character";
import { PageHeader } from "@/components/game/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { activeCharacter, can, requirePlayer } from "@/lib/auth";
import { getNews, getOnlineCharacters, getPendingCharacters, getRoomActivity, getWorld } from "@/lib/data";
import { formatDateTime, initials } from "@/lib/format";
import { requestTime } from "@/lib/request-time";

export const metadata: Metadata = { title: "Bacheca" };

export default function BachecaPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Bacheca" subtitle="Ecco cosa succede a Miami stasera." />
          <LoadingBlocks />
        </>
      }
    >
      <Content />
    </Suspense>
  );
}

async function Content() {
  const player = await requirePlayer();
  const { profile } = player;
  const character = activeCharacter(player);
  const pendingSheets = can(player, "personaggi.approvare") ? await getPendingCharacters() : [];
  const [world, activity, online, news] = await Promise.all([
    getWorld(),
    getRoomActivity(),
    getOnlineCharacters(),
    getNews(),
  ]);

  const activeMaps = new Set(world.maps.filter((m) => m.active).map((m) => m.id));
  const places = world.rooms.flatMap((r) => {
    const district = world.districts.find((d) => d.id === r.location_id);
    return district && activeMaps.has(district.map_id) && r.access === "pubblica" ? [{ ...r, district }] : [];
  });
  const hotPlaces = places
    .map((p) => ({ ...p, active: activity.get(p.id) ?? 0 }))
    .sort((a, b) => b.active - a.active)
    .slice(0, 4);

  const miamiTime = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(await requestTime());

  return (
    <>
      <PageHeader
        title={`Ciao, ${character ? character.name.split(" ")[0] : profile.username}`}
        subtitle="Ecco cosa succede a Miami stasera."
      />

      {!character && player.character?.status === "in_attesa" && (
        <p className="glass mb-6 rounded-2xl px-5 py-4 text-sm text-peach">
          La tua scheda è in attesa di approvazione: appena lo staff la approva potrai giocare.
        </p>
      )}
      {!character && player.character?.status !== "in_attesa" && (
        <NeedsCharacter
          className="glass mb-6 rounded-2xl"
          text="Benvenuto a Miami! Puoi esplorare tutto; per giocare in chat, scrivere messaggi e usare il social completa prima la scheda del tuo personaggio."
        />
      )}

      {pendingSheets.length > 0 && (
        <div className="glass mb-6 rounded-2xl px-5 py-4">
          <p className="mb-2 font-heading text-xl tracking-wide text-peach">Schede in attesa di approvazione ({pendingSheets.length})</p>
          <ul className="flex flex-wrap gap-2">
            {pendingSheets.map((p) => (
              <li key={p.id}>
                <Link href={`/scheda/${p.id}`} className="block rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20">
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="glass mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl px-5 py-4 text-sm">
        <span className="flex items-center gap-2">
          <MapPin className="size-4 text-flamingo" /> Miami, Florida
        </span>
        <span className="flex items-center gap-2">
          <Clock className="size-4 text-peach" /> Ora locale {miamiTime}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="font-heading text-2xl tracking-wide">Luoghi più animati</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {hotPlaces.map((place) => (
                <Link
                  key={place.id}
                  href={`/chat/${place.id}`}
                  className={`group relative overflow-hidden rounded-xl bg-gradient-to-br p-4 ${place.district.gradient}`}
                >
                  <div className="absolute inset-0 bg-night/35 transition-colors group-hover:bg-night/20" />
                  <div className="relative">
                    <p className="text-xs font-medium tracking-widest text-white/80 uppercase">{place.district.name}</p>
                    <p className="font-heading text-2xl tracking-wide text-white">{place.name}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-white/90">
                      <span className={`size-2 rounded-full ${place.active ? "bg-mint" : "bg-white/40"}`} />
                      {place.active ? `${place.active} in gioco` : "Tranquillo"}
                    </p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader>
              <CardTitle className="font-heading text-2xl tracking-wide">Notizie dalla città</CardTitle>
            </CardHeader>
            <CardContent>
              {news.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna notizia per ora. Lo staff pubblicherà qui la cronaca di Miami.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {news.map((n) => (
                    <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-sm font-medium">{n.title}</p>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</span>
                      </div>
                      {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="glass h-fit">
          <CardHeader>
            <CardTitle className="font-heading text-2xl tracking-wide">
              Online <span className="text-mint">({online.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {online.length === 0 && <EmptyState title="Nessuno online" />}
            {online.map((c) => (
              <Link key={c.id} href={`/scheda/${c.id}`} className="flex items-center gap-3 rounded-xl p-1 hover:bg-white/5">
                <CharacterAvatar initials={initials(c.name)} online />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.occupation ?? "—"}</p>
                </div>
              </Link>
            ))}
            <Link href="/mappa" className="mt-2 flex items-center gap-1 text-sm font-medium text-flamingo hover:underline">
              Apri la mappa <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
