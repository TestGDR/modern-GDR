"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  GraduationCap,
  MapPin,
  PartyPopper,
  Pencil,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { inputClass, textareaClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { PHASE_LABEL } from "@/lib/sport";
import { createClient } from "@/lib/supabase/client";
import type { CalendarItem } from "@/lib/types";
import { cn } from "@/lib/utils";

// Calendario del gioco: eventi dello staff (calendar_events) ed eventi sportivi, in ora italiana.
// Mese a sinistra con i titoli dentro i giorni, dettaglio dell'evento scelto a destra.

const CATEGORY: Record<CalendarItem["category"], { label: string; dot: string; chip: string; icon: LucideIcon }> = {
  evento: { label: "Evento", dot: "bg-peach", chip: "border-peach/50 bg-peach/20", icon: Sparkles },
  festa: { label: "Festa", dot: "bg-flamingo", chip: "border-flamingo/50 bg-flamingo/25", icon: PartyPopper },
  lezione: { label: "Lezione", dot: "bg-lavender", chip: "border-lavender/50 bg-lavender/20", icon: GraduationCap },
  staff: { label: "Staff", dot: "bg-orchid", chip: "border-orchid/50 bg-orchid/25", icon: Shield },
  sport: { label: "Sport", dot: "bg-mint", chip: "border-mint/50 bg-mint/20", icon: Trophy },
  universita: { label: "Università", dot: "bg-sand", chip: "border-sand/50 bg-sand/20", icon: BookOpen },
};
const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/** "2026-10-30" del giorno in ora italiana */
function dayKey(iso: string | Date) {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });

