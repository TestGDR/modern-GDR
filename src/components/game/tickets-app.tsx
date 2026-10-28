"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowLeft, Dices, Plus, SendHorizontal, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { useResync } from "@/lib/use-resync";
import type { Ticket, TicketMessage, TicketSection, TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

// Ticket: richieste allo staff (dal Westeros: Tickets.tsx). Elenco con archivio,
// apertura con sezione e istruzioni, conversazione come una chat con lo staff,
// tiri di dado Interlock, stati e eliminazione per lo staff.

type DiceAttribute = { id: string; code: string; name: string };
type DiceSkill = { id: string; name: string; attribute_id: string };

const STATUS: Record<TicketStatus, { label: string; cls: string }> = {
  attesa: { label: "In attesa", cls: "bg-peach/20 text-peach" },
  in_carico: { label: "In carico", cls: "bg-mint/20 text-mint" },
  sospeso: { label: "Sospeso", cls: "bg-lavender/20 text-lavender" },
  chiuso: { label: "Chiuso", cls: "bg-white/10 text-muted-foreground" },
};
const isArchived = (s: TicketStatus) => s === "sospeso" || s === "chiuso";
const field = "w-full rounded-lg border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring";

export function TicketsApp({
  sections,
  canManage,
  attributes,
  skills,
}: {
  sections: TicketSection[];
  canManage: boolean;
  attributes: DiceAttribute[];
  skills: DiceSkill[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [unread, setUnread] = useState<string[]>([]);
  const [tab, setTab] = useState<"aperti" | "archivio">("aperti");
  const [active, setActive] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadList = useCallback(async () => {
    const [{ data }, { data: u }] = await Promise.all([
      supabase.from("tickets").select("*").order("last_message_at", { ascending: false }).limit(300),
      supabase.rpc("ticket_unread_ids"),
    ]);
    setTickets((data ?? []) as Ticket[]);
    setUnread((u ?? []) as string[]);
  }, [supabase]);

  useEffect(() => {
    const t = setTimeout(loadList, 0);
    const ch = supabase
      .channel("ticket-finestra:elenco")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => loadList())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages" }, () => loadList())
      .subscribe();
    return () => {
      clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, [supabase, loadList]);
  useResync(loadList);

  const list = (tickets ?? []).filter((t) => (tab === "archivio" ? isArchived(t.status) : !isArchived(t.status)));
  const current = tickets?.find((t) => t.id === active) ?? null;
  const sectionName = (id: string | null) => sections.find((s) => s.id === id)?.name ?? "Senza sezione";

  return (
    <div className="flex h-[min(72dvh,640px)] min-h-[420px] overflow-hidden rounded-2xl border border-border bg-night/40">
      {/* Elenco */}
      <aside className={cn("w-full flex-col border-border md:flex md:w-80 md:shrink-0 md:border-r", active || creating ? "hidden" : "flex")}>
        <div className="flex gap-1 border-b border-border p-2">
          {(["aperti", "archivio"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn("flex-1 rounded-full px-3 py-1.5 text-sm", tab === t ? "bg-flamingo/20 text-white" : "text-muted-foreground hover:bg-white/5")}
            >
              {t === "aperti" ? "Aperti" : "Archivio"}
            </button>
          ))}
        </div>
        <div className="border-b border-border p-2">
          <Button type="button" size="sm" onClick={() => (setCreating(true), setActive(null))} className="w-full rounded-full">
            <Plus /> Nuovo ticket
          </Button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {tickets === null && <li className="p-3 text-sm text-muted-foreground">Caricamento…</li>}
          {tickets !== null && list.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">{tab === "aperti" ? "Nessun ticket aperto." : "L'archivio è vuoto."}</li>
          )}
          {list.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => (setActive(t.id), setCreating(false))}
                className={cn("flex w-full flex-col gap-1 border-b border-border/60 px-3 py-2.5 text-left hover:bg-white/5", t.id === active && "bg-flamingo/10")}
              >
                <span className="flex items-center gap-2">
                  {unread.includes(t.id) && <span className="size-2 shrink-0 rounded-full bg-flamingo" aria-label="Da leggere" />}
                  <span className="flex-1 truncate font-medium">{t.title}</span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.65rem]", STATUS[t.status].cls)}>{STATUS[t.status].label}</span>
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {sectionName(t.section_id)} · {t.opener_name} · {formatDateTime(t.last_message_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Destra */}
      <section className={cn("min-w-0 flex-1 flex-col md:flex", active || creating ? "flex" : "hidden")}>
        {creating ? (
          <NewTicket
            sections={sections.filter((s) => s.active)}
            onCancel={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              setTab("aperti");
              setActive(id);
              loadList();
            }}
          />
        ) : current ? (
          <TicketView
            key={current.id}
            ticket={current}
            sectionName={sectionName(current.section_id)}
            canManage={canManage}
            attributes={attributes}
            skills={skills}
            onBack={() => setActive(null)}
            onChanged={loadList}
            onDeleted={() => {
              setActive(null);
              loadList();
            }}
          />
        ) : (
          <p className="m-auto max-w-xs p-6 text-center text-sm text-muted-foreground">
            Scegli un ticket o aprine uno nuovo: lo staff ti risponderà qui, e riceverai un avviso nei messaggi OFF (SISTEMA).
          </p>
        )}
      </section>
    </div>
  );
}

/* ------------------------------ Nuovo ticket ------------------------------ */

function NewTicket({ sections, onCancel, onCreated }: { sections: TicketSection[]; onCancel: () => void; onCreated: (id: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [others, setOthers] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const section = sections.find((s) => s.id === sectionId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const ids: string[] = [];
    for (const name of others.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)) {
      const { data } = await supabase.rpc("find_player", { p_name: name });
      const row = ((data ?? []) as { user_id: string }[])[0];
      if (!row) {
        setPending(false);
        return setError(`Nessuno si chiama «${name}».`);
      }
      ids.push(row.user_id);
    }
    const { data, error: err } = await supabase.rpc("open_ticket", { p_title: title, p_section: sectionId, p_body: body, p_others: ids });
    setPending(false);
    if (err) return setError(err.message);
    onCreated(data as string);
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="rounded-full p-1 text-muted-foreground hover:text-foreground md:hidden" aria-label="Indietro">
          <ArrowLeft className="size-5" />
        </button>
        <h3 className="font-heading text-2xl tracking-wide">Nuovo ticket</h3>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        Sezione
        <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className={cn(field, "h-10")}>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {section?.instructions && <p className="rounded-xl bg-peach/10 px-3 py-2 text-xs leading-relaxed whitespace-pre-line text-peach/90">{section.instructions}</p>}
      <label className="flex flex-col gap-1.5 text-sm">
        Titolo
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required className={cn(field, "h-10")} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Testo
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} rows={6} required className={field} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Includi altri giocatori (facoltativo)
        <input value={others} onChange={(e) => setOthers(e.target.value)} placeholder="Nomi separati da virgola" className={cn(field, "h-10")} />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} className="rounded-full">
          Annulla
        </Button>
        <Button type="submit" disabled={pending || !title.trim() || !body.trim() || !sectionId} className="rounded-full">
          <SendHorizontal /> Apri il ticket
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------ Conversazione ------------------------------ */

function TicketView({
  ticket,
  sectionName,
  canManage,
  attributes,
  skills,
  onBack,
  onChanged,
  onDeleted,
}: {
  ticket: Ticket;
  sectionName: string;
  canManage: boolean;
  attributes: DiceAttribute[];
  skills: DiceSkill[];
  onBack: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<TicketMessage[] | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [dice, setDice] = useState(false);
  const [choice, setChoice] = useState("d10");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [{ data: m }, { data: p }] = await Promise.all([
      supabase.from("ticket_messages").select("*").eq("ticket_id", ticket.id).order("created_at"),
      supabase.from("ticket_participants").select("user_id").eq("ticket_id", ticket.id),
    ]);
    setMessages((m ?? []) as TicketMessage[]);
    const ids = ((p ?? []) as { user_id: string }[]).map((x) => x.user_id);
    if (ids.length) {
      const { data: cards } = await supabase.rpc("player_cards", { p_users: ids });
      setParticipants(((cards ?? []) as { name: string }[]).map((c) => c.name));
    }
    // aprendo il ticket lo si segna come letto
    await supabase.rpc("mark_ticket_read", { p_ticket: ticket.id });
    onChanged();
  }, [supabase, ticket.id, onChanged]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    const ch = supabase
      .channel(`ticket:${ticket.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticket.id}` }, () => load())
      .subscribe();
    return () => {
      clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, [supabase, ticket.id, load]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setPending(true);
    setError(null);
    const { error: err } = await fn();
    setPending(false);
    if (err) {
      setError(err.message);
      return false;
    }
    return true;
  }

  async function reply() {
    if (!text.trim()) return;
    if (await run(() => supabase.rpc("reply_ticket", { p_ticket: ticket.id, p_body: text }))) {
      setText("");
      load();
    }
  }

  async function roll() {
    const [type, id] = choice.split(":");
    const skill = type === "s" ? skills.find((s) => s.id === id) : null;
    const attribute = type === "a" ? id : (skill?.attribute_id ?? null);
    if (await run(() => supabase.rpc("roll_ticket_dice", { p_ticket: ticket.id, p_attribute: attribute, p_skill: skill?.id ?? null }))) {
      setDice(false);
      load();
    }
  }

  async function status(s: TicketStatus) {
    if (await run(() => supabase.rpc("set_ticket_status", { p_ticket: ticket.id, p_status: s }))) onChanged();
  }

  async function remove() {
    if (!window.confirm(`Eliminare definitivamente il ticket «${ticket.title}» con tutti i suoi messaggi?`)) return;
    if (await run(() => supabase.rpc("delete_ticket", { p_ticket: ticket.id }))) onDeleted();
  }

  const closed = ticket.status === "chiuso";
  const canWrite = !closed || canManage;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="rounded-full p-1 text-muted-foreground hover:text-foreground md:hidden" aria-label="Torna all'elenco">
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-heading text-xl tracking-wide">{ticket.title}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {sectionName} · {participants.join(", ") || ticket.opener_name}
              {ticket.assigned_name ? ` · seguito da ${ticket.assigned_name}` : ""}
            </p>
          </div>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", STATUS[ticket.status].cls)}>{STATUS[ticket.status].label}</span>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-1">
            {ticket.status !== "in_carico" && (
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => status("in_carico")} className="rounded-full">
                <ShieldCheck /> {ticket.status === "attesa" ? "Prendi in carico" : "Riapri"}
              </Button>
            )}
            {ticket.status !== "sospeso" && (
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => status("sospeso")} className="rounded-full">
                Sospendi
              </Button>
            )}
            {!closed && (
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => status("chiuso")} className="rounded-full">
                <Archive /> Chiudi
              </Button>
            )}
            {isArchived(ticket.status) && (
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={remove} className="rounded-full text-destructive">
                <Trash2 /> Elimina
              </Button>
            )}
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {messages === null ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m) =>
              m.roll_data ? (
                <p key={m.id} className="flex items-center gap-2 rounded-xl border border-peach/25 bg-peach/10 px-3 py-2 text-sm">
                  <Dices className="size-4 shrink-0 text-peach" />
                  <span className="flex-1">{m.body}</span>
                  <span className="text-[0.65rem] text-muted-foreground">{formatDateTime(m.created_at)}</span>
                </p>
              ) : (
                <div key={m.id} className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.from_staff ? "self-start border border-mint/30 bg-mint/10" : "self-end bg-white/10")}>
                  <p className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold">
                    {m.from_staff && <ShieldCheck className="size-3.5 text-mint" />}
                    <span className={m.from_staff ? "text-mint" : "text-lavender"}>{m.author_name}</span>
                    {m.from_staff && <span className="font-normal text-mint/80">· staff</span>}
                  </p>
                  <p className="leading-relaxed break-words whitespace-pre-line">{m.body}</p>
                  <p className="mt-0.5 text-right text-[0.65rem] text-muted-foreground">{formatDateTime(m.created_at)}</p>
                </div>
              ),
            )}
            <div ref={end} />
          </div>
        )}
      </div>

      {canWrite ? (
        <div className="flex flex-col gap-2 border-t border-border p-2">
          {error && <p className="px-1 text-xs text-destructive">{error}</p>}
          {dice && (
            <div className="flex gap-2">
              <select value={choice} onChange={(e) => setChoice(e.target.value)} className={cn(field, "h-9 py-0")}>
                <option value="d10">Solo d10</option>
                <optgroup label="Caratteristica">
                  {attributes.map((a) => (
                    <option key={a.id} value={`a:${a.id}`}>
                      {a.name} ({a.code})
                    </option>
                  ))}
                </optgroup>
                {attributes.map((a) => (
                  <optgroup key={a.id} label={`Abilità · ${a.name}`}>
                    {skills
                      .filter((s) => s.attribute_id === a.id)
                      .map((s) => (
                        <option key={s.id} value={`s:${s.id}`}>
                          {s.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <Button type="button" size="sm" disabled={pending} onClick={roll} className="h-9 rounded-full">
                <Dices /> Tira
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              maxLength={8000}
              placeholder={canManage && !participants.length ? "Rispondi come staff…" : "Scrivi una risposta…"}
              className="min-h-0 flex-1 resize-none rounded-xl border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring"
            />
            <div className="flex flex-col gap-1">
              <Button type="button" variant="ghost" size="icon" onClick={() => setDice(!dice)} aria-pressed={dice} aria-label="Dadi" title="Tira un dado">
                <Dices />
              </Button>
              <Button type="button" size="icon" disabled={pending || !text.trim()} onClick={reply} aria-label="Invia">
                <SendHorizontal />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="border-t border-border p-3 text-center text-sm text-muted-foreground">Il ticket è chiuso. Se serve, aprine uno nuovo.</p>
      )}
    </div>
  );
}
