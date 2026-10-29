import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { GuideButton } from "@/components/guide/guide-app";
import { MenuButton } from "@/components/game/game-sidebar";
import { MessageButtons } from "@/components/game/message-buttons";
import { NewsButton } from "@/components/game/news-panel";
import { CommunityButtons } from "@/components/game/community";
import { IdleLogout } from "@/components/game/site-watch";
import { getChatSettings } from "@/lib/data";
import { barButtonClass } from "@/components/game/sidebar-styles";
import { activeCharacter, can, getPlayer, requirePlayer } from "@/lib/auth";
import { firstName, initials } from "@/lib/format";
import { requestTime } from "@/lib/request-time";
import { createClient } from "@/lib/supabase/server";

const TOUCH_EVERY_MS = 2 * 60 * 1000;

/** Segna il personaggio come online (al massimo ogni 2 minuti) */
async function touchLastSeen(characterId: string, lastSeenAt: string | null) {
  const now = await requestTime();
  if (lastSeenAt && now.getTime() - new Date(lastSeenAt).getTime() < TOUCH_EVERY_MS) return;
  const supabase = await createClient();
  await supabase.from("characters").update({ last_seen_at: now.toISOString() }).eq("id", characterId);
}

/** Ritratto del personaggio (80x80), si cambia dalla scheda */
export async function PlayerPortrait() {
  const player = await requirePlayer();
  const character = activeCharacter(player);
  if (character) await touchLastSeen(character.id, character.last_seen_at);
  const name = firstName(player.character?.name ?? player.profile.username);
  const avatar = player.character?.avatar_url ?? null;
  return (
    <Link href="/scheda" className="group relative block" aria-label={`Scheda di ${name}`} title={name}>
      <span className="block size-16 overflow-hidden rounded-full ring-3 ring-flamingo/70 shadow-[0_0_24px_rgb(255_121_176/0.35)] transition group-hover:ring-peach lg:size-20">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center bg-gradient-to-br from-violet via-orchid to-peach font-heading text-2xl tracking-wider text-white lg:text-3xl">
            {initials(name)}
          </span>
        )}
      </span>
    </Link>
  );
}

/** Messaggi OFF e ON con i contatori del proprio personaggio */
export async function PlayerMessages({ center }: { center?: React.ReactNode }) {
  const player = await getPlayer();
  return <MessageButtons userId={player?.userId ?? null} center={center} />;
}

/** Segnaposto del ritratto mentre arriva dal database */
export function PortraitFallback() {
  return <span className="block size-16 animate-pulse rounded-full bg-white/10 lg:size-20" />;
}

/** Barra in alto: al centro Messaggi OFF, ritratto del personaggio e Telefono */
export function TopBar({ admin, messages }: { admin: React.ReactNode; messages: React.ReactNode }) {
  return (
    <header className="glass fixed inset-x-0 top-0 z-40 flex h-20 items-center border-x-0 border-t-0 px-2 pt-[env(safe-area-inset-top)] sm:px-4 lg:left-72 lg:h-24">
      {/* lati uguali: il gruppo centrale resta al centro anche con il pulsante del menu */}
      <div className="flex min-w-[4.75rem] flex-1 basis-0 items-center gap-1 sm:min-w-10">
        <MenuButton />
        {admin}
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-4">{messages}</div>
      <div className="min-w-[4.75rem] flex-1 basis-0 sm:min-w-10" />
    </header>
  );
}

/** Guida al gioco: pulsante lungo nella barra laterale, sotto le Notizie */
export async function PlayerGuide() {
  const player = await getPlayer();
  if (!player) return null;
  return <GuideButton canEdit={can(player, "guida.scrivere")} />;
}

/** Notizie dello staff: chi ha il permesso le scrive dalla stessa finestra */
export async function PlayerNews() {
  const player = await getPlayer();
  if (!player) return null;
  return <NewsButton canPublish={can(player, "annunci.globali")} />;
}

/** Assenze, ricerca di gioco e pettegolezzi, con i permessi dello staff */
export async function PlayerCommunity() {
  const player = await getPlayer();
  if (!player) return null;
  return (
    <CommunityButtons
      canAbsences={can(player, "assenze.gestire")}
      canRequests={can(player, "ricerca.moderare")}
      canGossip={can(player, "pettegolezzi.gestire")}
      characterId={activeCharacter(player)?.id ?? null}
    />
  );
}

/** Uscita automatica: il tempo è quello di Gestione → Chat (uscita dalla giocata) */
export async function PlayerIdle() {
  const player = await getPlayer();
  if (!player) return null;
  const settings = await getChatSettings();
  return <IdleLogout minutes={settings.idle_minutes} />;
}

/** Gestione nella barra in alto a sinistra: solo per chi può accedere al pannello (Livelli e permessi) */
export async function AdminTopIcon() {
  const player = await getPlayer();
  if (!player || !can(player, "admin.accedere")) return null;
  return (
    <Link href="/gestione" className={barButtonClass} aria-label="Gestione" title="Gestione">
      <ShieldCheck /> <span className="hidden sm:inline">Gestione</span>
    </Link>
  );
}
