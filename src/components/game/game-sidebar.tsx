"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarDays,
  CircleUserRound,
  CloudSun,
  Eye,
  EyeOff,
  Info,
  LogOut,
  Map as MapIcon,
  Menu,
  MessagesSquare,
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
import { SocialIcon } from "@/components/social/social-icon";
import { usePresence } from "@/components/game/presence";
import { useMiamiWeather, WeatherBadge, WeatherDetails } from "@/components/game/weather";
import { sidebarIconClass } from "@/components/game/sidebar-styles";
import { FloatingWindow } from "@/components/floating-window";
import { signOut } from "@/lib/actions/auth";
import { AVAILABILITY, readAvailability, readPresenceNote, writeAvailability, writePresenceNote, type Availability } from "@/lib/availability";
import { initials } from "@/lib/format";
import { applyPrefs, cachedPrefs, loadPrefs } from "@/lib/prefs";
import { createClient } from "@/lib/supabase/client";
import { setInvisible } from "@/lib/actions/chat";
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
  const weather = useMiamiWeather();

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
        {/* meteo reale di Miami: icona e temperatura, cliccando il dettaglio */}
        <WindowButton
          label="Meteo"
          title="Meteo a Miami"
          icon={weather ? <WeatherBadge weather={weather} /> : <CloudSun className="size-4" />}
          showLabel={false}
          className="flex h-8 min-w-8 items-center justify-center rounded-full bg-night/60 px-2 text-white backdrop-blur hover:bg-night/80"
          width={440}
        >
          <WeatherDetails weather={weather} />
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
function FeatureIcons() {
  return (
    <div className="grid grid-cols-3 gap-1">
      <WindowButton label="Calendario" icon={<CalendarDays />} className={iconCls}>
        <ComingSoon>
          <p>Il calendario accademico e gli eventi della land: lezioni, feste, partite e appuntamenti dello staff.</p>
        </ComingSoon>
      </WindowButton>
      <SocialIcon />
      <ForumIcon />
      <Link href="/scheda" className={iconCls}>
        <CircleUserRound /> Scheda
      </Link>
      <TicketIcon />
      <Link href="/utility" className={iconCls}>
        <BriefcaseBusiness /> Utility
      </Link>
    </div>
  );
}

