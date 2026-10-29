"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarX2, Check, Dices, Ear, Search, Trash2, X } from "lucide-react";
import { FloatingWindow } from "@/components/floating-window";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { playEvent } from "@/lib/notify-sound";
import { createClient } from "@/lib/supabase/client";
import { useResync } from "@/lib/use-resync";
import { cn } from "@/lib/utils";

// Funzioni di comunità (dal Westeros): assenze, ricerca di gioco, pettegolezzi.
// Ognuna ha il suo segno "visto": il pulsante si illumina per le novità.

const field = "w-full rounded-lg border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring";
type Supabase = ReturnType<typeof createClient>;

/** Quante voci nuove dopo l'ultima apertura (escluse le proprie) */
function useUnseen(table: "absences" | "play_requests", seenTable: "absences_seen" | "play_requests_seen") {
  const supabase = useMemo(() => createClient(), []);
  const [n, setN] = useState(0);
  const refresh = useCallback(async () => {
    const [{ data: user }, { data: seen }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from(seenTable).select("seen_at").maybeSingle<{ seen_at: string }>(),
    ]);
    if (!user.user) return;
    let q = supabase.from(table).select("id", { count: "exact", head: true }).neq("user_id", user.user.id);
    if (seen) q = q.gt("created_at", seen.seen_at);
    if (table === "play_requests") q = q.gt("ends_at", new Date().toISOString());
    const { count } = await q;
    setN(count ?? 0);
  }, [supabase, table, seenTable]);
  useResync(refresh);
  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const ch = supabase
      .channel(`novita:${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, (p) => {
        if (p.eventType === "INSERT") playEvent("off");
        refresh();
      })
      .subscribe();
    return () => {
      clearTimeout(first);
      supabase.removeChannel(ch);
    };
  }, [supabase, table, refresh]);
  const markSeen = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from(seenTable).upsert({ user_id: data.user.id, seen_at: new Date().toISOString() });
    setN(0);
  }, [supabase, seenTable]);
  return { n, markSeen };
}

/** Pettegolezzi in attesa (solo per lo staff) */
function useGossipWaiting(enabled: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const [n, setN] = useState(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const { data } = await supabase.rpc("gossip_waiting");
    setN((data as number | null) ?? 0);
  }, [supabase, enabled]);
  useResync(refresh);
  useEffect(() => {
    if (!enabled) return;
    const first = setTimeout(refresh, 0);
    const ch = supabase
      .channel("pettegolezzi:attesa")
      .on("postgres_changes", { event: "*", schema: "public", table: "gossip_reports" }, () => refresh())
      .subscribe();
    return () => {
      clearTimeout(first);
      supabase.removeChannel(ch);
    };
  }, [supabase, enabled, refresh]);
  return { n, refresh };
}

/** Nomi (personaggio approvato o account) per un elenco di utenti */
async function names(supabase: Supabase, ids: string[]) {
  if (ids.length === 0) return {} as Record<string, string>;
  const { data } = await supabase.rpc("player_cards", { p_users: [...new Set(ids)] });
  return Object.fromEntries(((data ?? []) as { user_id: string; name: string }[]).map((r) => [r.user_id, r.name]));
}

const smallBtn =
  "relative flex flex-1 items-center justify-center rounded-xl bg-white/5 py-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground [&_svg]:size-4";

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
  const absences = useUnseen("absences", "absences_seen");
  const requests = useUnseen("play_requests", "play_requests_seen");
  const gossip = useGossipWaiting(canGossip);
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
        <button type="button" title="Pettegolezzi" aria-label="Pettegolezzi" className={cn(smallBtn, gossip.n > 0 && "blink-call")} onClick={() => setOpen("pettegolezzi")}>
          <Ear /> {badge(gossip.n)}
        </button>
      </div>
      {open && (
        <FloatingWindow
          label={open === "assenze" ? "Assenze" : open === "ricerca" ? "Ricerca di gioco" : "Pettegolezzi"}
          onClose={() => setOpen(null)}
          initialWidth={560}
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
  created_at: string;
};
type Place = { id: string; name: string };
type RoomPlace = Place & { location_id: string };

function GossipPanel({ canManage, characterId, onChanged }: { canManage: boolean; characterId: string | null; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [pendingRoll, setPendingRoll] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"notati" | "non-notati" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data }, pending] = await Promise.all([
      supabase.from("gossip_reports").select("*").order("created_at", { ascending: false }).limit(100),
      characterId ? supabase.rpc("gossip_pending", { p_character: characterId }) : Promise.resolve({ data: null }),
    ]);
    setReports((data ?? []) as Report[]);
    setPendingRoll((pending.data as string | null) ?? null);
  }, [supabase, characterId]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function roll() {
    if (!characterId) return;
    setError(null);
    const { data, error: err } = await supabase.rpc("gossip_roll", { p_character: characterId });
    if (err) return setError(err.message);
    const row = ((data ?? []) as { id: string; seen: boolean }[])[0];
    setOutcome(row?.seen ? "notati" : "non-notati");
    if (row?.seen) setPendingRoll(row.id);
  }

  const voices = (reports ?? []).filter((r) => r.status === "approvato");
  const waiting = (reports ?? []).filter((r) => r.status === "attesa");

  return (
    <div className="flex flex-col gap-4">
      {characterId && (
        <section className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3">
          <p className="text-sm font-medium">Fine giocata</p>
          {pendingRoll ? (
            <GossipForm rollId={pendingRoll} onDone={() => (setPendingRoll(null), setOutcome(null), load(), onChanged())} />
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Alla fine di una giocata un partecipante tira il dado: se qualcuno vi ha notati, scrivete cosa è successo e lo staff decide se farlo diventare una voce.
              </p>
              <Button type="button" size="sm" onClick={roll} className="self-start rounded-full">
                <Dices /> Tira a fine giocata
              </Button>
              {outcome === "non-notati" && <p className="text-sm text-mint">Nessuno vi ha notati: niente pettegolezzi questa volta.</p>}
            </>
          )}
          {outcome === "notati" && pendingRoll && <p className="text-sm text-peach">Qualcuno vi ha notati! Raccontate cosa è successo.</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </section>
      )}

      {canManage && <GossipStaff reports={waiting} onChanged={() => (load(), onChanged())} />}

      <section className="flex flex-col gap-2">
        <h3 className="font-heading text-xl tracking-wide text-peach">Voci che girano</h3>
        {reports === null && <p className="text-sm text-muted-foreground">Caricamento…</p>}
        {reports !== null && voices.length === 0 && <p className="text-sm text-muted-foreground">Ancora nessuna voce.</p>}
        <ul className="flex flex-col gap-2">
          {voices.map((r) => (
            <li key={r.id} className="rounded-xl bg-white/5 p-3 text-sm">
              <p className="text-xs text-muted-foreground">
                {r.zone_name} · {formatDateTime(r.reviewed_at ?? r.created_at)}
              </p>
              <p className="mt-1 leading-relaxed whitespace-pre-line italic">«{r.published_text}»</p>
              {canManage && <DeleteReport id={r.id} onDone={() => (load(), onChanged())} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function GossipForm({ rollId, onDone }: { rollId: string; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [districts, setDistricts] = useState<Place[]>([]);
  const [rooms, setRooms] = useState<RoomPlace[]>([]);
  const [form, setForm] = useState({ summary: "", location: "", room: "", people: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    Promise.all([supabase.from("locations").select("id, name").order("sort_order"), supabase.from("rooms").select("id, name, location_id").neq("access", "password").order("sort_order")]).then(
      ([l, r]) => {
        setDistricts((l.data ?? []) as Place[]);
        setRooms((r.data ?? []) as RoomPlace[]);
      },
    );
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const ids: string[] = [];
    for (const n of form.people.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)) {
      const { data } = await supabase.from("characters").select("id").ilike("name", n.replace(/[%_\\]/g, "\\$&")).eq("status", "approvata").limit(1).maybeSingle<{ id: string }>();
      if (!data) {
        setPending(false);
        return setError(`Nessun personaggio approvato si chiama «${n}».`);
      }
      ids.push(data.id);
    }
    const { error: err } = await supabase.rpc("gossip_report", {
      p_roll: rollId,
      p_summary: form.summary,
      p_location: form.location || null,
      p_room: form.room || null,
      p_participants: ids,
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
        placeholder="Cosa è successo, in breve (lo leggerà lo staff)"
        className={field}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value, room: "" })} required className={cn(field, "h-10 py-0")}>
          <option value="">Quartiere…</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} className={cn(field, "h-10 py-0")}>
          <option value="">Chat (facoltativa)</option>
          {rooms
            .filter((r) => r.location_id === form.location)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
      </div>
      <input value={form.people} onChange={(e) => setForm({ ...form, people: e.target.value })} placeholder="Altri personaggi presenti, separati da virgola" className={field} />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={pending} className="self-end rounded-full">
        <Ear /> Manda allo staff
      </Button>
    </form>
  );
}

function GossipStaff({ reports, onChanged }: { reports: Report[]; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [settings, setSettings] = useState<{ die_sides: number; seen_from: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("gossip_settings")
      .select("die_sides, seen_from")
      .maybeSingle<{ die_sides: number; seen_from: number }>()
      .then(({ data }) => setSettings(data));
  }, [supabase]);

  async function saveSettings() {
    if (!settings) return;
    setError(null);
    const { error: err } = await supabase.from("gossip_settings").update(settings).eq("id", true);
    if (err) setError("Valori non validi (dado da 2 a 100, soglia da 1 a 100).");
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-peach/30 p-3">
      <h3 className="font-heading text-xl tracking-wide text-peach">Staff · da controllare ({reports.length})</h3>
      {reports.length === 0 && <p className="text-sm text-muted-foreground">Nessun pettegolezzo in attesa.</p>}
      {reports.map((r) => (
        <ReviewItem key={r.id} report={r} onChanged={onChanged} />
      ))}
      {settings && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3 text-xs">
          <label className="flex flex-col gap-1">
            Dado (facce)
            <input type="number" min={2} max={100} value={settings.die_sides} onChange={(e) => setSettings({ ...settings, die_sides: Number(e.target.value) })} className={cn(field, "w-20")} />
          </label>
          <label className="flex flex-col gap-1">
            Notati da
            <input type="number" min={1} max={100} value={settings.seen_from} onChange={(e) => setSettings({ ...settings, seen_from: Number(e.target.value) })} className={cn(field, "w-20")} />
          </label>
          <Button type="button" size="sm" variant="outline" onClick={saveSettings} className="rounded-full">
            Salva
          </Button>
          <span className="text-muted-foreground">
            Notati {Math.max(0, Math.round(((settings.die_sides - settings.seen_from + 1) / settings.die_sides) * 100))}% delle volte
          </span>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
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
