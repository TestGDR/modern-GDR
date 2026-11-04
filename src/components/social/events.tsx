"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Eye, EyeOff, ImagePlus, KeyRound, Lock, MapPin, Pencil, Plus, Trash2, UserPlus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePersonSearch } from "@/components/social/composer";
import { Avatar, MediaItem, PersonName, useSocial } from "@/components/social/social-ui";
import { useResync } from "@/lib/use-resync";
import {
  EVENT_SELECT,
  GUEST_LABEL,
  PERSON,
  POST_SELECT,
  VISIBILITY_LABEL,
  eventWhen,
  fromRomeInput,
  handleOf,
  toRomeInput,
  type EventGuest,
  type EventVisibility,
  type GuestStatus,
  type SocialEvent,
  type SocialPost,
} from "@/lib/social";
import { cn } from "@/lib/utils";

// Eventi del social: elenco, pagina dell'evento (risposte, ospiti, password della festa, foto) e modulo.
// Tutte le scritture passano dalle funzioni social_event_* del database.

const input = "h-10 w-full min-w-0 rounded-xl border border-white/15 bg-night/50 px-3 text-sm outline-none focus-visible:border-peach/60";

/** L'evento è finito? (senza fine: 12 ore dopo l'inizio) */
function ended(ev: Pick<SocialEvent, "starts_at" | "ends_at">) {
  return new Date(ev.ends_at ?? new Date(ev.starts_at).getTime() + 12 * 3600_000).getTime() < Date.now();
}

/* ------------------------------ Elenco ------------------------------ */

type Tab = "prossimi" | "miei" | "passati";