/** Presenti: a sinistra solo chi è nel mio stesso posto (la mia chat o la mappa); cliccando si apre l'elenco esteso */
function OnlineBox({ place, placeKey }: { place: string; placeKey: string }) {
  const [availability, setAvailability] = useState<Availability>(readAvailability);
  // messaggio OFF personale, mostrato sotto il nome nei presenti estesi
  const [note, setNote] = useState<string>(readPresenceNote);
  const [noteDraft, setNoteDraft] = useState(note);
  const { players, me, refresh } = usePresence({ availability, place, placeKey, note });
  const [open, setOpen] = useState(false);
  const list = players ?? [];
  const here = list.filter((c) => c.placeKey === placeKey);
  const router = useRouter();
  // Invisibilità (solo staff con il permesso): interruttore nella finestra dei presenti
  const [canInvisible, setCanInvisible] = useState(false);
  const [invisibleBusy, setInvisibleBusy] = useState(false);
  const [invisibleError, setInvisibleError] = useState<string | null>(null);
  const amInvisible = list.find((c) => c.userId === me)?.invisible ?? false;
  useEffect(() => {
    if (!open) return;
    let alive = true;
    createClient()
      .rpc("has_permission", { perm: "staff.invisibile" })
      .then(({ data }) => {
        if (alive) setCanInvisible(data === true);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  async function toggleInvisible() {
    setInvisibleBusy(true);
    setInvisibleError(null);
    const res = await setInvisible(!amInvisible);
    setInvisibleBusy(false);
    if (res.error) return setInvisibleError(res.error);
    await refresh();
    router.refresh();
  }

  function choose(a: Availability) {
    writeAvailability(a);
    setAvailability(a);
  }

  function saveNote() {
    const clean = noteDraft.trim().slice(0, 80);
    setNoteDraft(clean);
    if (clean === note) return;
    writePresenceNote(clean);
    setNote(clean);
  }

  // Gruppi per posto: prima il mio, poi le chat in ordine di nome, la mappa in fondo
  // chi è in cerca di gioco va in cima a tutto, fuori dai gruppi (il gruppo resta e lo conta)
  const seekers = list.filter((c) => c.availability === "cerca");
  const groups = [...new Set(list.map((c) => c.placeKey))]
    .map((key) => {
      const all = list.filter((c) => c.placeKey === key);
      const chatId = key.startsWith("chat:") ? key.slice(5) : null;
      return { key, chatId, name: chatId ? all[0]?.place || "Chat" : "Mappa", count: all.length, members: all.filter((c) => c.availability !== "cerca") };
    })
    .sort((a, b) => (a.key === placeKey ? -1 : b.key === placeKey ? 1 : !a.chatId ? 1 : !b.chatId ? -1 : a.name.localeCompare(b.name, "it")));

  // Riga di un presente nell'elenco esteso: nome e, sotto, il suo messaggio OFF
  function playerRow(c: (typeof list)[number], seeking: boolean) {
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
            <span className={cn("truncate font-medium", seeking && "font-semibold text-peach")}>{c.name}</span>
            {c.userId === me && <span className="text-xs text-muted-foreground">(tu)</span>}
            {c.invisible && <EyeOff className="size-3.5 shrink-0 text-muted-foreground" aria-label="Invisibile" />}
            {seeking && <span className="ml-auto shrink-0 truncate text-[0.7rem] text-muted-foreground">{c.placeKey.startsWith("chat:") ? c.place || "In chat" : "Mappa"}</span>}
          </span>
          {c.note && <span className="block text-xs break-words text-lavender italic">{c.note}</span>}
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
          <Link href={`/scheda/${c.characterId}`} title={`Apri la scheda di ${c.name}`} className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white/5">
            {row}
          </Link>
        ) : (
          <div className="flex items-center gap-3 rounded-xl p-2" title="Non ha ancora creato il personaggio">
            {row}
          </div>
        )}
      </li>
    );
  }

  return (
    <>
      {/* Telefono: solo l'icona con il numero, che apre l'elenco */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-2xl bg-white/5 p-3 text-sm font-medium transition-colors hover:bg-white/10 lg:hidden"
        aria-label={`Presenti online: ${players ? list.length : "…"}`}
      >
        <Users className="size-5 text-mint" />
        <span className="rounded-full bg-mint/15 px-2 py-0.5 text-xs text-mint">{players ? list.length : "…"}</span>
      </button>
      <div className="hidden max-h-[250px] flex-col gap-2 rounded-2xl bg-white/5 p-3 lg:flex">
        {/* Il titolo apre l'elenco esteso; il nome apre la scheda */}
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-lg text-left text-sm font-medium transition-colors hover:text-mint" title="Tutti i presenti online">
          <Users className="size-4 text-mint" />
          Online
          <span className="ml-auto rounded-full bg-mint/15 px-2 py-0.5 text-xs text-mint" title={`${list.length} online in tutto il gioco`}>
            {players ? list.length : "…"}
          </span>
        </button>
        {here.length > 0 ? (
          <span className="-mr-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto pr-1">
            {here.map((c) => {
              const inner = (
                <>
                  <span className={cn("size-2 shrink-0 rounded-full", AVAILABILITY[c.availability].dot)} title={AVAILABILITY[c.availability].label} />
                  <span className="truncate">{c.name}</span>
                  {c.invisible && <EyeOff className="size-3 shrink-0" aria-label="Invisibile" />}
                </>
              );
              return c.characterId ? (
                <Link
                  key={c.userId}
                  href={`/scheda/${c.characterId}`}
                  title={`Apri la scheda di ${c.name}`}
                  className="flex items-center gap-2 truncate rounded-lg px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                >
                  {inner}
                </Link>
              ) : (
                <span key={c.userId} title="Non ha ancora creato il personaggio" className="flex items-center gap-2 truncate px-1 py-0.5 text-xs text-muted-foreground">
                  {inner}
                </span>
              );
            })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{players ? placeKey === "mappa" ? "Nessuno in mappa." : "Nessuno in questa chat." : "Caricamento…"}</span>
        )}
      </div>
      {open && (
        <FloatingWindow label="Presenti online" onClose={() => setOpen(false)} initialWidth={600} header={<h2 className="pb-4 font-heading text-3xl tracking-wide">Presenti online</h2>}>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
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
          {/* messaggio OFF: lo vedono tutti sotto il nome */}
          <form
            className="mb-4 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveNote();
            }}
          >
            <span className="shrink-0 rounded-full bg-lavender/20 px-2 py-0.5 text-[0.65rem] font-bold text-lavender">OFF</span>
            <input
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={saveNote}
              maxLength={80}
              placeholder="Messaggio OFF, es. «Rispondo tra 10 minuti»"
              className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-night/40 px-3 text-sm outline-none focus-visible:border-ring"
              aria-label="Messaggio OFF"
            />
            <button type="submit" className="h-9 shrink-0 rounded-full bg-white/10 px-3 text-xs hover:bg-white/15">
              Salva
            </button>
          </form>
          {canInvisible && (
            <div className="mb-4 flex flex-col gap-1">
              <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
                <button
                  type="button"
                  role="switch"
                  aria-checked={amInvisible}
                  disabled={invisibleBusy}
                  onClick={toggleInvisible}
                  className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50", amInvisible ? "bg-lavender/70" : "bg-white/15")}
                >
                  <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", amInvisible ? "left-5.5" : "left-0.5")} />
                </button>
                {amInvisible ? <EyeOff className="size-4 text-lavender" /> : <Eye className="size-4 text-muted-foreground" />}
                {amInvisible ? "Invisibile" : "Visibile"}
              </label>
              <p className="text-xs text-muted-foreground">
                {amInvisible
                  ? "Gli altri giocatori non ti vedono tra i presenti né in chat."
                  : "Diventando invisibile esci dalla giocata in cui sei: gli altri non ti vedono tra i presenti né in chat."}
              </p>
              {invisibleError && <p className="text-xs text-destructive">{invisibleError}</p>}
            </div>
          )}
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuno online in questo momento.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {/* chi è in cerca di gioco: in cima a tutta la lista, con il nome evidenziato */}
              {seekers.length > 0 && (
                <section className="rounded-2xl bg-peach/10 p-2 ring-1 ring-peach/30">
                  <p className="mb-1 flex items-center gap-2 px-1 font-heading text-lg tracking-[0.12em] text-peach uppercase">
                    <span className={cn("size-2 rounded-full", AVAILABILITY.cerca.dot)} />
                    In cerca di gioco
                    <span className="font-sans text-xs tracking-normal text-muted-foreground normal-case">({seekers.length})</span>
                  </p>
                  <ul className="flex flex-col gap-1">{seekers.map((c) => playerRow(c, true))}</ul>
                </section>
              )}
              {groups.map((g) => (
                <section key={g.key}>
                  {/* nome del posto: cliccando si entra in quella chat (o si va alla mappa) */}
                  {g.name === "Chat privata" ? (
                    <p className="mb-1 flex w-fit items-center gap-2 px-1 font-heading text-lg tracking-[0.12em] text-lavender uppercase">
                      <MessagesSquare className="size-4" />
                      {g.name}
                      <span className="font-sans text-xs tracking-normal text-muted-foreground normal-case">({g.count})</span>
                      {g.key === placeKey && <span className="font-sans text-[0.65rem] tracking-normal text-mint normal-case">· sei qui</span>}
                    </p>
                  ) : (
                  <Link
                    href={g.chatId ? `/chat/${g.chatId}` : "/mappa"}
                    onClick={() => setOpen(false)}
                    title={g.chatId ? `Entra in ${g.name}` : "Vai alla mappa"}
                    className="mb-1 flex w-fit items-center gap-2 rounded-lg px-1 font-heading text-lg tracking-[0.12em] text-lavender uppercase hover:text-flamingo hover:underline"
                  >
                    {g.chatId ? <MessagesSquare className="size-4" /> : <MapIcon className="size-4" />}
                    {g.name}
                    <span className="font-sans text-xs tracking-normal text-muted-foreground normal-case">({g.count})</span>
                    {g.key === placeKey && <span className="font-sans text-[0.65rem] tracking-normal text-mint normal-case">· sei qui</span>}
                  </Link>
                  )}
                  {g.members.length > 0 ? (
                    <ul className="flex flex-col gap-1">{g.members.map((c) => playerRow(c, false))}</ul>
                  ) : (
                    <p className="px-1 text-xs text-muted-foreground">Solo chi è in cerca di gioco (in alto).</p>
                  )}
                </section>
              ))}
            </div>
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
  newsSlot,
  communitySlot,
}: {
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
      <PlaceCard info={info} />
      <MainButtons />
      {newsSlot}
      <FeatureIcons />
      {communitySlot}
      <OnlineBox place={info?.name ?? (roomId ? "In chat" : "Mappa")} placeKey={roomId ? `chat:${roomId}` : "mappa"} />
    </div>
  );
}
