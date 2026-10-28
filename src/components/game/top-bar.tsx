import Link from "next/link";
import { BookOpen, Palmtree, ShieldCheck } from "lucide-react";
import { ComingSoon, WindowButton } from "@/components/game/info-window";
import { MenuButton } from "@/components/game/game-sidebar";
import { MessageButtons } from "@/components/game/message-buttons";
import { NewsButton } from "@/components/game/news-panel";
import { barButtonClass as barBtn, sidebarIconClass } from "@/components/game/sidebar-styles";
import { activeCharacter, can, getPlayer, requirePlayer } from "@/lib/auth";
import { initials } from "@/lib/format";
import { requestTime } from "@/lib/request-time";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

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
  const name = player.character?.name ?? player.profile.username;
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
      <span
        className={cn("absolute right-1 bottom-1 size-3.5 rounded-full ring-2 ring-night", character ? "bg-mint" : "bg-muted-foreground/60")}
        aria-label={character ? "In gioco" : "Scheda non ancora approvata"}
      />
    </Link>
  );
}

/** Messaggi OFF e ON con i contatori del proprio personaggio */
export async function PlayerMessages() {
  const player = await getPlayer();
  return <MessageButtons userId={player?.userId ?? null} />;
}

/** Segnaposto del ritratto mentre arriva dal database */
export function PortraitFallback() {
  return <span className="block size-16 animate-pulse rounded-full bg-white/10 lg:size-20" />;
}

/** Barra in alto: guida e ambientazione, ritratto al centro, messaggi */
export function TopBar({ portrait, messages }: { portrait: React.ReactNode; messages: React.ReactNode }) {
  return (
    <header className="glass fixed inset-x-0 top-0 z-40 flex h-20 items-center border-x-0 border-t-0 px-2 pt-[env(safe-area-inset-top)] sm:px-4 lg:left-72 lg:h-24">
      <div className="flex flex-1 items-center gap-0.5 sm:gap-1">
        <MenuButton />
        <WindowButton label="Guida" shortLabel="Guida" icon={<BookOpen />} className={barBtn} width={600}>
          <ComingSoon>
            <p>La guida al gioco: come si crea il personaggio, come si gioca in chat, il sistema Interlock e il regolamento.</p>
            <p>Lo staff potrà scriverla e aggiornarla dal pannello di gestione.</p>
          </ComingSoon>
        </WindowButton>
        <WindowButton label="Ambientazione" shortLabel="Mondo" icon={<Palmtree />} className={barBtn} width={600}>
          <ComingSoon>
            <p>Miami, Florida: il college, i quartieri, la vita tra lezioni, spiaggia e locali al tramonto.</p>
            <p>Lo staff potrà scrivere qui l&apos;ambientazione completa dal pannello di gestione.</p>
          </ComingSoon>
        </WindowButton>
      </div>

      <div className="shrink-0">
        {portrait}
      </div>

      <div className="flex flex-1 items-center justify-end gap-0.5 sm:gap-1">
        {messages}
      </div>
    </header>
  );
}

/** Notizie dello staff: chi ha il permesso le scrive dalla stessa finestra */
export async function PlayerNews() {
  const player = await getPlayer();
  if (!player) return null;
  return <NewsButton canPublish={can(player, "annunci.globali")} />;
}

/** Icona Gestione nella barra laterale: solo per chi può accedere al pannello */
export async function AdminSidebarIcon() {
  const player = await getPlayer();
  if (!player || !can(player, "admin.accedere")) return null;
  return (
    <Link href="/gestione" className={sidebarIconClass}>
      <ShieldCheck /> Gestione
    </Link>
  );
}
