"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarDays,
  CircleUserRound,
  CloudSun,
  EyeOff,
  Info,
  LogOut,
  Map as MapIcon,
  Menu,
  Newspaper,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { CharacterAvatar } from "@/components/game/character-avatar";
import { ComingSoon, WindowButton } from "@/components/game/info-window";
import { isModalPath } from "@/components/game/page-modal";
import { TicketIcon } from "@/components/game/ticket-icon";
import { ForumIcon } from "@/components/game/forum-icon";
import { usePresence } from "@/components/game/presence";
import { sidebarIconClass } from "@/components/game/sidebar-styles";
import { FloatingWindow } from "@/components/floating-window";
import { signOut } from "@/lib/actions/auth";
import { AVAILABILITY, readAvailability, writeAvailability, type Availability } from "@/lib/availability";
import { initials } from "@/lib/format";
import { applyPrefs, cachedPrefs, loadPrefs } from "@/lib/prefs";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/* ------------------------------ Cassetto su mobile ------------------------------ */

const DrawerContext = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => {} });

/** Su mobile la barra laterale è un cassetto che si apre dal pulsante menu */
export function SidebarShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <DrawerContext.Provider value={{ open, setOpen }}>{children}</DrawerContext.Provider>;
}

export function MenuButton() {
  const { open, setOpen } = useContext(DrawerContext);
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className="grid size-10 place-items-center rounded-full text-foreground hover:bg-white/10 lg:hidden"
      aria-label={open ? "Chiudi il menu" : "Apri il menu"}
      aria-expanded={open}
    >
      {open ? <X className="size-5" /> : <Menu className="size-5" />}
    </button>
  );
}

