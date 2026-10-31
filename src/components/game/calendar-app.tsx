"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { inputClass, textareaClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { PHASE_LABEL } from "@/lib/sport";
import { createClient } from "@/lib/supabase/client";
import type { CalendarItem } from "@/lib/types";
import { cn } from "@/lib/utils";

// Calendario del gioco: eventi dello staff (calendar_events) ed eventi sportivi, in ora italiana.

const CATEGORY: Record<CalendarItem["category"], { label: string; dot: string }> = {
  evento: { label: "Evento", dot: "bg-peach" },
  festa: { label: "Festa", dot: "bg-flamingo" },
  lezione: { label: "Lezione", dot: "bg-lavender" },
  staff: { label: "Staff", dot: "bg-orchid" },
  sport: { label: "Sport", dot: "bg-mint" },
  universita: { label: "Università", dot: "bg-sand" },
};
const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/** "2026-10-30" del giorno in ora italiana */
function dayKey(iso: string | Date) {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

export function CalendarApp({ canManage }: { canManage: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [today] = useState(() => dayKey(new Date()));
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState<CalendarItem | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const from = new Date(month.getFullYear(), month.getMonth(), -6);
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 7);
    const { data, error: e } = await supabase.rpc("calendar_range", { p_from: from.toISOString(), p_to: to.toISOString() });
    if (e) setError(e.message);
    setItems((data ?? []) as CalendarItem[]);
  }, [supabase, month]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura del mese
    load();
  }, [load]);

  // griglia del mese, settimane da lunedì
  const first = new Date(month);
  const offset = (first.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i - offset + 1));
  const byDay = new Map<string, CalendarItem[]>();
  for (const it of items) {
    const k = dayKey(it.starts_at);
    byDay.set(k, [...(byDay.get(k) ?? []), it]);
  }
  const dayItems = byDay.get(selected) ?? [];

  async function remove(id: string) {
    setError(null);
    const { error: e } = await supabase.from("calendar_events").delete().eq("id", id);
    if (e) setError(e.message);
    load();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" size="icon" variant="ghost" aria-label="Mese precedente" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          <ChevronLeft />
        </Button>
        <h2 className="font-heading text-2xl tracking-wide capitalize">{month.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</h2>
        <Button type="button" size="icon" variant="ghost" aria-label="Mese successivo" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          <ChevronRight />
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-7 gap-1 text-center text-[0.7rem] text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const k = dayKey(d);
          const list = byDay.get(k) ?? [];
          const inMonth = d.getMonth() === month.getMonth();
          return (
            <button
              key={k}
              type="button"
              onClick={() => setSelected(k)}
              aria-pressed={selected === k}
              className={cn(
                "flex min-h-14 flex-col items-start gap-0.5 rounded-lg border p-1 text-left text-xs transition-colors",
                selected === k ? "border-flamingo bg-flamingo/15" : "border-white/10 bg-night/30 hover:bg-white/5",
                !inMonth && "opacity-40",
              )}
            >
              <span className={cn("font-medium", k === today && "rounded-full bg-peach px-1.5 text-night")}>{d.getDate()}</span>
              <span className="flex flex-wrap gap-0.5">
                {list.slice(0, 4).map((it) => (
                  <span key={it.id} className={cn("size-1.5 rounded-full", CATEGORY[it.category]?.dot ?? "bg-white", it.status === "cancelled" && "opacity-30")} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-xl tracking-wide text-peach">
            {new Date(`${selected}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
          </h3>
          {canManage && (
            <Button type="button" size="sm" className="rounded-full" onClick={() => setEditing("new")}>
              <Plus /> Evento
            </Button>
          )}
        </div>
        {dayItems.length === 0 && <p className="text-sm text-muted-foreground">Niente in programma.</p>}
        <ul className="flex flex-col gap-2">
          {dayItems.map((it) => (
            <li key={it.id} className={cn("glass rounded-xl p-3", it.status === "cancelled" && "opacity-60")}>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className={cn("size-2 shrink-0 rounded-full", CATEGORY[it.category]?.dot)} />
                <strong className={cn(it.status === "cancelled" && "line-through")}>{it.title}</strong>
                <span className="text-xs text-muted-foreground">
                  {new Date(it.starts_at).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" })}
                  {it.location && ` · ${it.location}`}
                  {it.phase && it.phase !== "regular" && ` · ${PHASE_LABEL[it.phase]}`}
                  {it.status === "cancelled" && " · annullato"}
                  {it.status === "postponed" && " · rinviato"}
                </span>
                {canManage && it.source === "evento" && (
                  <span className="ml-auto flex gap-1">
                    <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(it)}>
                      Modifica
                    </Button>
                    <Button type="button" size="icon-xs" variant="ghost" aria-label="Elimina" onClick={() => remove(it.id)}>
                      <Trash2 />
                    </Button>
                  </span>
                )}
              </p>
              {it.description && <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{it.description}</p>}
              {it.recap && <p className="mt-1 rounded-lg bg-white/5 p-2 text-xs whitespace-pre-line">{it.recap}</p>}
            </li>
          ))}
        </ul>
      </section>

      {editing && (
        <EventForm
          item={editing === "new" ? null : editing}
          day={selected}
          onDone={() => {
            setEditing(null);
            load();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** "2026-10-30T21:00" (ora italiana) ⇄ ISO */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const time = d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
  return `${date}T${time}`;
}
function fromLocalInput(v: string) {
  // l'orario si scrive in ora italiana: si calcola lo scarto di Roma in quel giorno
  const guess = new Date(`${v}:00Z`);
  const rome = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (rome.getTime() - utc.getTime())).toISOString();
}

function EventForm({ item, day, onDone, onCancel }: { item: CalendarItem | null; day: string; onDone: () => void; onCancel: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState({
    title: item?.title ?? "",
    description: item?.description ?? "",
    category: item?.category ?? "evento",
    starts: item ? toLocalInput(item.starts_at) : `${day}T21:00`,
    location: item?.location ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const row = { title: f.title.trim(), description: f.description.trim(), category: f.category, starts_at: fromLocalInput(f.starts), location: f.location.trim() };
    const { error: e } = item ? await supabase.from("calendar_events").update(row).eq("id", item.id) : await supabase.from("calendar_events").insert(row);
    if (e) return setError(e.message);
    onDone();
  }

  return (
    <div className="glass flex flex-col gap-2 rounded-2xl p-3">
      <h3 className="font-heading text-lg tracking-wide text-peach">{item ? "Modifica evento" : "Nuovo evento"}</h3>
      <input className={inputClass} value={f.title} maxLength={120} placeholder="Titolo" onChange={(e) => setF({ ...f, title: e.target.value })} />
      <div className="grid gap-2 sm:grid-cols-3">
        <select className={inputClass} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as CalendarItem["category"] })}>
          {(Object.keys(CATEGORY) as CalendarItem["category"][]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY[c].label}
            </option>
          ))}
        </select>
        <input className={inputClass} type="datetime-local" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} aria-label="Data e ora (ora italiana)" />
        <input className={inputClass} value={f.location} maxLength={120} placeholder="Luogo" onChange={(e) => setF({ ...f, location: e.target.value })} />
      </div>
      <textarea className={textareaClass} value={f.description} maxLength={2000} placeholder="Descrizione" onChange={(e) => setF({ ...f, description: e.target.value })} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" className="rounded-full" onClick={save} disabled={f.title.trim().length < 2}>
          Salva
        </Button>
        <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={onCancel}>
          Annulla
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Orari in ora italiana. Gli eventi sportivi si gestiscono da Gestione → Sport.</p>
    </div>
  );
}
