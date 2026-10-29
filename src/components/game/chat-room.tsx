"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, Crown, Dices, Eye, EyeOff, SendHorizontal, Users } from "lucide-react";
import {
  BlurredRows,
  DicePanel,
  EditBox,
  MasterPanel,
  MessageRow,
  RoomAccessBar,
  type DiceAttribute,
  type DiceSkill,
} from "@/components/game/chat-parts";
import { NeedsCharacter } from "@/components/game/needs-character";
import { Button } from "@/components/ui/button";
import { deleteMessage, editMessage, joinChat, leaveChat, setInvisible } from "@/lib/actions/chat";
import { HISTORY_SIZE, KIND_LABEL, freshSince, isFresh } from "@/lib/chat";
import { playEvent } from "@/lib/notify-sound";
import type { ChatPresent, ChatRoomData } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import { useResync } from "@/lib/use-resync";
import type { Message, MessageKind } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  data: ChatRoomData;
  /** Il personaggio approvato dell'utente (null: può solo guardare) */
  me: { id: string; name: string } | null;
  canNarrate: boolean;
  canModerate: boolean;
  canInvisible: boolean;
  canDice: boolean;
  /** È il proprietario della chat su invito */
  isOwner: boolean;
  ownerName: string | null;
  attributes: DiceAttribute[];
  skills: DiceSkill[];
};

const byTime = (a: Message, b: Message) => a.created_at.localeCompare(b.created_at) || a.id - b.id;

/**
 * Stanza di chat (dal Westeros: ChatRoom.tsx). Tempo reale con Supabase,
 * entrata e uscita dalla giocata, presenti, sussurri, dadi, modalità master,
 * correzione entro 5 minuti. I messaggi spariscono dopo la durata impostata.
 */
// Uscita dalla giocata in attesa: annullata se si rientra subito nella stessa chat
let pendingLeave: { roomId: string; timer: ReturnType<typeof setTimeout> } | null = null;