/** Contenitore della barra laterale: fissa su desktop, cassetto su mobile */
export function SidebarFrame({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useContext(DrawerContext);
  const pathname = usePathname();
  // cambiando pagina il cassetto si chiude
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-night/60 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside
        className={cn(
          "fixed bottom-0 left-0 z-40 flex w-72 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar backdrop-blur-xl transition-transform",
          "top-20 lg:top-0 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {children}
      </aside>
    </>
  );
}

/* ------------------------------ Barra laterale ------------------------------ */

type RoomInfo = {
  name: string;
  description: string;
  image_url: string | null;
  district: { name: string; tagline: string | null; description: string; gradient: string } | null;
};

const CHAT_PATH = /^\/chat\/([0-9a-f-]{36})/i;

/** Pagina "sotto" le finestre: con una finestra aperta resta quella di prima */
function useBackgroundPath() {
  const pathname = usePathname();
  const [bg, setBg] = useState(pathname);
  if (!isModalPath(pathname) && pathname !== bg) setBg(pathname);
  return bg;
}

/** La chat in cui si è (letta una volta, serve all'immagine e ai presenti) */
function useCurrentRoom() {
  const roomId = CHAT_PATH.exec(useBackgroundPath())?.[1] ?? null;
  const [room, setRoom] = useState<{ id: string; info: RoomInfo | null } | null>(null);
  const info = room && room.id === roomId ? room.info : null;

  useEffect(() => {
    if (!roomId) return;
    let alive = true;
    createClient()
      .from("rooms")
      .select("name, description, image_url, district:locations(name, tagline, description, gradient)")
      .eq("id", roomId)
      .maybeSingle<RoomInfo>()
      .then(({ data }) => alive && setRoom({ id: roomId, info: data }));
    return () => {
      alive = false;
    };
  }, [roomId]);
  return { roomId, info };
}

/** Immagine della chat in cui si è, con info del luogo e meteo */
function PlaceCard({ info }: { info: RoomInfo | null }) {
  const title = info?.name ?? "Miami";
  const subtitle = info ? (info.district?.name ?? "") : "Florida";
  const gradient = info?.district?.gradient ?? "from-violet via-flamingo to-peach";
  const iconBtn = "grid size-8 place-items-center rounded-full bg-night/60 text-white backdrop-blur hover:bg-night/80";

  return (
    <div className={cn("relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br", gradient)}>
      {info?.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={info.image_url} alt="" className="absolute inset-0 size-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-night/85 via-night/10 to-transparent" />
      <div className="absolute top-2 right-2 flex gap-1.5">
        <WindowButton label="Info luogo" title={title} icon={<Info className="size-4" />} showLabel={false} className={iconBtn}>
          {info ? (
            <div className="flex flex-col gap-3 text-sm leading-relaxed">
              {info.district && <p className="text-xs tracking-widest text-muted-foreground uppercase">{info.district.name}</p>}
              <p className="whitespace-pre-line">{info.description || "Nessuna descrizione per questa chat."}</p>
              {info.district?.description && <p className="whitespace-pre-line text-muted-foreground">{info.district.description}</p>}
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Sei a Miami, Florida. Apri la mappa, scegli un quartiere ed entra in una chat: qui vedrai la sua immagine e la sua descrizione.
            </p>
          )}
        </WindowButton>
        <WindowButton label="Meteo" icon={<CloudSun className="size-4" />} showLabel={false} className={iconBtn}>
          <ComingSoon>
            <p>Qui comparirà il meteo di Miami nel mondo di gioco: cielo, temperatura e mare, impostati dallo staff.</p>
          </ComingSoon>
        </WindowButton>
      </div>
      <div className="absolute inset-x-3 bottom-2.5">
        {subtitle && <p className="text-[0.7rem] tracking-widest text-white/80 uppercase">{subtitle}</p>}
        <p className="truncate font-heading text-2xl leading-none tracking-wide text-white">{title}</p>
      </div>
    </div>
  );
}

/** Aggiorna, Mappa, Esci */
function MainButtons() {
  const router = useRouter();
  const inChat = CHAT_PATH.test(useBackgroundPath());
  // In chat "Aggiorna" ricarica la chat; altrove riporta alla mappa
  function update() {
    if (inChat) return router.refresh();
    router.push("/mappa");
    router.refresh();
  }
  const btn = "flex flex-col items-center gap-1 rounded-xl bg-white/5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground";
  return (
    <div className="grid grid-cols-3 gap-2">
      <button type="button" onClick={update} className={btn} title={inChat ? "Aggiorna la chat" : "Torna alla mappa aggiornata"}>
        <RefreshCw className="size-5 text-mint" /> Aggiorna
      </button>
      <Link href="/mappa" className={btn}>
        <MapIcon className="size-5 text-peach" /> Mappa
      </Link>
      <form action={signOut} className="contents">
        <button type="submit" className={btn}>
          <LogOut className="size-5 text-flamingo" /> Esci
        </button>
      </form>
    </div>
  );
}

const iconCls = sidebarIconClass;

/** Calendario, Social, Forum, Scheda, Ticket, Gestione */
function FeatureIcons({ adminSlot }: { adminSlot: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      <WindowButton label="Calendario" icon={<CalendarDays />} className={iconCls}>
        <ComingSoon>
          <p>Il calendario accademico e gli eventi della land: lezioni, feste, partite e appuntamenti dello staff.</p>
        </ComingSoon>
      </WindowButton>
      <Link href="/social" className={iconCls}>
        <Newspaper /> Social
      </Link>
      <ForumIcon />
      <Link href="/scheda" className={iconCls}>
        <CircleUserRound /> Scheda
      </Link>
      <TicketIcon />
      <Link href="/utility" className={iconCls}>
        <BriefcaseBusiness /> Utility
      </Link>
      {adminSlot}
    </div>
  );
}

/** Presenti online; cliccando si apre l'elenco esteso (con la propria disponibilità) */
function OnlineBox({ place, placeKey }: { place: string; placeKey: string }) {
  const [availability, setAvailability] = useState<Availability>(readAvailability);
  const { players, me } = usePresence({ availability, place, placeKey });
  const [open, setOpen] = useState(false);
  const list = players ?? [];

  function choose(a: Availability) {
    writeAvailability(a);
    setAvailability(a);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3 text-left transition-colors hover:bg-white/10">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Users className="size-4 text-mint" />
          Presenti online
          <span className="ml-auto rounded-full bg-mint/15 px-2 py-0.5 text-xs text-mint">{players ? list.length : "…"}</span>
        </span>
        {list.length > 0 ? (
          <span className="flex flex-col gap-1">
            {list.slice(0, 8).map((c) => (
              <span key={c.userId} className="flex items-center gap-2 truncate text-xs text-muted-foreground">
                <span className={cn("size-1.5 shrink-0 rounded-full", AVAILABILITY[c.availability].dot)} />
                <span className="truncate">{c.name}</span>
                {c.invisible && <EyeOff className="size-3 shrink-0" aria-label="Invisibile" />}
              </span>
            ))}
            {list.length > 8 && <span className="text-xs text-lavender">e altri {list.length - 8}…</span>}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{players ? "Nessuno online in questo momento." : "Caricamento…"}</span>
        )}
      </button>
      {open && (
        <FloatingWindow label="Presenti online" onClose={() => setOpen(false)} initialWidth={480} header={<h2 className="pb-4 font-heading text-3xl tracking-wide">Presenti online</h2>}>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">La tua disponibilità:</span>
            {(Object.keys(AVAILABILITY) as Availability[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => choose(a)}
                aria-pressed={availability === a}
                className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs", availability === a ? "bg-white/15 text-white" : "text-muted-foreground hover:bg-white/5")}
              >
                <span className={cn("size-2 rounded-full", AVAILABILITY[a].dot)} />
                {AVAILABILITY[a].label}
              </button>
            ))}
          </div>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuno online in questo momento.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {list.map((c) => {
                const row = (
                  <>
                    {c.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.avatar} alt="" className="size-10 shrink-0 rounded-full object-cover ring-2 ring-white/10" />
                    ) : (
                      <CharacterAvatar initials={initials(c.name)} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn("size-2 shrink-0 rounded-full", AVAILABILITY[c.availability].dot)} title={AVAILABILITY[c.availability].label} />
                        <span className="truncate font-medium">{c.name}</span>
                        {c.userId === me && <span className="text-xs text-muted-foreground">(tu)</span>}
                        {c.invisible && <EyeOff className="size-3.5 shrink-0 text-muted-foreground" aria-label="Invisibile" />}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{[c.place || "Mappa", AVAILABILITY[c.availability].label].join(" · ")}</span>
                    </span>
                    {c.levelColor && (
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold" style={{ backgroundColor: `${c.levelColor}33`, color: c.levelColor }}>
                        {c.levelName}
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={c.userId}>
                    {c.characterId ? (
                      <Link href={`/scheda/${c.characterId}`} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white/5">
                        {row}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 rounded-xl p-2">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </FloatingWindow>
      )}
    </>
  );
}

/** Applica le preferenze: subito quelle salvate nel browser, poi quelle del database */
function PrefsLoader() {
  useEffect(() => {
    const cached = cachedPrefs();
    if (cached) applyPrefs(cached);
    loadPrefs(createClient()).then(applyPrefs);
  }, []);
  return null;
}

/** Barra laterale del gioco */
export function GameSidebar({
  adminSlot,
  newsSlot,
  communitySlot,
}: {
  adminSlot: React.ReactNode;
  newsSlot: React.ReactNode;
  /** Assenze, ricerca di gioco, pettegolezzi */
  communitySlot: React.ReactNode;
}) {
  const { roomId, info } = useCurrentRoom();
  return (
    <div className="flex flex-col gap-4 p-4">
      <PrefsLoader />
      <div className="hidden justify-center lg:flex">
        <Logo href="/bacheca" size="sm" />
      </div>
      {newsSlot}
      <PlaceCard info={info} />
      <MainButtons />
      <FeatureIcons adminSlot={adminSlot} />
      <OnlineBox place={info?.name ?? (roomId ? "In chat" : "Mappa")} placeKey={roomId ? `chat:${roomId}` : "mappa"} />
      {communitySlot}
    </div>
  );
}