export function CalendarApp({ canManage }: { canManage: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [today] = useState(() => dayKey(new Date()));
  const [selected, setSelected] = useState(today);
  const [eventId, setEventId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CalendarItem["category"] | "">("");
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

  // griglia del mese, settimane da lunedì (5 o 6 righe)
  const offset = (new Date(month).getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
  const days = Array.from({ length: cells }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i - offset + 1));
  const shown = items.filter((it) => !filter || it.category === filter);
  const byDay = new Map<string, CalendarItem[]>();
  for (const it of shown) {
    const k = dayKey(it.starts_at);
    byDay.set(k, [...(byDay.get(k) ?? []), it]);
  }
  const dayItems = byDay.get(selected) ?? [];
  const current = shown.find((it) => it.id === eventId) ?? dayItems[0] ?? null;

  function pickDay(k: string) {
    setSelected(k);
    setEventId(null);
    setEditing(null);
  }
  function moveMonth(delta: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
    setEventId(null);
  }
  async function remove(id: string) {
    if (!window.confirm("Eliminare l'evento?")) return;
    setError(null);
    const { error: e } = await supabase.from("calendar_events").delete().eq("id", id);
    if (e) setError(e.message);
    setEventId(null);
    load();
  }

  return (
    <div className="@container flex flex-col gap-3">
      {/* intestazione con il banner della città */}
      <header className="relative h-24 overflow-hidden rounded-2xl border border-white/10">
        <div className="absolute inset-0 bg-[url('/images/banner-miami.webp')] bg-cover bg-center" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-r from-night/90 via-night/50 to-transparent" aria-hidden />
        <div className="relative flex h-full flex-col justify-center px-4">
          <h2 className="font-heading text-4xl tracking-wide text-sunset">Calendario</h2>
          <p className="text-xs text-sand">Feste, lezioni, appuntamenti dello staff e partite · ora italiana</p>
        </div>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-3 @3xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* mese */}
        <section className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="icon" variant="ghost" className="rounded-full border border-white/15" aria-label="Mese precedente" onClick={() => moveMonth(-1)}>
              <ChevronLeft />
            </Button>
            <h3 className="glass min-w-44 rounded-full px-4 py-1 text-center font-heading text-2xl tracking-wide capitalize">
              {month.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
            </h3>
            <Button type="button" size="icon" variant="ghost" className="rounded-full border border-white/15" aria-label="Mese successivo" onClick={() => moveMonth(1)}>
              <ChevronRight />
            </Button>
            <select className={cn(inputClass, "ml-auto h-9 w-40")} value={filter} onChange={(e) => setFilter(e.target.value as CalendarItem["category"] | "")} aria-label="Filtra gli eventi">
              <option value="">Tutti gli eventi</option>
              {(Object.keys(CATEGORY) as CalendarItem["category"][]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY[c].label}
                </option>
              ))}
            </select>
          </div>

          <div className="glass overflow-hidden rounded-2xl">
            <div className="grid grid-cols-7 bg-night/70 text-center font-heading text-base tracking-wide text-peach">
              {WEEKDAYS.map((d) => (
                <span key={d} className="py-1">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const k = dayKey(d);
                const list = byDay.get(k) ?? [];
                const inMonth = d.getMonth() === month.getMonth();
                const isSel = selected === k;
                return (
                  <div
                    key={k}
                    role="button"
                    tabIndex={0}
                    onClick={() => pickDay(k)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && pickDay(k)}
                    aria-pressed={isSel}
                    className={cn(
                      "flex min-h-16 min-w-0 cursor-pointer flex-col gap-0.5 border-t border-l border-white/10 p-1 text-left transition-colors @3xl:min-h-20",
                      isSel ? "bg-flamingo/20 ring-1 ring-flamingo ring-inset" : "hover:bg-white/5",
                      !inMonth && "bg-night/40 opacity-50",
                    )}
                  >
                    <span className={cn("self-start text-xs font-semibold", k === today && "rounded-full bg-peach px-1.5 text-night", !inMonth && "text-muted-foreground")}>
                      {d.getDate()}
                    </span>
                    {list.slice(0, 2).map((it) => {
                      const Icon = CATEGORY[it.category]?.icon ?? Sparkles;
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(k);
                            setEventId(it.id);
                            setEditing(null);
                          }}
                          className={cn(
                            "flex min-w-0 items-center gap-1 rounded-md border px-1 py-0.5 text-left text-[0.65rem] leading-tight",
                            CATEGORY[it.category]?.chip,
                            current?.id === it.id && "ring-1 ring-white",
                            it.status === "cancelled" && "line-through opacity-50",
                          )}
                          title={it.title}
                        >
                          <Icon className="size-3 shrink-0" />
                          <span className="hidden font-medium break-words line-clamp-2 @lg:[display:-webkit-box]">{it.title}</span>
                        </button>
                      );
                    })}
                    {list.length > 2 && <span className="text-[0.6rem] text-muted-foreground">+{list.length - 2} altri</span>}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-muted-foreground">
            {(Object.keys(CATEGORY) as CalendarItem["category"][]).map((c) => (
              <span key={c} className="flex items-center gap-1">
                <span className={cn("size-2 rounded-full", CATEGORY[c].dot)} /> {CATEGORY[c].label}
              </span>
            ))}
          </p>
        </section>

        {/* dettaglio */}
        <aside className="glass flex min-w-0 flex-col gap-3 self-start rounded-2xl p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-heading text-2xl tracking-wide text-peach capitalize">
              {new Date(`${selected}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
            </h3>
            {canManage && (
              <Button type="button" size="sm" className="rounded-full" onClick={() => setEditing("new")}>
                <Plus /> Evento
              </Button>
            )}
          </div>

          {editing ? (
            <EventForm
              item={editing === "new" ? null : editing}
              day={selected}
              onDone={() => {
                setEditing(null);
                load();
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <>
              {dayItems.length > 1 && (
                <ul className="flex flex-col gap-1">
                  {dayItems.map((it) => {
                    const Icon = CATEGORY[it.category]?.icon ?? Sparkles;
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          onClick={() => setEventId(it.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg border px-2 py-1 text-left text-xs",
                            current?.id === it.id ? CATEGORY[it.category]?.chip : "border-white/10 hover:bg-white/5",
                          )}
                        >
                          <Icon className="size-3.5 shrink-0" />
                          <span className="truncate">{it.title}</span>
                          <span className="ml-auto shrink-0 text-muted-foreground">{timeOf(it.starts_at)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {!current && <p className="text-sm text-muted-foreground">Niente in programma in questo giorno.</p>}
              {current && <EventDetail item={current} canManage={canManage} onEdit={() => setEditing(current)} onDelete={() => remove(current.id)} />}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function EventDetail({ item, canManage, onEdit, onDelete }: { item: CalendarItem; canManage: boolean; onEdit: () => void; onDelete: () => void }) {
  const cat = CATEGORY[item.category] ?? CATEGORY.evento;
  const Icon = cat.icon;
  return (
    <article className={cn("flex flex-col gap-2", item.status === "cancelled" && "opacity-70")}>
      <p className={cn("self-start rounded-full border px-2 py-0.5 text-[0.7rem]", cat.chip)}>{cat.label}</p>
      <h4 className={cn("flex items-start gap-2 font-heading text-2xl leading-tight tracking-wide", item.status === "cancelled" && "line-through")}>
        <Icon className="mt-1 size-5 shrink-0 text-peach" /> {item.title}
      </h4>
      <ul className="flex flex-col gap-1 text-sm">
        <li className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <span className="capitalize">{new Date(item.starts_at).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
        </li>
        <li className="flex items-center gap-2">
          <Clock className="size-4 shrink-0 text-muted-foreground" />
          Dalle {timeOf(item.starts_at)}
          {item.ends_at && ` alle ${timeOf(item.ends_at)}`}
        </li>
        {item.location && (
          <li className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-muted-foreground" /> {item.location}
          </li>
        )}
        <li className="flex items-center gap-2">
          <Users className="size-4 shrink-0 text-muted-foreground" />
          {item.source === "sport" ? "Athletic Department" : "Evento organizzato dallo staff"}
          {item.phase && item.phase !== "regular" && ` · ${PHASE_LABEL[item.phase]}`}
        </li>
        {item.status === "cancelled" && <li className="text-destructive">Annullato</li>}
        {item.status === "postponed" && <li className="text-peach">Rinviato: la nuova data arriverà presto</li>}
      </ul>
      {item.description && (
        <section className="flex flex-col gap-1">
          <h5 className="flex items-center gap-1.5 font-heading text-lg tracking-wide text-peach">
            <Pencil className="size-4" /> Descrizione
          </h5>
          <p className="max-h-64 overflow-y-auto rounded-xl bg-night/40 p-2.5 text-sm whitespace-pre-line">{item.description}</p>
        </section>
      )}
      {item.recap && (
        <section className="flex flex-col gap-1">
          <h5 className="flex items-center gap-1.5 font-heading text-lg tracking-wide text-peach">
            <Trophy className="size-4" /> Risultato
          </h5>
          <p className="rounded-xl bg-night/40 p-2.5 text-xs whitespace-pre-line">{item.recap}</p>
        </section>
      )}
      {canManage && item.source === "evento" && (
        <div className="flex gap-1">
          <Button type="button" size="xs" variant="ghost" onClick={onEdit}>
            <Pencil /> Modifica
          </Button>
          <Button type="button" size="xs" variant="ghost" className="text-destructive" onClick={onDelete}>
            <Trash2 /> Elimina
          </Button>
        </div>
      )}
      {item.source === "sport" && canManage && <p className="text-[0.7rem] text-muted-foreground">Le partite si gestiscono da Gestione → Sport.</p>}
    </article>
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
    <div className="flex flex-col gap-2">
      <h3 className="font-heading text-lg tracking-wide text-peach">{item ? "Modifica evento" : "Nuovo evento"}</h3>
      <input className={inputClass} value={f.title} maxLength={120} placeholder="Titolo" onChange={(e) => setF({ ...f, title: e.target.value })} />
      <div className="grid gap-2">
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