export function EventsView() {
  const { supabase, me, go } = useSocial();
  const [tab, setTab] = useState<Tab>("prossimi");
  const [events, setEvents] = useState<SocialEvent[] | null>(null);

  const load = useCallback(async () => {
    // fino a 12 ore dopo l'inizio un evento è ancora "in corso"
    const cutoff = new Date(Date.now() - 12 * 3600_000).toISOString();
    if (tab === "miei") {
      if (!me) return setEvents([]);
      const [own, guest] = await Promise.all([
        supabase.from("social_events").select(EVENT_SELECT).eq("character_id", me.id).order("starts_at", { ascending: false }).limit(50),
        supabase.from("social_event_guests").select(`event:social_events(${EVENT_SELECT})`).eq("character_id", me.id).limit(50),
      ]);
      const all = [
        ...((own.data ?? []) as unknown as SocialEvent[]),
        ...((guest.data ?? []) as unknown as { event: SocialEvent | null }[]).map((x) => x.event).filter((x): x is SocialEvent => x !== null),
      ];
      setEvents(all.filter((e, i) => all.findIndex((x) => x.id === e.id) === i).sort((a, b) => b.starts_at.localeCompare(a.starts_at)));
      return;
    }
    const q = supabase.from("social_events").select(EVENT_SELECT).limit(60);
    const { data } = tab === "prossimi" ? await q.gte("starts_at", cutoff).order("starts_at") : await q.lt("starts_at", cutoff).order("starts_at", { ascending: false });
    setEvents((data ?? []) as unknown as SocialEvent[]);
  }, [supabase, me, tab]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  useResync(load);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-3xl tracking-wide text-sunset">Eventi</h2>
        {me && (
          <Button type="button" size="sm" className="ml-auto rounded-full" onClick={() => go({ kind: "event-edit" })}>
            <Plus /> Crea evento
          </Button>
        )}
      </div>
      <div className="flex border-b border-white/10">
        {(
          [
            ["prossimi", "Prossimi"],
            ["miei", "I miei"],
            ["passati", "Passati"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn("flex-1 border-b-2 py-2 text-xs tracking-wider uppercase", tab === k ? "border-white text-white" : "border-transparent text-muted-foreground")}
          >
            {label}
          </button>
        ))}
      </div>
      {events === null ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : events.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {tab === "prossimi" ? "Nessun evento in programma. Organizzane uno!" : tab === "miei" ? "Non organizzi e non sei invitato a nessun evento." : "Nessun evento passato."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((ev) => (
            <li key={ev.id}>
              <EventCard ev={ev} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Riga di un evento: copertina, titolo, quando, dove, partecipanti */
export function EventCard({ ev }: { ev: SocialEvent }) {
  const { me, go } = useSocial();
  const going = ev.social_event_guests.filter((g) => g.status === "partecipo").length;
  const mine = me ? ev.social_event_guests.find((g) => g.character_id === me.id)?.status : undefined;
  const place = ev.room?.name ?? ev.place;
  return (
    <button
      type="button"
      onClick={() => go({ kind: "event", id: ev.id })}
      className={cn("flex w-full items-stretch gap-3 overflow-hidden rounded-2xl border border-white/10 bg-night/40 text-left hover:bg-white/5", ended(ev) && "opacity-70")}
    >
      <span className="relative w-24 shrink-0 bg-gradient-to-br from-violet via-orchid to-peach">
        {ev.cover_url ? <MediaItem media={{ type: "image", url: ev.cover_url }} thumb /> : <CalendarDays className="absolute inset-0 m-auto size-8 text-white/80" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-2 pr-3">
        <span className="truncate font-semibold">{ev.title}</span>
        <span className="text-xs text-peach capitalize">{eventWhen(ev.starts_at)}</span>
        {place && (
          <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" /> {place}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="size-3" /> {going} partecipa{going === 1 ? "" : "no"}
          </span>
          {ev.visibility !== "pubblico" && <span>· {VISIBILITY_LABEL[ev.visibility]}</span>}
          {ev.has_password && <Lock className="size-3" aria-label="Con password" />}
          {me?.id === ev.character_id ? <span className="text-mint">· Organizzi tu</span> : mine && <span className="text-lavender">· {GUEST_LABEL[mine]}</span>}
        </span>
      </span>
    </button>
  );
}

/** Eventi organizzati da un personaggio (scheda Eventi del profilo) */
export function ProfileEvents({ id }: { id: string }) {
  const { supabase } = useSocial();
  const [events, setEvents] = useState<SocialEvent[] | null>(null);
  useEffect(() => {
    let alive = true;
    supabase
      .from("social_events")
      .select(EVENT_SELECT)
      .eq("character_id", id)
      .order("starts_at", { ascending: false })
      .limit(40)
      .then(({ data }) => alive && setEvents((data ?? []) as unknown as SocialEvent[]));
    return () => {
      alive = false;
    };
  }, [supabase, id]);
  if (events === null) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  if (events.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Nessun evento organizzato.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {events.map((ev) => (
        <li key={ev.id}>
          <EventCard ev={ev} />
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------ Pagina dell'evento ------------------------------ */

export function EventView({ id, onBack }: { id: string; onBack: () => void }) {
  const { supabase, me, canModerate, go } = useSocial();
  const router = useRouter();
  const [ev, setEv] = useState<SocialEvent | null | undefined>(undefined);
  const [guests, setGuests] = useState<EventGuest[]>([]);
  const [photos, setPhotos] = useState<SocialPost[]>([]);
  const [secret, setSecret] = useState<{ map_id: string; password: string } | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [inviteQuery, setInviteQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [e, g, p, s] = await Promise.all([
      supabase.from("social_events").select(EVENT_SELECT).eq("id", id).maybeSingle(),
      supabase.from("social_event_guests").select(`character_id, status, character:characters(${PERSON})`).eq("event_id", id).order("updated_at"),
      supabase.from("social_posts").select(POST_SELECT).eq("event_id", id).order("created_at", { ascending: false }).limit(60),
      supabase.rpc("social_event_password", { p_event: id }),
    ]);
    setEv((e.data ?? null) as unknown as SocialEvent | null);
    setGuests((g.data ?? []) as unknown as EventGuest[]);
    setPhotos((p.data ?? []) as unknown as SocialPost[]);
    setSecret((s.data ?? null) as { map_id: string; password: string } | null);
  }, [supabase, id]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  useResync(load);

  const invited = new Set([...guests.map((g) => g.character_id), ev?.character_id ?? ""]);
  const found = usePersonSearch(inviteQuery).filter((p) => !invited.has(p.id));

  async function call(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc(fn, args);
    setBusy(false);
    if (e) {
      setError(e.message);
      return false;
    }
    await load();
    return true;
  }

  async function enterParty() {
    if (!secret) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("open_secret_room", { p_map: secret.map_id, p_password: secret.password });
    setBusy(false);
    if (e || !data) return setError(e?.message ?? "Non è stato possibile aprire la chat della festa.");
    router.push(`/chat/${data as string}`);
  }

  if (ev === undefined) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  if (ev === null)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Evento non trovato: è stato eliminato o non puoi vederlo.</p>
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onBack}>
          Indietro
        </Button>
      </div>
    );

  const isOwner = me?.id === ev.character_id;
  const myStatus = me ? guests.find((g) => g.character_id === me.id)?.status : undefined;
  const over = ended(ev);
  const canAnswer = !!me && !isOwner && !over && (ev.visibility !== "invito" || !!myStatus);
  const byStatus = (s: GuestStatus) => guests.filter((g) => g.status === s);
  const canPost = isOwner || myStatus === "partecipo" || myStatus === "forse";

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-gradient-to-br from-violet via-orchid to-peach">
        {ev.cover_url ? <MediaItem media={{ type: "image", url: ev.cover_url }} thumb /> : <CalendarDays className="absolute inset-0 m-auto size-14 text-white/80" />}
        {over && <span className="absolute top-2 left-2 rounded-full bg-night/80 px-2 py-0.5 text-xs">Concluso</span>}
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-3xl leading-tight tracking-wide">{ev.title}</h2>
        <p className="flex items-center gap-1.5 text-sm text-peach capitalize">
          <CalendarDays className="size-4 shrink-0" /> {eventWhen(ev.starts_at, ev.ends_at)}
        </p>
        {(ev.room || ev.place) && (
          <p className="flex items-center gap-1.5 text-sm">
            <MapPin className="size-4 shrink-0 text-muted-foreground" />
            {ev.room ? (
              <button type="button" className="text-lavender hover:underline" onClick={() => router.push(`/chat/${ev.room!.id}`)}>
                {ev.room.name}
              </button>
            ) : (
              ev.place
            )}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          Organizza <PersonName person={ev.organizer} className="text-foreground" /> · {VISIBILITY_LABEL[ev.visibility]}
        </p>
      </div>

      {ev.description && <p className="rounded-xl bg-night/40 p-3 text-sm whitespace-pre-line">{ev.description}</p>}

      {error && <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>}

      {/* risposta */}
      {canAnswer && (
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["partecipo", "Partecipo"],
              ["forse", "Forse"],
              ["non_vengo", "Non vengo"],
            ] as const
          ).map(([s, label]) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={myStatus === s ? "default" : "outline"}
              className="flex-1 rounded-full"
              disabled={busy}
              onClick={() => call("social_event_rsvp", { p_event: ev.id, p_character: me!.id, p_status: s })}
            >
              {myStatus === s && <Check />} {label}
            </Button>
          ))}
        </div>
      )}
      {!isOwner && me && ev.visibility === "invito" && !myStatus && <p className="text-sm text-muted-foreground">Questo evento è solo su invito.</p>}

      {/* password della festa */}
      {secret && (
        <section className="flex flex-col gap-2 rounded-2xl border border-flamingo/30 bg-flamingo/10 p-3">
          <h3 className="flex items-center gap-1.5 font-semibold text-flamingo">
            <KeyRound className="size-4" /> Chat privata della festa
          </h3>
          <p className="flex items-center gap-2 text-sm">
            Password: <code className="rounded bg-night/60 px-2 py-0.5">{showPass ? secret.password : "••••••"}</code>
            <button type="button" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? "Nascondi la password" : "Mostra la password"} className="text-muted-foreground hover:text-foreground">
              {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </p>
          <p className="text-xs text-muted-foreground">
            La vede solo chi organizza e chi è invitato o partecipa. Si può anche scrivere nel campo «Chat con password» sotto la mappa: la chat resta finché c&apos;è qualcuno dentro.
          </p>
          <Button type="button" size="sm" className="self-start rounded-full" disabled={busy || !me} onClick={enterParty}>
            <Lock /> Entra alla festa
          </Button>
        </section>
      )}

      {/* ospiti */}
      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-1.5 font-heading text-xl tracking-wide text-peach">
          <Users className="size-4" /> Ospiti
        </h3>
        {(["partecipo", "forse", "invitato"] as const).map((s) => {
          const list = byStatus(s);
          if (list.length === 0) return null;
          return (
            <div key={s} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {s === "partecipo" ? "Partecipano" : s === "forse" ? "Forse" : "In attesa di risposta"} ({list.length})
              </span>
              <ul className="flex flex-wrap gap-1.5">
                {list.map((g) => (
                  <li key={g.character_id} className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pr-2 pl-1 text-xs">
                    <button type="button" onClick={() => g.character && go({ kind: "profile", id: g.character.id })} className="flex items-center gap-1.5">
                      <Avatar person={g.character} size="size-6" /> {handleOf(g.character)}
                    </button>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => call("social_event_remove_guest", { p_event: ev.id, p_character: g.character_id })}
                        className="rounded-full p-0.5 hover:bg-destructive/30"
                        aria-label={`Togli ${handleOf(g.character)}`}
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {byStatus("non_vengo").length > 0 && <span className="text-xs text-muted-foreground">Non vengono: {byStatus("non_vengo").length}</span>}
        {guests.filter((g) => g.status !== "non_vengo").length === 0 && <p className="text-sm text-muted-foreground">Ancora nessuno.</p>}

        {isOwner && !over && (
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2">
              <UserPlus className="size-4 shrink-0 text-muted-foreground" />
              <input value={inviteQuery} onChange={(e) => setInviteQuery(e.target.value)} placeholder="Invita: scrivi nome o @nome" className={input} />
            </label>
            {found.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {found.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        if (await call("social_event_invite", { p_event: ev.id, p_characters: [p.id] })) setInviteQuery("");
                      }}
                      className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pr-3 pl-1 text-xs hover:bg-white/20"
                    >
                      <Avatar person={p} size="size-5" /> {handleOf(p)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* foto dall'evento */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="flex items-center gap-1.5 font-heading text-xl tracking-wide text-peach">
            <ImagePlus className="size-4" /> Foto dall&apos;evento
          </h3>
          {canPost && (
            <Button type="button" size="xs" variant="secondary" className="ml-auto rounded-full" onClick={() => go({ kind: "new", eventId: ev.id })}>
              <Plus /> Pubblica
            </Button>
          )}
        </div>
        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun post collegato all&apos;evento.{canPost ? " Pubblica le tue foto: compariranno qui." : ""}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-0.5">
            {photos.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => go({ kind: "post", id: p.id })} className="relative block aspect-square w-full overflow-hidden bg-white/5" aria-label="Apri il post">
                  {p.media[0] ? <MediaItem media={p.media[0]} thumb /> : <span className="line-clamp-5 p-2 text-left text-[0.7rem] text-muted-foreground">{p.body}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(isOwner || canModerate) && (
        <div className="flex gap-2 border-t border-white/10 pt-3">
          {isOwner && (
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => go({ kind: "event-edit", id: ev.id })}>
              <Pencil /> Modifica
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full text-destructive"
            disabled={busy}
            onClick={async () => {
              if (window.confirm(`Eliminare l'evento «${ev.title}»? I post restano, ma senza il collegamento.`) && (await call("social_event_delete", { p_event: ev.id }))) onBack();
            }}
          >
            <Trash2 /> Elimina
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Crea / modifica ------------------------------ */

type RoomOption = { id: string; name: string; location: { name: string } | null };

export function EventEditor({ id, onSaved }: { id?: string; onSaved: (id: string) => void }) {
  const { supabase, me } = useSocial();
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loaded, setLoaded] = useState(!id);
  const [f, setF] = useState({
    title: "",
    description: "",
    cover: "",
    starts: "",
    ends: "",
    room: "",
    place: "",
    visibility: "pubblico" as EventVisibility,
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    let alive = true;
    supabase
      .from("rooms")
      .select("id, name, location:locations(name)")
      .neq("access", "password")
      .order("sort_order")
      .then(({ data }) => alive && setRooms((data ?? []) as unknown as RoomOption[]));
    if (id) {
      Promise.all([supabase.from("social_events").select(EVENT_SELECT).eq("id", id).maybeSingle(), supabase.rpc("social_event_password", { p_event: id })]).then(([e, s]) => {
        if (!alive) return;
        const ev = e.data as unknown as SocialEvent | null;
        if (ev)
          setF({
            title: ev.title,
            description: ev.description,
            cover: ev.cover_url ?? "",
            starts: toRomeInput(ev.starts_at),
            ends: ev.ends_at ? toRomeInput(ev.ends_at) : "",
            room: ev.room_id ?? "",
            place: ev.place,
            visibility: ev.visibility,
            password: (s.data as { password: string } | null)?.password ?? "",
          });
        setLoaded(true);
      });
    }
    return () => {
      alive = false;
    };
  }, [supabase, id]);

  // chat raggruppate per quartiere
  const groups = useMemo(() => {
    const m = new Map<string, RoomOption[]>();
    for (const r of rooms) m.set(r.location?.name ?? "Altro", [...(m.get(r.location?.name ?? "Altro") ?? []), r]);
    return [...m.entries()];
  }, [rooms]);

  async function save() {
    if (!me) return;
    if (f.title.trim().length < 3) return setError("Il titolo deve avere almeno 3 caratteri.");
    if (!f.starts) return setError("Scegli data e ora dell'inizio.");
    if (f.cover.trim() && !/^https:\/\/\S+$/.test(f.cover.trim())) return setError("La copertina deve essere un link https://");
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("social_event_save", {
      p_event: id ?? null,
      p_character: me.id,
      p_title: f.title.trim(),
      p_description: f.description.trim(),
      p_cover: f.cover.trim(),
      p_starts: fromRomeInput(f.starts),
      p_ends: f.ends ? fromRomeInput(f.ends) : null,
      p_room: f.room || null,
      p_place: f.room ? "" : f.place.trim(),
      p_visibility: f.visibility,
      p_password: f.password.trim(),
    });
    setBusy(false);
    if (e || !data) return setError(e?.message ?? "Evento non salvato.");
    onSaved(data as string);
  }

  if (!me) return <p className="text-sm text-muted-foreground">Serve un personaggio approvato.</p>;
  if (!loaded) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  const label = "flex flex-col gap-1 text-xs text-muted-foreground";
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-heading text-3xl tracking-wide text-sunset">{id ? "Modifica evento" : "Nuovo evento"}</h2>
      <label className={label}>
        Titolo
        <input value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={100} placeholder="es. Pool party da Santiago" className={input} />
      </label>
      <label className={label}>
        Copertina (link di un&apos;immagine, facoltativo)
        <input value={f.cover} onChange={(e) => set("cover", e.target.value)} maxLength={500} placeholder="https://…" className={input} />
      </label>
      {f.cover.trim().startsWith("https://") && (
        <div className="aspect-video w-full overflow-hidden rounded-xl border border-white/10">
          <MediaItem media={{ type: "image", url: f.cover.trim() }} thumb />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Inizio (ora italiana)
          <input type="datetime-local" value={f.starts} onChange={(e) => set("starts", e.target.value)} className={input} />
        </label>
        <label className={label}>
          Fine (facoltativa)
          <input type="datetime-local" value={f.ends} onChange={(e) => set("ends", e.target.value)} className={input} />
        </label>
      </div>
      <label className={label}>
        Dove
        <select value={f.room} onChange={(e) => set("room", e.target.value)} className={input}>
          <option value="">Altro luogo (scrivilo qui sotto)</option>
          {groups.map(([loc, list]) => (
            <optgroup key={loc} label={loc}>
              {list.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {!f.room && <input value={f.place} onChange={(e) => set("place", e.target.value)} maxLength={80} placeholder="es. Casa di Santiago, La Jolla" aria-label="Luogo" className={input} />}
      <label className={label}>
        Chi può vederlo
        <select value={f.visibility} onChange={(e) => set("visibility", e.target.value as EventVisibility)} className={input}>
          <option value="pubblico">Pubblico: tutti (compare anche nel Calendario)</option>
          <option value="follower">Solo i miei follower</option>
          <option value="invito">Su invito: solo chi invito</option>
        </select>
      </label>
      <label className={label}>
        Password della festa (facoltativa)
        <input value={f.password} onChange={(e) => set("password", e.target.value)} maxLength={64} placeholder="Per le feste in casa: apre una chat privata" className={input} autoComplete="off" />
        <span>La vedono solo gli invitati e chi partecipa: con il pulsante «Entra alla festa» (o scrivendola sotto la mappa) entrano nella chat privata della festa.</span>
      </label>
      <label className={label}>
        Descrizione
        <textarea
          value={f.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={3000}
          rows={5}
          placeholder="Dress code, cosa portare, programma…"
          className="w-full rounded-xl border border-white/15 bg-night/50 px-3 py-2 text-sm text-foreground outline-none focus-visible:border-peach/60"
        />
      </label>
      {error && <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="button" onClick={save} disabled={busy} className="h-11 rounded-full">
        {busy ? "Salvataggio…" : id ? "Salva le modifiche" : "Crea l'evento"}
      </Button>
      {!id && <p className="text-xs text-muted-foreground">Dopo averlo creato potrai invitare le persone dalla pagina dell&apos;evento. I tuoi follower ricevono un avviso (non per gli eventi su invito).</p>}
    </div>
  );
}