export function ChatRoom({ data, me, canNarrate, canModerate, canInvisible, canDice, isOwner, ownerName, attributes, skills }: Props) {
  const { room, settings } = data;
  const roomId = room.id;
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  /* ---------- Presenti e messaggi ---------- */
  const [present, setPresent] = useState<ChatPresent[]>(data.present);
  const [hidden, setHidden] = useState(data.hiddenCount);
  const [messages, setMessages] = useState<Message[]>(data.messages);
  // Dopo router.refresh() arrivano dal server i dati nuovi
  const [lastData, setLastData] = useState(data);
  if (data !== lastData) {
    setLastData(data);
    setPresent(data.present);
    setHidden(data.hiddenCount);
    setMessages((prev) => {
      const byId = new Map([...prev, ...data.messages].map((m) => [m.id, m]));
      return [...byId.values()].filter((m) => !data.room.cleared_at || m.created_at > data.room.cleared_at).sort(byTime);
    });
  }

  const loadPresence = useCallback(async () => {
    const [{ data: list }, { data: n }] = await Promise.all([
      supabase.rpc("chat_present", { p_room: roomId }),
      supabase.rpc("chat_hidden_count", { p_room: roomId }),
    ]);
    if (list) setPresent(list as ChatPresent[]);
    setHidden((n as number | null) ?? 0);
  }, [supabase, roomId]);

  useEffect(() => {
    const channel = supabase
      .channel(`presenti:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_presence", filter: `room_id=eq.${roomId}` }, () => loadPresence())
      .subscribe();
    // chi resta inattivo esce da solo: si ricontrolla ogni minuto
    const t = setInterval(loadPresence, 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(t);
    };
  }, [supabase, roomId, loadPresence]);

  const joined = !!me && present.some((p) => p.character_id === me.id);
  const invisible = data.invisible;
  const canWrite = !!me && (joined || invisible);

  /* ---------- Messaggi ---------- */
  const listRef = useRef<HTMLDivElement>(null);
  // si scende da soli solo se si è già in fondo; altrimenti "N nuovi messaggi"
  const atBottom = useRef(true);
  const [unseen, setUnseen] = useState(0);

  const scrollToEnd = useCallback((smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    atBottom.current = true;
    setUnseen(0);
  }, []);

  const addMessage = useCallback((msg: Message, own = false) => {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg].sort(byTime)));
    if (own) atBottom.current = true;
    else if (!atBottom.current) setUnseen((n) => n + 1);
  }, []);

  // Ricarica gli ultimi messaggi visibili (alla connessione e tornando sulla pagina)
  const reload = useCallback(async () => {
    const since = freshSince(Date.now(), settings.ttl_minutes);
    const { data: rows } = await supabase
      .from("messages")
      .select("*")
      .eq("room_id", roomId)
      .gt("created_at", room.cleared_at && room.cleared_at > since ? room.cleared_at : since)
      .order("created_at", { ascending: false })
      .limit(HISTORY_SIZE);
    if (rows) setMessages((rows as Message[]).sort(byTime));
  }, [supabase, roomId, room.cleared_at, settings.ttl_minutes]);

  const myId = me?.id;
  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` }, (payload) => {
        const msg = payload.new as Message;
        const own = msg.character_id === myId;
        // il messaggio di un altro suona col suono scelto per la chat (preferenze)
        if (!own && msg.kind !== "sistema") playEvent("chat");
        addMessage(msg, own);
        if (msg.kind === "sistema") {
          // la modalità master cambia i limiti: arrivano dal server
          if (/modalità master/i.test(msg.content)) router.refresh();
          else loadPresence();
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` }, (payload) => {
        const msg = payload.new as Message;
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const id = (payload.old as { id?: number }).id;
        if (id !== undefined) setMessages((prev) => prev.filter((m) => m.id !== id));
      })
      .subscribe((status) => {
        // (ri)collegato: recupero quello che è arrivato nel frattempo
        if (status === "SUBSCRIBED") reload();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, roomId, myId, router, reload, loadPresence, addMessage]);

  // Tornando sulla scheda, tornando in rete, o ogni 3 minuti
  useResync(() => {
    reload();
    loadPresence();
  });

  // I messaggi più vecchi della durata impostata spariscono dalla chat
  const [now, setNow] = useState(() => Date.parse(data.snapshotAt));
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setMessages((prev) => (prev.every((m) => isFresh(m.created_at, n, settings.ttl_minutes)) ? prev : prev.filter((m) => isFresh(m.created_at, n, settings.ttl_minutes))));
    }, 30_000);
    return () => clearInterval(t);
  }, [settings.ttl_minutes]);

  useEffect(() => {
    if (atBottom.current) scrollToEnd(false);
  }, [messages, scrollToEnd]);

  /* ---------- Scrittura ---------- */
  const [kind, setKind] = useState<MessageKind>("azione");
  const [recipient, setRecipient] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"dadi" | "master" | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);

  const others = present.filter((p) => p.character_id !== me?.id);
  const master = room.master_max !== null ? { min: room.master_min ?? 0, max: room.master_max } : null;
  const maxLen = kind === "azione" && master ? master.max : settings.max_length;
  const left = maxLen - text.length;
  const myNames = useMemo(() => (me && me.name.trim().length >= 2 ? [me.name.trim()] : []), [me]);

  // Entrata in giocata automatica all'apertura della chat (se si può);
  // se si stava giocando in un'altra chat, prima si esce da quella
  const canJoin = !!me && data.canEnter && (room.is_open || canModerate) && !invisible;
  const meId = me?.id ?? null;
  const busyInId = data.busyIn?.id ?? null;
  const tried = useRef(false);
  useEffect(() => {
    if (!meId || !canJoin || joined || tried.current) return;
    tried.current = true;
    (async () => {
      setBusy(true);
      setError(null);
      if (busyInId && busyInId !== roomId) await leaveChat(busyInId, meId);
      const res = await joinChat(roomId, meId);
      setBusy(false);
      if (res.error) return setError(res.error);
      router.refresh();
    })();
  }, [meId, canJoin, joined, busyInId, roomId, router]);

  // Uscita automatica lasciando la chat (mappa, altra chat); le finestre aperte sopra non contano
  useEffect(() => {
    if (!meId) return;
    if (pendingLeave?.roomId === roomId) {
      clearTimeout(pendingLeave.timer);
      pendingLeave = null;
    }
    return () => {
      pendingLeave = { roomId, timer: setTimeout(() => {
        pendingLeave = null;
        leaveChat(roomId, meId);
      }, 400) };
    };
  }, [meId, roomId]);

  async function toggleInvisible() {
    setBusy(true);
    const res = await setInvisible(!invisible);
    setBusy(false);
    if (res.error) return setError(res.error);
    router.refresh();
  }

  async function send() {
    const content = text.trim();
    if (!content || !me || sending) return;
    if (kind === "azione" && master && content.length < master.min) {
      return setError(`Modalità master: l'azione deve avere almeno ${master.min} caratteri (ne ha ${content.length}).`);
    }
    // sussurro: il destinatario dev'essere uno dei presenti
    const whisperTo = kind === "sussurro" ? others.find((o) => o.name.toLowerCase() === recipient.trim().toLowerCase()) : null;
    if (kind === "sussurro" && !whisperTo) {
      return setError(others.length ? "Per sussurrare scegli nel destinatario uno dei presenti." : "Non c'è nessun altro in chat a cui sussurrare.");
    }
    setSending(true);
    setError(null);
    const { data: row, error: insertError } = await supabase
      .from("messages")
      .insert({
        room_id: roomId,
        character_id: me.id,
        kind,
        content,
        recipient: whisperTo ? whisperTo.name : recipient.trim() || null,
        ...(whisperTo ? { recipient_id: whisperTo.character_id } : {}),
      })
      .select()
      .single<Message>();
    setSending(false);
    if (insertError || !row) {
      setError(
        insertError?.code === "42501"
          ? "Non puoi scrivere in questa chat: forse sei uscito dalla giocata o non hai più accesso."
          : (insertError?.message ?? "Messaggio non inviato. Riprova."),
      );
      return;
    }
    addMessage(row, true);
    setText("");
    // dopo un messaggio speciale si torna all'azione
    if (kind !== "azione") setKind("azione");
  }

  async function saveEdit(m: Message, content: string | null) {
    setEditing(null);
    if (content === null) return;
    const res = await editMessage(m.id, content);
    if (res.error) return setError(res.error);
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, content, edited_at: new Date().toISOString() } : x)));
  }

  async function remove(m: Message) {
    if (!window.confirm(`Eliminare questo messaggio di ${m.character_name}?`)) return;
    const res = await deleteMessage(m.id);
    if (res.error) return setError(res.error);
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
  }

  const back = `/mappa?quartiere=${room.location_id}`;
  const blurred = !joined && !invisible;

  return (
    <div className="fixed inset-x-0 bottom-0 top-[calc(5rem+env(safe-area-inset-top))] z-10 p-[10px] lg:top-24 lg:left-72">
    <div className="glass flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
      {/* Intestazione */}
      <header className={cn("relative shrink-0 overflow-hidden bg-gradient-to-r px-4 py-3 sm:px-6", room.district.gradient)}>
        <div className="absolute inset-0 bg-night/35" />
        <div className="relative flex items-center gap-3">
          <Link href={back} className="rounded-full p-1.5 text-white/90 hover:bg-white/15" aria-label="Torna alla mappa">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs tracking-widest text-white/80 uppercase">{room.district.name}</p>
            <h1 className="truncate font-heading text-3xl leading-none tracking-wide text-white">{room.name}</h1>
          </div>
          {canInvisible && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={toggleInvisible} className="rounded-full text-white hover:bg-white/15" title="Staff: leggi e scrivi senza comparire tra i presenti">
              {invisible ? <EyeOff /> : <Eye />}
              <span className="hidden sm:inline">{invisible ? "Invisibile" : "Visibile"}</span>
            </Button>
          )}
        </div>
        {room.description && <p className="relative mt-1 hidden text-sm text-white/85 sm:block">{room.description}</p>}
      </header>

      {room.access === "su_invito" && (
        <RoomAccessBar roomId={roomId} ownerName={ownerName} guests={data.guests} canManage={isOwner || canModerate} onChanged={() => router.refresh()} />
      )}

      {/* Presenti */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-sm sm:px-6">
        <Users className="size-4 shrink-0 text-mint" />
        {present.length === 0 ? (
          <span className="text-muted-foreground">Nessuno in giocata.</span>
        ) : (
          present.map((p) => (
            <span key={p.character_id} className={cn("rounded-full px-2.5 py-0.5 text-xs", p.character_id === me?.id ? "bg-flamingo/25 text-white" : "bg-white/10")}>
              {p.name}
            </span>
          ))
        )}
      </div>

      {master && (
        <p className="shrink-0 border-b border-orchid/30 bg-orchid/10 px-4 py-1.5 text-xs text-orchid sm:px-6">
          <Crown className="mr-1 inline size-3.5" />
          Modalità master{room.master_by ? ` di ${room.master_by}` : ""}: azioni {master.min > 0 ? `da ${master.min} a ` : "fino a "}
          {master.max} caratteri.
        </p>
      )}

      {/* Messaggi */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
            if (atBottom.current) setUnseen(0);
          }}
          className="flex h-full flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6"
        >
          {blurred ? (
            <div className="flex flex-col gap-4">
              {hidden > 0 && <BlurredRows count={hidden} />}
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {canJoin && !error
                    ? "Entrata in giocata…"
                    : hidden > 0
                      ? `In questa chat ci sono ${hidden} messaggi recenti.`
                      : "La chat è tranquilla."}
                </p>
                {!room.is_open && <p className="text-sm text-muted-foreground">Questa chat è chiusa dallo staff.</p>}
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            </div>
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nessun messaggio recente. Inizia tu la scena.</p>
          ) : (
            messages.map((m) =>
              editing?.id === m.id ? (
                <EditBox key={m.id} message={m} maxLength={m.kind === "azione" && master ? master.max : settings.max_length} onDone={(t) => saveEdit(m, t)} />
              ) : (
                <MessageRow
                  key={m.id}
                  message={m}
                  myNames={myNames}
                  mine={m.character_id === me?.id && m.kind !== "sistema"}
                  canModerate={canModerate}
                  now={now}
                  onEdit={setEditing}
                  onDelete={remove}
                />
              ),
            )
          )}
        </div>
        {unseen > 0 && (
          <button
            type="button"
            onClick={() => scrollToEnd()}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-flamingo px-4 py-1.5 text-sm font-medium text-white shadow-lg"
          >
            <ArrowDown className="size-4" />
            {unseen} {unseen === 1 ? "nuovo messaggio" : "nuovi messaggi"}
          </button>
        )}
      </div>

      {/* Scrittura */}
      {!me ? (
        <NeedsCharacter className="border-t border-border" text="Per giocare in chat serve un personaggio approvato." />
      ) : canWrite ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex shrink-0 flex-col gap-2 border-t border-border p-3 sm:p-4"
        >
          {panel === "dadi" && <DicePanel roomId={roomId} characterId={me.id} attributes={attributes} skills={skills} onClose={() => setPanel(null)} onError={setError} />}
          {panel === "master" && <MasterPanel roomId={roomId} characterId={me.id} active={master} onClose={() => setPanel(null)} onError={setError} />}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as MessageKind)}
              aria-label="Tipo di messaggio"
              className="h-8 rounded-lg border border-input bg-night/40 px-2 outline-none focus-visible:border-ring"
            >
              <option value="azione">{KIND_LABEL.azione}</option>
              <option value="fuori_gioco">{KIND_LABEL.fuori_gioco}</option>
              <option value="sussurro">{KIND_LABEL.sussurro}</option>
              {canNarrate && <option value="master">{KIND_LABEL.master}</option>}
            </select>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              list={`dest-${roomId}`}
              maxLength={60}
              placeholder={kind === "sussurro" ? "A chi sussurri?" : "Destinatario (facoltativo)"}
              aria-label="Destinatario"
              className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-night/40 px-2 outline-none focus-visible:border-ring sm:max-w-56"
            />
            <datalist id={`dest-${roomId}`}>
              {others.map((o) => (
                <option key={o.character_id} value={o.name} />
              ))}
            </datalist>
            <span className="ml-auto flex gap-1">
              {canDice && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setPanel(panel === "dadi" ? null : "dadi")} className="rounded-full" aria-pressed={panel === "dadi"}>
                  <Dices /> Dadi
                </Button>
              )}
              {(canNarrate || canModerate) && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setPanel(panel === "master" ? null : "master")} className="rounded-full" aria-pressed={panel === "master"}>
                  <Crown /> Master
                </Button>
              )}
            </span>
          </div>
          <div className="flex gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              maxLength={maxLen}
              rows={3}
              placeholder={
                kind === "fuori_gioco" ? "Scrivi fuori dal gioco…" : kind === "master" ? "Narra la scena…" : "Cosa fa il tuo personaggio? Il parlato va tra < >, «» o \"\"…"
              }
              className="min-h-0 flex-1 resize-none rounded-xl border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring"
            />
            <Button type="submit" size="icon-lg" disabled={sending || !text.trim()} className="h-auto self-stretch px-4" aria-label="Invia">
              <SendHorizontal />
            </Button>
          </div>
          <p className={cn("text-right text-xs", left < 50 ? "text-peach" : "text-muted-foreground")}>
            Invio per mandare, Maiusc+Invio per andare a capo · {left} caratteri
          </p>
        </form>
      ) : null}
    </div>
    </div>
  );
}
