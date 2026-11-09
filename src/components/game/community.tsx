"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, CalendarDays, CalendarX2, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Dices, Ear, MapPin, Search, Trash2, X } from "lucide-react";
import { FloatingWindow } from "@/components/floating-window";
import { Button } from "@/components/ui/button";
import { firstName, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { refreshCounters, useCounters, useSeenCounter } from "@/lib/counters";
import { useResync } from "@/lib/use-resync";
import { cn } from "@/lib/utils";

// Funzioni di comunità (dal Westeros): assenze, ricerca di gioco, pettegolezzi.
// Ognuna ha il suo segno "visto": il pulsante si illumina per le novità.

const field = "w-full rounded-lg border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring";
type Supabase = ReturnType<typeof createClient>;

/** Pettegolezzi in attesa (solo per lo staff; contatori condivisi) */
function useGossipWaiting(enabled: boolean) {
  const n = useCounters().gossip;
  return { n: enabled ? n : 0, refresh: () => refreshCounters(true) };
}

/** Nomi (personaggio approvato o account) per un elenco di utenti */
async function names(supabase: Supabase, ids: string[]) {
  if (ids.length === 0) return {} as Record<string, string>;
  const { data } = await supabase.rpc("player_cards", { p_users: [...new Set(ids)] });
  return Object.fromEntries(((data ?? []) as { user_id: string; name: string }[]).map((r) => [r.user_id, firstName(r.name)]));
}

const smallBtn =
  "skin-btn relative flex flex-1 items-center justify-center rounded-xl bg-white/5 py-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground [&_svg]:size-4";

export function CommunityButtons({
  canAbsences,
  canRequests,
  canGossip,
  characterId,
}: {
  canAbsences: boolean;
  canRequests: boolean;
  canGossip: boolean;
  /** Personaggio approvato (null: si legge soltanto) */
  characterId: string | null;
}) {
  const absences = useSeenCounter("absences");
  const requests = useSeenCounter("play_requests");
  const gossip = useGossipWaiting(canGossip);
  // voci nuove (pettegolezzi approvati dopo l'ultima apertura)
  const gossipNew = useSeenCounter("gossip_new");
  const [open, setOpen] = useState<"assenze" | "ricerca" | "pettegolezzi" | null>(null);

  const badge = (n: number) =>
    n > 0 && <span className="absolute -top-1 right-1 grid min-w-4 place-items-center rounded-full bg-flamingo px-1 text-[0.6rem] leading-4 font-bold text-white">{n}</span>;

  return (
    <>
      <div className="flex gap-2">
        <button type="button" title="Assenze" aria-label="Assenze" className={cn(smallBtn, absences.n > 0 && "blink-call")} onClick={() => (setOpen("assenze"), absences.markSeen())}>
          <CalendarX2 /> {badge(absences.n)}
        </button>
        <button type="button" title="Cerco gioco" aria-label="Cerco gioco" className={cn(smallBtn, requests.n > 0 && "blink-call")} onClick={() => (setOpen("ricerca"), requests.markSeen())}>
          <Search /> {badge(requests.n)}
        </button>
        <button type="button" title="Pettegolezzi" aria-label="Pettegolezzi" className={cn(smallBtn, gossip.n + gossipNew.n > 0 && "blink-call")} onClick={() => (setOpen("pettegolezzi"), gossipNew.markSeen())}>
          <Ear /> {badge(gossip.n + gossipNew.n)}
        </button>
      </div>
      {open && (
        <FloatingWindow
          label={open === "assenze" ? "Assenze" : open === "ricerca" ? "Ricerca di gioco" : "Pettegolezzi"}
          onClose={() => setOpen(null)}
          initialWidth={open === "pettegolezzi" ? 900 : 560}
          maxHeight={open === "pettegolezzi" ? 700 : undefined}
          header={
            <h2 className="pb-4 font-heading text-3xl tracking-wide">{open === "assenze" ? "Assenze" : open === "ricerca" ? "Cerco gioco" : "Voci e pettegolezzi"}</h2>
          }
        >
          {open === "assenze" && <AbsencesPanel canManage={canAbsences} />}
          {open === "ricerca" && <RequestsPanel canManage={canRequests} canPost={!!characterId} />}
          {open === "pettegolezzi" && <GossipPanel canManage={canGossip} characterId={characterId} onChanged={gossip.refresh} />}
        </FloatingWindow>
      )}
    </>
  );
}

/* ------------------------------ Assenze ------------------------------ */

type Absence = { id: string; user_id: string; from_date: string; to_date: string; note: string };
const today = () => new Date().toISOString().slice(0, 10);
const itDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

function AbsencesPanel({ canManage }: { canManage: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<Absence[] | null>(null);
  const [who, setWho] = useState<Record<string, string>>({});
  const [me, setMe] = useState<string | null>(null);
  const [form, setForm] = useState({ from: today(), to: today(), note: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data }, { data: u }] = await Promise.all([
      supabase.from("absences").select("id, user_id, from_date, to_date, note").gte("to_date", today()).order("from_date"),
      supabase.auth.getUser(),
    ]);
    const rows = (data ?? []) as Absence[];
    setList(rows);
    setMe(u.user?.id ?? null);
    setWho(await names(supabase, rows.map((r) => r.user_id)));
  }, [supabase]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: err } = await supabase.from("absences").insert({ from_date: form.from, to_date: form.to, note: form.note });
    if (err) return setError("Controlla le date: la fine non può essere prima dell'inizio, e al massimo un anno.");
    setForm({ from: today(), to: today(), note: "" });
    load();
  }
  async function remove(a: Absence) {
    if (!window.confirm("Togliere questa assenza?")) return;
    await supabase.from("absences").delete().eq("id", a.id);
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={add} className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3">
        <p className="text-sm font-medium">Dichiara un&apos;assenza</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Dal
            <input type="date" value={form.from} min={today()} onChange={(e) => setForm({ ...form, from: e.target.value })} className={field} required />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Al
            <input type="date" value={form.to} min={form.from} onChange={(e) => setForm({ ...form, to: e.target.value })} className={field} required />
          </label>
        </div>
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={300} placeholder="Nota (facoltativa): esami, vacanza…" className={field} />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" size="sm" className="self-end rounded-full">
          <Check /> Dichiara
        </Button>
        <p className="text-xs text-muted-foreground">Tutti riceveranno un avviso nei messaggi OFF (SISTEMA).</p>
      </form>
      {list === null && <p className="text-sm text-muted-foreground">Caricamento…</p>}
      {list?.length === 0 && <p className="text-sm text-muted-foreground">Nessuna assenza in corso o in arrivo.</p>}
      <ul className="flex flex-col gap-2">
        {list?.map((a) => (
          <li key={a.id} className="flex items-start gap-3 rounded-xl bg-white/5 p-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{who[a.user_id] ?? "…"}</span>
              <span className="text-muted-foreground"> · {a.from_date === a.to_date ? itDate(a.from_date) : `dal ${itDate(a.from_date)} al ${itDate(a.to_date)}`}</span>
              {a.note && <span className="block text-xs text-muted-foreground">{a.note}</span>}
            </span>
            {(a.user_id === me || canManage) && (
              <button type="button" onClick={() => remove(a)} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Togli">
                <Trash2 className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------ Ricerca di gioco ------------------------------ */

type Request = { id: string; user_id: string; text: string; starts_at: string; ends_at: string };

function RequestsPanel({ canManage, canPost }: { canManage: boolean; canPost: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<Request[] | null>(null);
  const [who, setWho] = useState<Record<string, string>>({});
  const [me, setMe] = useState<string | null>(null);
  const [form, setForm] = useState({ text: "", day: today(), from: "21:00", to: "23:30" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data }, { data: u }] = await Promise.all([
      supabase.from("play_requests").select("id, user_id, text, starts_at, ends_at").gt("ends_at", new Date().toISOString()).order("starts_at"),
      supabase.auth.getUser(),
    ]);
    const rows = (data ?? []) as Request[];
    setList(rows);
    setMe(u.user?.id ?? null);
    setWho(await names(supabase, rows.map((r) => r.user_id)));
  }, [supabase]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const start = new Date(`${form.day}T${form.from}`);
    const end = new Date(`${form.day}T${form.to}`);
    if (end <= start) end.setDate(end.getDate() + 1); // finisce dopo mezzanotte
    const { error: err } = await supabase.from("play_requests").insert({ text: form.text.trim(), starts_at: start.toISOString(), ends_at: end.toISOString() });
    if (err) return setError("Controlla giorno e orari: la giocata dura al massimo 24 ore e non può essere già finita.");
    setForm({ ...form, text: "" });
    load();
  }
  async function remove(r: Request) {
    if (!window.confirm("Togliere questa richiesta?")) return;
    await supabase.from("play_requests").delete().eq("id", r.id);
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      {canPost ? (
        <form onSubmit={add} className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3">
          <textarea
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
            maxLength={500}
            rows={2}
            required
            placeholder="Cosa cerchi? Es. «Una giocata in biblioteca prima dell'esame»"
            className={field}
          />
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Giorno
              <input type="date" value={form.day} min={today()} onChange={(e) => setForm({ ...form, day: e.target.value })} className={field} required />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Dalle
              <input type="time" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className={field} required />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Alle
              <input type="time" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className={field} required />
            </label>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" size="sm" className="self-end rounded-full">
            <Search /> Pubblica
          </Button>
        </form>
      ) : (
        <p className="rounded-xl bg-white/5 p-3 text-sm text-muted-foreground">Per cercare gioco serve un personaggio approvato.</p>
      )}
      {list === null && <p className="text-sm text-muted-foreground">Caricamento…</p>}
      {list?.length === 0 && <p className="text-sm text-muted-foreground">Nessuno sta cercando gioco in questo momento.</p>}
      <ul className="flex flex-col gap-2">
        {list?.map((r) => (
          <li key={r.id} className="flex items-start gap-3 rounded-xl bg-white/5 p-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="font-medium text-peach">{who[r.user_id] ?? "…"}</span>
              <span className="text-xs text-muted-foreground">
                {" "}
                · {formatDateTime(r.starts_at)} → {new Date(r.ends_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })}
              </span>
              <span className="mt-0.5 block whitespace-pre-line">{r.text}</span>
            </span>
            {(r.user_id === me || canManage) && (
              <button type="button" onClick={() => remove(r)} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Togli">
                <Trash2 className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Le richieste spariscono da sole quando la giocata è finita.</p>
    </div>
  );
}

/* ------------------------------ Pettegolezzi ------------------------------ */

type Report = {
  id: string;
  author_name: string;
  participant_names: string;
  zone_name: string;
  summary: string;
  status: "attesa" | "approvato" | "rifiutato";
  published_text: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  created_at: string;
};
type Place = { id: string; name: string };
type RoomPlace = Place & { location_id: string };

type ArchiveRow = { id: string; kind: "voce"; body: string; zone: string; author: string; created_at: string };

/** Pettegolezzi: tab "Pettegolezzo" (dado e archivio) e, per lo staff, "Da approvare" */
function GossipPanel({ canManage, characterId, onChanged }: { canManage: boolean; characterId: string | null; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  // si apre sull'archivio
  const [tab, setTab] = useState<"archivio" | "pettegolezzo" | "approvare">("archivio");
  const [archive, setArchive] = useState<ArchiveRow[] | null>(null);
  const [waiting, setWaiting] = useState<Report[]>([]);
  // staff: le ultime decisioni, con chi le ha prese
  const [reviewed, setReviewed] = useState<Report[]>([]);
  const [pendingRoll, setPendingRoll] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"scoperti" | "non-visti" | null>(null);
  const [rolling, setRolling] = useState(false);
  // dove eravate: in una chat pubblica la fama fa notare di più
  const [rooms, setRooms] = useState<{ id: string; name: string; access: string; location: { name: string } | null }[]>([]);
  const [rollRoom, setRollRoom] = useState("");
  useEffect(() => {
    let alive = true;
    supabase
      .from("rooms")
      .select("id, name, access, location:locations(name)")
      .neq("access", "password")
      .order("sort_order")
      .then(({ data }) => {
        if (alive) setRooms((data ?? []) as unknown as { id: string; name: string; access: string; location: { name: string } | null }[]);
      });
    return () => {
      alive = false;
    };
  }, [supabase]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: arc }, pending, staff, done] = await Promise.all([
      supabase.rpc("gossip_archive"),
      characterId ? supabase.rpc("gossip_pending", { p_character: characterId }) : Promise.resolve({ data: null }),
      canManage ? supabase.from("gossip_reports").select("*").eq("status", "attesa").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
      canManage
        ? supabase.from("gossip_reports").select("*").neq("status", "attesa").order("reviewed_at", { ascending: false, nullsFirst: false }).limit(100)
        : Promise.resolve({ data: [] }),
    ]);
    setReviewed((done.data ?? []) as Report[]);
    setArchive((arc ?? []) as ArchiveRow[]);
    setPendingRoll((pending.data as string | null) ?? null);
    setWaiting((staff.data ?? []) as Report[]);
  }, [supabase, characterId, canManage]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  useResync(load);

  async function roll() {
    if (!characterId) return;
    setError(null);
    setRolling(true);
    const { data, error: err } = await supabase.rpc("gossip_roll", { p_character: characterId, p_room: rollRoom || null });
    setRolling(false);
    if (err) return setError(err.message);
    const row = ((data ?? []) as { id: string; seen: boolean }[])[0];
    setOutcome(row?.seen ? "scoperti" : "non-visti");
    if (row?.seen) setPendingRoll(row.id);
    else load();
  }

  const tabBtn = (active: boolean) =>
    cn("rounded-full px-4 py-1.5 text-sm font-medium transition-colors", active ? "bg-flamingo/25 text-white" : "text-muted-foreground hover:bg-white/5");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setTab("archivio")} className={tabBtn(tab === "archivio")}>
          Archivio pettegolezzi
        </button>
        <button type="button" onClick={() => setTab("pettegolezzo")} className={tabBtn(tab === "pettegolezzo")}>
          Pettegolezzo
        </button>
        {canManage && (
          <button type="button" onClick={() => setTab("approvare")} className={cn(tabBtn(tab === "approvare"), "flex items-center gap-1.5")}>
            Da approvare
            {waiting.length > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-flamingo px-1 text-[0.65rem] font-bold text-white">{waiting.length}</span>}
          </button>
        )}
      </div>

      {tab === "approvare" && canManage ? (
        <GossipStaff reports={waiting} reviewed={reviewed} onChanged={() => (load(), onChanged())} />
      ) : tab === "pettegolezzo" ? (
        <>
          {!characterId && <p className="text-sm text-muted-foreground">Per tirare il dado serve un personaggio approvato.</p>}
          {characterId && (
            <section className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3">
              <p className="text-sm font-medium">Fine giocata</p>
              {pendingRoll ? (
                <>
                  <p className="text-sm text-peach">Siete stati scoperti! Raccontate cosa è successo: lo staff deciderà se farlo diventare una voce.</p>
                  <GossipForm rollId={pendingRoll} characterId={characterId} onDone={() => (setPendingRoll(null), setOutcome(null), load(), onChanged())} />
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Alla fine di una giocata tira il dado: se siete stati scoperti scrivete cosa è successo e lo mandate allo staff; altrimenti nessuno vi ha visti e non resta traccia.
                  </p>
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Dove eravate?
                    <select value={rollRoom} onChange={(e) => setRollRoom(e.target.value)} className="h-9 rounded-lg border border-input bg-night/40 px-2 text-sm text-foreground outline-none">
                      <option value="">In un luogo privato (casa, camera, posto appartato)</option>
                      {[...new Set(rooms.map((r) => r.location?.name ?? "Altro"))].map((loc) => (
                        <optgroup key={loc} label={loc}>
                          {rooms
                            .filter((r) => (r.location?.name ?? "Altro") === loc)
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                                {r.access === "pubblica" ? "" : " (su invito)"}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                    <span>Nelle chat pubbliche chi è famoso (o famigerato) viene notato più facilmente.</span>
                  </label>
                  <Button type="button" size="sm" onClick={roll} disabled={rolling} className="self-start rounded-full">
                    <Dices /> {rolling ? "Tiro…" : "Tira il dado"}
                  </Button>
                  {outcome === "non-visti" && <p className="text-sm text-mint">Visto e non visto: nessuno vi ha scoperti.</p>}
                </>
              )}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </section>
          )}
        </>
      ) : (
        <GossipArchive rows={archive} canManage={canManage} onDeleted={() => (load(), onChanged())} />
      )}
    </div>
  );
}

/** Scoperti: riassunto, quartiere e chat, personaggi presenti (scelti dall'elenco) */
function GossipForm({ rollId, characterId, onDone }: { rollId: string; characterId: string; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [districts, setDistricts] = useState<Place[]>([]);
  const [rooms, setRooms] = useState<RoomPlace[]>([]);
  const [characters, setCharacters] = useState<Place[]>([]);
  const [form, setForm] = useState({ summary: "", location: "", room: "" });
  const [people, setPeople] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("locations").select("id, name").order("sort_order"),
      supabase.from("rooms").select("id, name, location_id").neq("access", "password").order("sort_order"),
      supabase.from("characters").select("id, name").eq("status", "approvata").neq("id", characterId).order("name"),
    ]).then(([l, r, c]) => {
      setDistricts((l.data ?? []) as Place[]);
      setRooms((r.data ?? []) as RoomPlace[]);
      setCharacters((c.data ?? []) as Place[]);
    });
  }, [supabase, characterId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error: err } = await supabase.rpc("gossip_report", {
      p_roll: rollId,
      p_summary: form.summary,
      p_location: form.location || null,
      p_room: form.room || null,
      p_participants: people,
    });
    setPending(false);
    if (err) return setError(err.message);
    onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <textarea
        value={form.summary}
        onChange={(e) => setForm({ ...form, summary: e.target.value })}
        rows={3}
        maxLength={2000}
        required
        placeholder="Riassunto: cosa è successo, in breve (lo leggerà lo staff)"
        className={field}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value, room: "" })} required className={cn(field, "h-10 py-0")}>
          <option value="" className="bg-night">
            Quartiere…
          </option>
          {districts.map((d) => (
            <option key={d.id} value={d.id} className="bg-night">
              {d.name}
            </option>
          ))}
        </select>
        <select value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} className={cn(field, "h-10 py-0")}>
          <option value="" className="bg-night">
            Chat (facoltativa)
          </option>
          {rooms
            .filter((r) => r.location_id === form.location)
            .map((r) => (
              <option key={r.id} value={r.id} className="bg-night">
                {r.name}
              </option>
            ))}
        </select>
      </div>
      {/* personaggi presenti: si scelgono dall'elenco */}
      <select
        value=""
        onChange={(e) => e.target.value && setPeople((prev) => (prev.includes(e.target.value) ? prev : [...prev, e.target.value]))}
        className={cn(field, "h-10 py-0")}
        aria-label="Aggiungi un personaggio presente"
      >
        <option value="" className="bg-night">
          Altri personaggi presenti: aggiungi…
        </option>
        {characters
          .filter((c) => !people.includes(c.id))
          .map((c) => (
            <option key={c.id} value={c.id} className="bg-night">
              {c.name}
            </option>
          ))}
      </select>
      {people.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {people.map((id) => (
            <li key={id} className="flex items-center gap-1 rounded-full bg-white/10 py-0.5 pr-1 pl-2.5 text-xs">
              {firstName(characters.find((c) => c.id === id)?.name)}
              <button type="button" onClick={() => setPeople(people.filter((x) => x !== id))} className="rounded-full p-0.5 hover:bg-white/15" aria-label="Togli">
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={pending} className="self-end rounded-full">
        <Ear /> Manda allo staff
      </Button>
    </form>
  );
}

function GossipStaff({ reports, reviewed, onChanged }: { reports: Report[]; reviewed: Report[]; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  // probabilità di essere scoperti, in percentuale (dado da 100: scoperti da 101 - % in su)
  const [percent, setPercent] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("gossip_settings")
      .select("die_sides, seen_from")
      .maybeSingle<{ die_sides: number; seen_from: number }>()
      .then(({ data }) => {
        if (data) setPercent(Math.max(1, Math.min(100, Math.round(((data.die_sides - data.seen_from + 1) / data.die_sides) * 100))));
      });
  }, [supabase]);

  async function saveSettings() {
    if (percent === null) return;
    const p = Math.round(percent);
    if (!(p >= 1 && p <= 100)) return setError("La percentuale va da 1 a 100.");
    setError(null);
    setSaved(false);
    const { error: err } = await supabase.from("gossip_settings").update({ die_sides: 100, seen_from: 101 - p }).eq("id", true);
    if (err) return setError("Valore non salvato.");
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl border border-peach/30 p-3">
        <h3 className="font-heading text-xl tracking-wide text-peach">Da approvare ({reports.length})</h3>
        {reports.length === 0 && <p className="text-sm text-muted-foreground">Nessun pettegolezzo in attesa.</p>}
        {reports.map((r) => (
          <ReviewItem key={r.id} report={r} onChanged={onChanged} />
        ))}
      </section>
      <section className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3">
        <h3 className="font-heading text-lg tracking-wide text-lavender">Archivio delle approvazioni</h3>
        {reviewed.length === 0 && <p className="text-sm text-muted-foreground">Ancora nessuna decisione.</p>}
        <ul className="flex flex-col gap-1.5">
          {reviewed.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 rounded-xl bg-night/30 px-3 py-2 text-sm">
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className={cn("rounded-full px-2 py-0.5 font-semibold", r.status === "approvato" ? "bg-mint/15 text-mint" : "bg-destructive/15 text-destructive")}>
                  {r.status === "approvato" ? "Approvato" : "Rifiutato"}
                </span>
                <span>
                  da <strong className="text-foreground">{r.reviewed_by_name || "—"}</strong>
                  {r.reviewed_at ? ` · ${formatDateTime(r.reviewed_at)}` : ""}
                </span>
                <span className="ml-auto">
                  {r.zone_name} · {r.author_name}
                  {r.participant_names ? `, ${r.participant_names}` : ""}
                </span>
              </p>
              <p className="leading-relaxed whitespace-pre-line italic">«{r.published_text || r.summary}»</p>
            </li>
          ))}
        </ul>
      </section>
      {percent !== null && (
        <section className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3 text-sm">
          <h3 className="font-heading text-lg tracking-wide text-lavender">Visto e non visto</h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              Scoperti
              <input
                type="number"
                min={1}
                max={100}
                value={percent}
                onChange={(e) => {
                  setPercent(Number(e.target.value));
                  setSaved(false);
                }}
                className={cn(field, "w-20")}
                aria-label="Percentuale di scoperti"
              />
              %
            </label>
            <span className="text-muted-foreground">· Visto e non visto {Math.max(0, 100 - Math.round(percent || 0))}%</span>
            <Button type="button" size="sm" variant="outline" onClick={saveSettings} className="ml-auto rounded-full">
              Salva
            </Button>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={percent}
            onChange={(e) => {
              setPercent(Number(e.target.value));
              setSaved(false);
            }}
            className="w-full accent-[var(--flamingo)]"
            aria-label="Percentuale di scoperti"
          />
          {saved && <p className="text-xs text-mint">Salvato: d&apos;ora in poi i tiri usano questa percentuale.</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </section>
      )}
    </div>
  );
}

function ReviewItem({ report, onChanged }: { report: Report; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [text, setText] = useState(report.summary);
  const [error, setError] = useState<string | null>(null);
  async function review(approve: boolean) {
    setError(null);
    const { error: err } = await supabase.rpc("gossip_review", { p_report: report.id, p_approve: approve, p_text: text });
    if (err) return setError(err.message);
    onChanged();
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white/5 p-3 text-sm">
      <p className="text-xs text-muted-foreground">
        {report.zone_name} · {report.author_name}
        {report.participant_names ? `, ${report.participant_names}` : ""} · {formatDateTime(report.created_at)}
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} className={field} />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <DeleteReport id={report.id} onDone={onChanged} />
        <Button type="button" size="sm" variant="ghost" onClick={() => review(false)} className="rounded-full">
          <X /> Rifiuta
        </Button>
        <Button type="button" size="sm" onClick={() => review(true)} disabled={!text.trim()} className="rounded-full">
          <Check /> Approva
        </Button>
      </div>
    </div>
  );
}

function DeleteReport({ id, onDone }: { id: string; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  return (
    <button
      type="button"
      onClick={async () => {
        if (!window.confirm("Eliminare questo pettegolezzo?")) return;
        await supabase.from("gossip_reports").delete().eq("id", id);
        onDone();
      }}
      className="ml-auto rounded p-1 text-xs text-muted-foreground hover:text-destructive"
      aria-label="Elimina"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

/* ------------------------------ Archivio dei pettegolezzi ------------------------------ */

const ROME = "Europe/Rome";
const dayKey = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: ROME });
const hourOf = (d: Date) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: ROME });

/** «8 nov, 18:26» (con l'anno se non è quello in corso) */
function longWhen(iso: string, now: number) {
  const d = new Date(iso);
  const yearOf = (x: Date) => x.toLocaleDateString("it-IT", { year: "numeric", timeZone: ROME });
  const sameYear = yearOf(d) === yearOf(new Date(now));
  const day = d.toLocaleDateString("it-IT", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: ROME }).replace(".", "");
  return `${day}, ${hourOf(d)}`;
}

/** «Oggi, 18:26», «Ieri, 18:26» o la data */
function shortWhen(iso: string, now: number) {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(new Date(now))) return `Oggi, ${hourOf(d)}`;
  if (dayKey(d) === dayKey(new Date(now - 86_400_000))) return `Ieri, ${hourOf(d)}`;
  return longWhen(iso, now);
}

const PAGE_SIZE = 5;
const DAYS = [
  { value: "tutti", label: "Tutti i giorni", ms: 0 },
  { value: "oggi", label: "Oggi", ms: 0 },
  { value: "7", label: "Ultimi 7 giorni", ms: 7 * 86_400_000 },
  { value: "30", label: "Ultimi 30 giorni", ms: 30 * 86_400_000 },
] as const;
type DaysValue = (typeof DAYS)[number]["value"];

const pill = "relative flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-night/30 pl-2.5 pr-2 text-xs";
const pillSelect = "h-full min-w-0 cursor-pointer appearance-none bg-transparent pr-5 text-xs text-foreground outline-none [&>option]:bg-night";
const pageBtn =
  "grid h-7 w-9 place-items-center rounded-full border border-white/15 text-muted-foreground hover:bg-white/10 hover:text-white disabled:opacity-35 disabled:hover:bg-transparent";

/** Archivio: cerca, filtra per zona e giorno, elenco a pagine e pettegolezzo aperto accanto */
function GossipArchive({ rows, canManage, onDeleted }: { rows: ArchiveRow[] | null; canManage: boolean; onDeleted: () => void }) {
  const [now] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState("");
  const [days, setDays] = useState<DaysValue>("tutti");
  const [newest, setNewest] = useState(true);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const zones = useMemo(() => [...new Set((rows ?? []).map((r) => r.zone).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const range = DAYS.find((d) => d.value === days);
    const list = (rows ?? []).filter((r) => {
      if (zone && r.zone !== zone) return false;
      if (q && !`${r.body} ${r.zone}`.toLowerCase().includes(q)) return false;
      if (days === "oggi" && dayKey(new Date(r.created_at)) !== dayKey(new Date(now))) return false;
      if (range && range.ms > 0 && now - Date.parse(r.created_at) > range.ms) return false;
      return true;
    });
    return newest ? list : [...list].reverse();
  }, [rows, query, zone, days, newest, now]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  // aperto: quello scelto, se è ancora tra i risultati; altrimenti il primo della pagina
  const open = filtered.find((r) => r.id === selected) ?? visible[0] ?? null;
  // cambiando un filtro si torna alla prima pagina
  const resetPage = () => {
    setPage(0);
    setSelected(null);
  };
  const goTo = (p: number) => {
    setPage(Math.max(0, Math.min(pages - 1, p)));
    setSelected(null);
  };

  if (rows === null) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Ancora nessun pettegolezzo.</p>;

  return (
    <div className="flex flex-col gap-3">
      {/* Ricerca e filtri */}
      <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-white/10 bg-white/5 p-2">
        <label className={cn(pill, "min-w-48 flex-1")}>
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => (setQuery(e.target.value), resetPage())}
            placeholder="Cerca un pettegolezzo…"
            aria-label="Cerca un pettegolezzo"
            className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </label>
        <label className={pill}>
          <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
          <select value={zone} onChange={(e) => (setZone(e.target.value), resetPage())} aria-label="Zona" className={pillSelect}>
            <option value="">Tutte le zone</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground" />
        </label>
        <label className={pill}>
          <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
          <select value={days} onChange={(e) => (setDays(e.target.value as DaysValue), resetPage())} aria-label="Giorno" className={pillSelect}>
            {DAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground" />
        </label>
        <label className={cn(pill, "sm:ml-auto")}>
          <ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          <select value={newest ? "recenti" : "vecchi"} onChange={(e) => (setNewest(e.target.value === "recenti"), resetPage())} aria-label="Ordine" className={pillSelect}>
            <option value="recenti">Più recenti</option>
            <option value="vecchi">Meno recenti</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground" />
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nessun pettegolezzo con questi filtri.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-[12rem_minmax(0,1fr)]">
          {/* Elenco */}
          <div className="flex flex-col gap-2">
            <ul className="flex flex-col gap-2">
              {visible.map((r) => {
                const active = open?.id === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(r.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors",
                        active ? "border-white/40 bg-orchid/25" : "border-white/10 bg-white/5 hover:bg-white/10",
                      )}
                    >
                      <Ear className="size-4 shrink-0 text-peach" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">{r.zone || "Senza zona"}</span>
                        <span className="block text-[0.65rem] text-muted-foreground">{shortWhen(r.created_at, now)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {pages > 1 && (
              <div className="mt-1 flex items-center justify-center gap-2">
                <button type="button" className={pageBtn} disabled={current === 0} onClick={() => goTo(0)} aria-label="Prima pagina">
                  <ChevronsLeft className="size-4" />
                </button>
                <button type="button" className={pageBtn} disabled={current === 0} onClick={() => goTo(current - 1)} aria-label="Pagina precedente">
                  <ChevronLeft className="size-4" />
                </button>
                <span className="px-2 text-sm tabular-nums">
                  {current + 1} / {pages}
                </span>
                <button type="button" className={pageBtn} disabled={current >= pages - 1} onClick={() => goTo(current + 1)} aria-label="Pagina successiva">
                  <ChevronRight className="size-4" />
                </button>
                <button type="button" className={pageBtn} disabled={current >= pages - 1} onClick={() => goTo(pages - 1)} aria-label="Ultima pagina">
                  <ChevronsRight className="size-4" />
                </button>
              </div>
            )}
          </div>

          {/* Pettegolezzo aperto */}
          {open && (
            <article className="flex min-h-40 flex-col gap-2 rounded-2xl border border-white/15 bg-white/5 p-3 sm:p-4">
              <header className="flex items-center gap-2 border-b border-white/15 pb-2">
                <Ear className="size-4 shrink-0 text-peach" />
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{open.zone || "Senza zona"}</h3>
                <span className="shrink-0 text-xs text-muted-foreground">{longWhen(open.created_at, now)}</span>
              </header>
              <p className="text-sm leading-relaxed whitespace-pre-line italic">«{open.body}»</p>
              {canManage && (
                <div className="mt-auto flex">
                  <DeleteReport id={open.id} onDone={onDeleted} />
                </div>
              )}
            </article>
          )}
        </div>
      )}
    </div>
  );
}
