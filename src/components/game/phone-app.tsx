"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Ban,
  BookUser,
  Camera,
  Check,
  CheckCheck,
  Copy,
  LogOut,
  MessageCircle,
  Mic,
  Phone,
  PhoneCall,
  PhoneOff,
  Plus,
  SendHorizontal,
  Trash2,
  UserPlus,
  Users,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormattedText } from "@/components/game/chat-parts";
import { formatTime, initials } from "@/lib/format";
import {
  PHONE_BUCKET,
  formatPhone,
  normalizePhone,
  type PhoneBlock,
  type PhoneCall as Call,
  type PhoneContact,
  type PhoneMember,
  type PhoneMessage,
  type PhoneNumber,
  type PhoneProfile,
  type PhoneThread,
} from "@/lib/phone";
import { createClient } from "@/lib/supabase/client";
import { useResync } from "@/lib/use-resync";
import { cn } from "@/lib/utils";

// Telefono del personaggio (al posto dei messaggi ON): numeri, chat a due e
// di gruppo, rubrica, profilo, numeri bloccati, chiamate e videochiamate.
// Tutto in tempo reale; le regole le controlla il database.

type Screen = "chats" | "contacts" | "profile" | "blocked";
type Props = {
  userId: string;
  characterId: string;
  maxNumbers: number;
  initialNumber: string | null;
  initialThread: string | null;
};

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-night/40 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const MODE_LABEL: Record<string, { label: string; icon: React.ReactNode } | undefined> = {
  vocale: { label: "Messaggio vocale", icon: <Mic className="size-3.5" /> },
  chiamata: { label: "In chiamata", icon: <Phone className="size-3.5" /> },
  videochiamata: { label: "In videochiamata", icon: <Video className="size-3.5" /> },
};

function errorText(e: { message: string } | null) {
  return e ? e.message.replace(/^.*?:\s(?=[A-Z])/, "") : null;
}

function listTime(iso: string) {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? formatTime(iso)
    : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" });
}

function Avatar({ name, url, size = "size-10" }: { name: string; url: string | null; size?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={cn(size, "shrink-0 rounded-full object-cover")} />
  ) : (
    <span className={cn(size, "grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet via-orchid to-peach font-heading text-white")}>
      {initials(name)}
    </span>
  );
}

export function PhoneApp({ userId, characterId, maxNumbers, initialNumber, initialThread }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [numbers, setNumbers] = useState<PhoneNumber[] | null>(null);
  const [current, setCurrent] = useState<string | null>(initialNumber);
  const [screen, setScreen] = useState<Screen>("chats");
  const [openThread, setOpenThread] = useState<string | null>(initialThread);
  const [threads, setThreads] = useState<PhoneThread[]>([]);
  const [members, setMembers] = useState<PhoneMember[]>([]);
  const [messages, setMessages] = useState<PhoneMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, PhoneProfile>>({});
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [blocks, setBlocks] = useState<PhoneBlock[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [error, setError] = useState<string | null>(null);

  const me = numbers?.find((n) => n.id === current) ?? null;

  // ----- caricamento -----
  const loadNumbers = useCallback(async () => {
    const { data } = await supabase.from("phone_numbers").select("*").order("created_at");
    const list = (data ?? []) as PhoneNumber[];
    setNumbers(list);
    setCurrent((c) => (c && list.some((n) => n.id === c) ? c : (list[0]?.id ?? null)));
  }, [supabase]);

  const loadAll = useCallback(async () => {
    if (!current) return;
    const { data: mine } = await supabase.from("phone_members").select("thread_id").eq("number_id", current);
    const ids = ((mine ?? []) as { thread_id: string }[]).map((m) => m.thread_id);
    const [t, m, msg, dir, c, b, k] = await Promise.all([
      ids.length ? supabase.from("phone_threads").select("*").in("id", ids) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from("phone_members").select("thread_id, number_id, last_read_at").in("thread_id", ids) : Promise.resolve({ data: [] }),
      ids.length
        ? supabase.from("phone_messages").select("id, thread_id, sender_number_id, mode, body, created_at").in("thread_id", ids).order("created_at", { ascending: false }).limit(1500)
        : Promise.resolve({ data: [] }),
      supabase.rpc("phone_directory"),
      supabase.from("phone_contacts").select("id, number_id, digits, name").eq("number_id", current).order("name"),
      supabase.from("phone_blocks").select("number_id, digits").eq("number_id", current),
      supabase.from("phone_calls").select("id, thread_id, caller_number_id, callee_number_id, video, status, created_at, answered_at").in("status", ["squilla", "attiva"]),
    ]);
    setThreads((t.data ?? []) as PhoneThread[]);
    setMembers((m.data ?? []) as PhoneMember[]);
    setMessages(((msg.data ?? []) as PhoneMessage[]).reverse());
    setProfiles(Object.fromEntries(((dir.data ?? []) as PhoneProfile[]).map((p) => [p.number_id, p])));
    setContacts((c.data ?? []) as PhoneContact[]);
    setBlocks((b.data ?? []) as PhoneBlock[]);
    setCalls((k.data ?? []) as Call[]);
  }, [supabase, current]);

  useEffect(() => {
    const t = setTimeout(loadNumbers, 0);
    return () => clearTimeout(t);
  }, [loadNumbers]);

  useEffect(() => {
    const t = setTimeout(loadAll, 0);
    return () => clearTimeout(t);
  }, [loadAll]);

  useResync(() => {
    loadNumbers();
    loadAll();
  });

  // Tempo reale: messaggi, partecipanti, conversazioni e chiamate
  const threadIds = useMemo(() => new Set(threads.map((t) => t.id)), [threads]);
  const threadIdsRef = useRef(threadIds);
  useEffect(() => {
    threadIdsRef.current = threadIds;
  }, [threadIds]);
  useEffect(() => {
    if (!current) return;
    const ch = supabase
      .channel(`telefono:${current}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "phone_messages" }, (p) => {
        const m = p.new as PhoneMessage;
        if (threadIdsRef.current.has(m.thread_id)) setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        else loadAll(); // conversazione nuova
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "phone_members" }, () => loadAll())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "phone_threads" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "phone_calls" }, async () => {
        const { data } = await supabase
          .from("phone_calls")
          .select("id, thread_id, caller_number_id, callee_number_id, video, status, created_at, answered_at")
          .in("status", ["squilla", "attiva"]);
        setCalls((data ?? []) as Call[]);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, current, loadAll]);

  // ----- nomi -----
  const contactByDigits = useMemo(() => new Map(contacts.map((c) => [c.digits, c])), [contacts]);
  const nameOf = useCallback(
    (numberId: string | null) => {
      if (!numberId) return "";
      const p = profiles[numberId];
      if (!p) return "Numero sconosciuto";
      return contactByDigits.get(p.digits)?.name ?? p.display_name;
    },
    [profiles, contactByDigits],
  );

  const threadView = useCallback(
    (t: PhoneThread) => {
      if (t.is_group) return { name: t.name, avatar: t.avatar_url, sub: `${members.filter((m) => m.thread_id === t.id).length} partecipanti`, other: null as string | null };
      const other = members.find((m) => m.thread_id === t.id && m.number_id !== current)?.number_id ?? null;
      const p = other ? profiles[other] : null;
      const saved = p ? contactByDigits.get(p.digits) : undefined;
      return {
        name: saved?.name ?? (p ? `~ ${p.display_name}` : "Numero sconosciuto"),
        avatar: p?.avatar_url ?? null,
        sub: p ? formatPhone(p.digits) : "",
        other,
      };
    },
    [members, profiles, contactByDigits, current],
  );

  // ----- azioni -----
  async function rpc(fn: string, args: Record<string, unknown>) {
    setError(null);
    const { data, error: e } = await supabase.rpc(fn, args);
    if (e) setError(errorText(e) ?? "Operazione non riuscita.");
    return e ? null : (data ?? true);
  }

  async function createNumber() {
    const id = await rpc("phone_create_number", { p_character: characterId });
    if (id) {
      await loadNumbers();
      setCurrent(id as string);
      setScreen("profile");
    }
  }

  async function openChatWith(digits: string) {
    if (!current) return;
    const id = await rpc("phone_open_chat", { p_from: current, p_to: digits });
    if (id) {
      await loadAll();
      setScreen("chats");
      setOpenThread(id as string);
    }
  }

  // ----- schermate -----
  if (numbers === null) return <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">Accensione del telefono…</p>;

  if (numbers.length === 0 || !me) {
    return (
      <div className="glass mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl p-8 text-center">
        <Phone className="size-12 text-flamingo" />
        <p className="font-heading text-3xl tracking-wide">Il tuo telefono</p>
        <p className="text-sm text-muted-foreground">
          Attiva un numero di Miami per il tuo personaggio. Potrai scrivere solo a chi conosci il numero: dallo agli altri personaggi in gioco.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" onClick={createNumber} className="rounded-full px-6">
          <Plus /> Attiva un numero
        </Button>
      </div>
    );
  }

  const thread = openThread ? threads.find((t) => t.id === openThread) : null;
  const unreadOf = (threadId: string) => {
    const mine = members.find((m) => m.thread_id === threadId && m.number_id === current);
    if (!mine) return 0;
    return messages.filter((m) => m.thread_id === threadId && m.sender_number_id !== current && m.created_at > mine.last_read_at).length;
  };

  return (
    <div className="glass mx-auto flex h-[min(42rem,calc(100dvh-12rem))] w-full max-w-3xl flex-col overflow-hidden rounded-3xl">
      {/* Barra del telefono: numero in uso */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <Avatar name={me.display_name} url={me.avatar_url} size="size-8" />
        <div className="min-w-0 flex-1">
          {numbers.length > 1 ? (
            <select
              value={me.id}
              onChange={(e) => {
                setCurrent(e.target.value);
                setOpenThread(null);
              }}
              className="w-full max-w-64 truncate rounded-md bg-transparent text-sm font-medium outline-none"
              aria-label="Numero in uso"
            >
              {numbers.map((n) => (
                <option key={n.id} value={n.id} className="bg-night">
                  {n.display_name} · {formatPhone(n.digits)}
                </option>
              ))}
            </select>
          ) : (
            <p className="truncate text-sm font-medium">{me.display_name}</p>
          )}
          <p className="text-xs text-muted-foreground">{formatPhone(me.digits)}</p>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 bg-destructive/15 px-3 py-2 text-sm text-destructive">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs underline">
            Chiudi
          </button>
        </p>
      )}

      <div className="min-h-0 flex-1">
        {thread ? (
          <ThreadView
            key={thread.id}
            supabase={supabase}
            thread={thread}
            me={me}
            view={threadView(thread)}
            members={members.filter((m) => m.thread_id === thread.id)}
            messages={messages.filter((m) => m.thread_id === thread.id)}
            call={calls.find((c) => c.thread_id === thread.id) ?? null}
            busy={calls.some((c) => c.caller_number_id === current || c.callee_number_id === current)}
            nameOf={nameOf}
            profiles={profiles}
            contacts={contacts}
            rpc={rpc}
            onBack={() => setOpenThread(null)}
            onChanged={loadAll}
          />
        ) : screen === "chats" ? (
          <ChatList
            threads={[...threads].sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))}
            messages={messages}
            view={threadView}
            unreadOf={unreadOf}
            nameOf={nameOf}
            current={me.id}
            contacts={contacts}
            onOpen={setOpenThread}
            onNewChat={openChatWith}
            onNewGroup={async (name, digits) => {
              const id = await rpc("phone_create_group", { p_from: me.id, p_name: name, p_to: digits });
              if (id) {
                await loadAll();
                setOpenThread(id as string);
              }
            }}
          />
        ) : screen === "contacts" ? (
          <Contacts supabase={supabase} me={me} contacts={contacts} onChanged={loadAll} onWrite={openChatWith} onError={setError} />
        ) : screen === "profile" ? (
          <Profile
            supabase={supabase}
            userId={userId}
            me={me}
            canAdd={numbers.length < maxNumbers}
            maxNumbers={maxNumbers}
            rpc={rpc}
            onSaved={loadNumbers}
            onAddNumber={createNumber}
          />
        ) : (
          <Blocked supabase={supabase} me={me} blocks={blocks} contactByDigits={contactByDigits} onChanged={loadAll} onError={setError} />
        )}
      </div>

      {/* Menu in basso, come su un telefono */}
      {!thread && (
        <nav className="grid grid-cols-4 border-t border-white/10 text-[0.7rem]">
          {(
            [
              ["chats", "Chat", <MessageCircle key="c" />],
              ["contacts", "Rubrica", <BookUser key="r" />],
              ["profile", "Profilo", <Camera key="p" />],
              ["blocked", "Bloccati", <Ban key="b" />],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setScreen(id)}
              aria-current={screen === id ? "page" : undefined}
              className={cn("flex flex-col items-center gap-0.5 py-2 [&_svg]:size-5", screen === id ? "text-flamingo" : "text-muted-foreground hover:text-foreground")}
            >
              {icon}
              {label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

/* ------------------------------ Elenco delle chat ------------------------------ */

function ChatList({
  threads,
  messages,
  view,
  unreadOf,
  nameOf,
  current,
  contacts,
  onOpen,
  onNewChat,
  onNewGroup,
}: {
  threads: PhoneThread[];
  messages: PhoneMessage[];
  view: (t: PhoneThread) => { name: string; avatar: string | null; sub: string };
  unreadOf: (id: string) => number;
  nameOf: (id: string | null) => string;
  current: string;
  contacts: PhoneContact[];
  onOpen: (id: string) => void;
  onNewChat: (digits: string) => void;
  onNewGroup: (name: string, digits: string[]) => void;
}) {
  const [panel, setPanel] = useState<"none" | "chat" | "group">("none");
  const [number, setNumber] = useState("");
  const [groupName, setGroupName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-2 p-3">
        <Button type="button" size="sm" variant={panel === "chat" ? "default" : "outline"} className="rounded-full" onClick={() => setPanel(panel === "chat" ? "none" : "chat")}>
          <MessageCircle /> Nuova chat
        </Button>
        <Button type="button" size="sm" variant={panel === "group" ? "default" : "outline"} className="rounded-full" onClick={() => setPanel(panel === "group" ? "none" : "group")}>
          <Users /> Nuovo gruppo
        </Button>
      </div>
      {localError && <p className="px-3 pb-2 text-sm text-destructive">{localError}</p>}

      {panel === "chat" && (
        <form
          className="flex flex-col gap-2 border-y border-white/10 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const d = normalizePhone(number);
            if (!d) return setLocalError("Scrivi il numero completo, es. +1 (305) 482-1937.");
            setLocalError(null);
            onNewChat(d);
            setNumber("");
            setPanel("none");
          }}
        >
          <div className="flex gap-2">
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Numero, es. +1 (305) 482-1937" inputMode="tel" className={inputCls} aria-label="Numero" />
            <Button type="submit" className="h-10 rounded-full">
              Scrivi
            </Button>
          </div>
          {contacts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {contacts.map((c) => (
                <button key={c.id} type="button" onClick={() => onNewChat(c.digits)} className="rounded-full bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20">
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </form>
      )}

      {panel === "group" && (
        <form
          className="flex flex-col gap-2 border-y border-white/10 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const typed = extra
              .split(/[,;\n]/)
              .map((x) => x.trim())
              .filter(Boolean);
            const norm = typed.map(normalizePhone);
            if (norm.some((d) => !d)) return setLocalError("Un numero non è completo: controlla.");
            const all = [...new Set([...picked, ...(norm as string[])])];
            if (!groupName.trim()) return setLocalError("Scrivi il nome del gruppo.");
            if (all.length === 0) return setLocalError("Scegli almeno un contatto o scrivi un numero.");
            setLocalError(null);
            onNewGroup(groupName.trim(), all);
            setGroupName("");
            setPicked([]);
            setExtra("");
            setPanel("none");
          }}
        >
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={60} placeholder="Nome del gruppo" className={inputCls} aria-label="Nome del gruppo" />
          {contacts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {contacts.map((c) => {
                const on = picked.includes(c.digits);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked(on ? picked.filter((x) => x !== c.digits) : [...picked, c.digits])}
                    className={cn("rounded-full px-2.5 py-1 text-xs", on ? "bg-flamingo text-white" : "bg-white/10 hover:bg-white/20")}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
          <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Altri numeri, separati da virgola (facoltativo)" className={inputCls} aria-label="Altri numeri" />
          <Button type="submit" size="sm" className="w-fit self-end rounded-full">
            Crea il gruppo
          </Button>
        </form>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {threads.map((t) => {
          const v = view(t);
          const last = [...messages].reverse().find((m) => m.thread_id === t.id);
          const unread = unreadOf(t.id);
          return (
            <li key={t.id}>
              <button type="button" onClick={() => onOpen(t.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5">
                <Avatar name={v.name} url={v.avatar} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{v.name}</span>
                    {t.is_group && <Users className="size-3.5 shrink-0 text-muted-foreground" />}
                    {last && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{listTime(last.created_at)}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="truncate text-xs text-muted-foreground">
                      {last
                        ? `${last.mode === "evento" ? "" : last.sender_number_id === current ? "Tu: " : t.is_group ? `${nameOf(last.sender_number_id)}: ` : ""}${MODE_LABEL[last.mode] && last.mode === "vocale" ? "🎤 " : ""}${last.body}`
                        : v.sub}
                    </span>
                    {unread > 0 && <span className="ml-auto grid min-w-5 shrink-0 place-items-center rounded-full bg-flamingo px-1 text-[0.65rem] font-bold text-white">{unread}</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {threads.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nessuna chat. Scrivi a un numero che conosci.</li>}
      </ul>
    </div>
  );
}

/* ------------------------------ Conversazione ------------------------------ */

type Supabase = ReturnType<typeof createClient>;
type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

function ThreadView({
  supabase,
  thread,
  me,
  view,
  members,
  messages,
  call,
  busy,
  nameOf,
  profiles,
  contacts,
  rpc,
  onBack,
  onChanged,
}: {
  supabase: Supabase;
  thread: PhoneThread;
  me: PhoneNumber;
  view: { name: string; avatar: string | null; sub: string; other: string | null };
  members: PhoneMember[];
  messages: PhoneMessage[];
  call: Call | null;
  busy: boolean;
  nameOf: (id: string | null) => string;
  profiles: Record<string, PhoneProfile>;
  contacts: PhoneContact[];
  rpc: Rpc;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"testo" | "vocale">("testo");
  const [sending, setSending] = useState(false);
  const [panel, setPanel] = useState<"none" | "members">("none");
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;

  // Letto, e in fondo alla conversazione a ogni messaggio nuovo
  useEffect(() => {
    supabase.rpc("phone_mark_read", { p_thread: thread.id, p_from: me.id });
    bottom.current?.scrollIntoView({ block: "end" });
  }, [supabase, thread.id, me.id, lastId]);

  const inCall = call?.status === "attiva" && (call.caller_number_id === me.id || call.callee_number_id === me.id);
  const callMode = inCall ? (call.video ? "videochiamata" : "chiamata") : null;
  const otherRead = !thread.is_group ? members.find((m) => m.number_id !== me.id)?.last_read_at : undefined;

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const ok = await rpc("phone_send", { p_thread: thread.id, p_from: me.id, p_body: body, p_mode: mode });
    setSending(false);
    if (ok) setText("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-2 py-2">
        <button type="button" onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Indietro">
          <ArrowLeft className="size-5" />
        </button>
        <Avatar name={view.name} url={view.avatar} size="size-9" />
        <button type="button" onClick={() => thread.is_group && setPanel(panel === "members" ? "none" : "members")} className="min-w-0 flex-1 text-left">
          <p className="truncate font-medium">{view.name}</p>
          <p className="truncate text-xs text-muted-foreground">{view.sub}</p>
        </button>
        {!thread.is_group && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => rpc("phone_call", { p_thread: thread.id, p_from: me.id, p_video: false })}
              className="grid size-9 place-items-center rounded-full text-mint hover:bg-white/10 disabled:opacity-30"
              aria-label="Chiama"
              title="Chiama"
            >
              <Phone className="size-5" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => rpc("phone_call", { p_thread: thread.id, p_from: me.id, p_video: true })}
              className="grid size-9 place-items-center rounded-full text-mint hover:bg-white/10 disabled:opacity-30"
              aria-label="Videochiama"
              title="Videochiama"
            >
              <Video className="size-5" />
            </button>
          </>
        )}
        {thread.is_group && (
          <button type="button" onClick={() => setPanel(panel === "members" ? "none" : "members")} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Partecipanti">
            <Users className="size-5" />
          </button>
        )}
      </div>

      {call && <CallBanner call={call} me={me.id} name={view.name} rpc={rpc} />}

      {panel === "members" && thread.is_group && (
        <GroupPanel thread={thread} me={me} members={members} profiles={profiles} contacts={contacts} nameOf={nameOf} rpc={rpc} onChanged={onChanged} onLeft={onBack} />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <ul className="flex flex-col gap-1.5">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const day = new Date(m.created_at).toDateString();
            const newDay = !prev || new Date(prev.created_at).toDateString() !== day;
            const mine = m.sender_number_id === me.id;
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <li className="my-1 text-center text-[0.7rem] text-muted-foreground">
                    {new Date(m.created_at).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" })}
                  </li>
                )}
                {m.mode === "evento" ? (
                  <li className="mx-auto flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-muted-foreground">
                    {/chiamata/i.test(m.body) ? (m.body.startsWith("Video") ? <Video className="size-3.5" /> : <PhoneCall className="size-3.5" />) : null}
                    {m.body} · {formatTime(m.created_at)}
                  </li>
                ) : (
                  <li className={cn("flex max-w-[85%] flex-col", mine ? "items-end self-end" : "items-start self-start")}>
                    <div
                      className={cn(
                        "rounded-2xl px-3 py-2 text-sm",
                        mine ? "rounded-br-sm bg-flamingo/25" : "rounded-bl-sm bg-white/10",
                        m.mode !== "testo" && "border border-mint/30",
                      )}
                    >
                      {thread.is_group && !mine && <p className="mb-0.5 text-xs font-semibold text-peach">{nameOf(m.sender_number_id)}</p>}
                      {MODE_LABEL[m.mode] && (
                        <p className="mb-0.5 flex items-center gap-1 text-[0.7rem] font-medium text-mint">
                          {MODE_LABEL[m.mode]!.icon} {MODE_LABEL[m.mode]!.label}
                        </p>
                      )}
                      <p className="break-words whitespace-pre-line">{m.mode === "testo" ? m.body : <FormattedText text={m.body} />}</p>
                      <p className="mt-0.5 flex items-center justify-end gap-1 text-[0.65rem] text-muted-foreground">
                        {formatTime(m.created_at)}
                        {mine && !thread.is_group && (otherRead && otherRead >= m.created_at ? <CheckCheck className="size-3.5 text-mint" /> : <Check className="size-3.5" />)}
                      </p>
                    </div>
                  </li>
                )}
              </Fragment>
            );
          })}
          {messages.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Scrivi il primo messaggio.</li>}
        </ul>
        <div ref={bottom} />
      </div>

      <form
        className="flex flex-col gap-1.5 border-t border-white/10 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="flex items-center gap-1 text-xs">
          {callMode ? (
            <span className="flex items-center gap-1 rounded-full bg-mint/15 px-2.5 py-1 text-mint">
              {callMode === "videochiamata" ? <Video className="size-3.5" /> : <Phone className="size-3.5" />}
              {callMode === "videochiamata" ? "In videochiamata" : "In chiamata"}: il parlato tra &lt; &gt;
            </span>
          ) : (
            <>
              <button type="button" onClick={() => setMode("testo")} className={cn("rounded-full px-2.5 py-1", mode === "testo" ? "bg-white/15" : "text-muted-foreground hover:bg-white/5")}>
                Messaggio
              </button>
              <button
                type="button"
                onClick={() => setMode("vocale")}
                className={cn("flex items-center gap-1 rounded-full px-2.5 py-1", mode === "vocale" ? "bg-mint/15 text-mint" : "text-muted-foreground hover:bg-white/5")}
              >
                <Mic className="size-3.5" /> Vocale
              </button>
              {mode === "vocale" && <span className="text-muted-foreground">il parlato tra &lt; &gt;</span>}
            </>
          )}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder={callMode || mode === "vocale" ? "<Quello che dici> e quello che fai…" : "Scrivi un messaggio…"}
            className="max-h-40 min-h-11 flex-1 resize-y rounded-2xl border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring"
            aria-label="Messaggio"
          />
          <Button type="submit" size="icon" disabled={sending || !text.trim()} className="size-11 rounded-full" aria-label="Invia">
            <SendHorizontal />
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Chiamata in corso o che squilla, in cima alla conversazione */
function CallBanner({ call, me, name, rpc }: { call: Call; me: string; name: string; rpc: Rpc }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const incoming = call.callee_number_id === me;
  const kind = call.video ? "Videochiamata" : "Chiamata";
  const secs = call.answered_at ? Math.max(0, Math.floor((now - Date.parse(call.answered_at)) / 1000)) : 0;
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <div className={cn("flex flex-wrap items-center gap-2 px-3 py-2 text-sm", call.status === "attiva" ? "bg-mint/15" : "blink-call bg-flamingo/15")}>
      {call.video ? <Video className="size-4 text-mint" /> : <PhoneCall className="size-4 text-mint" />}
      <span className="flex-1">
        {call.status === "attiva" ? `${kind} con ${name} · ${clock}` : incoming ? `${kind} in arrivo da ${name}…` : `${kind} a ${name}: squilla…`}
      </span>
      {call.status === "squilla" && incoming ? (
        <>
          <Button type="button" size="sm" className="rounded-full bg-mint text-night hover:bg-mint/90" onClick={() => rpc("phone_answer", { p_call: call.id, p_accept: true })}>
            <Phone /> Rispondi
          </Button>
          <Button type="button" size="sm" variant="destructive" className="rounded-full" onClick={() => rpc("phone_answer", { p_call: call.id, p_accept: false })}>
            <PhoneOff /> Rifiuta
          </Button>
        </>
      ) : (
        <Button type="button" size="sm" variant="destructive" className="rounded-full" onClick={() => rpc("phone_hangup", { p_call: call.id })}>
          <PhoneOff /> Riaggancia
        </Button>
      )}
    </div>
  );
}

function GroupPanel({
  thread,
  me,
  members,
  profiles,
  contacts,
  nameOf,
  rpc,
  onChanged,
  onLeft,
}: {
  thread: PhoneThread;
  me: PhoneNumber;
  members: PhoneMember[];
  profiles: Record<string, PhoneProfile>;
  contacts: PhoneContact[];
  nameOf: (id: string | null) => string;
  rpc: Rpc;
  onChanged: () => void;
  onLeft: () => void;
}) {
  const [name, setName] = useState(thread.name);
  const [add, setAdd] = useState("");
  const inGroup = new Set(members.map((m) => profiles[m.number_id]?.digits).filter(Boolean));
  return (
    <div className="flex max-h-72 flex-col gap-2 overflow-y-auto border-b border-white/10 bg-night/40 p-3 text-sm">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await rpc("phone_group_update", { p_thread: thread.id, p_from: me.id, p_name: name, p_avatar: thread.avatar_url })) onChanged();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputCls} aria-label="Nome del gruppo" />
        <Button type="submit" size="sm" variant="outline" className="h-10 rounded-full">
          Rinomina
        </Button>
      </form>
      <ul className="flex flex-col gap-1">
        {members.map((m) => (
          <li key={m.number_id} className="flex items-center gap-2">
            <Avatar name={nameOf(m.number_id)} url={profiles[m.number_id]?.avatar_url ?? null} size="size-7" />
            <span className="flex-1 truncate">{m.number_id === me.id ? "Tu" : nameOf(m.number_id)}</span>
            <span className="text-xs text-muted-foreground">{profiles[m.number_id] ? formatPhone(profiles[m.number_id].digits) : ""}</span>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = normalizePhone(add);
          if (!d) return;
          if (await rpc("phone_group_add", { p_thread: thread.id, p_from: me.id, p_to: d })) {
            setAdd("");
            onChanged();
          }
        }}
      >
        <input value={add} onChange={(e) => setAdd(e.target.value)} list={`rubrica-${thread.id}`} placeholder="Aggiungi un numero" inputMode="tel" className={inputCls} aria-label="Aggiungi un numero" />
        <datalist id={`rubrica-${thread.id}`}>
          {contacts
            .filter((c) => !inGroup.has(c.digits))
            .map((c) => (
              <option key={c.id} value={formatPhone(c.digits)}>
                {c.name}
              </option>
            ))}
        </datalist>
        <Button type="submit" size="sm" variant="outline" className="h-10 rounded-full">
          <UserPlus /> Aggiungi
        </Button>
      </form>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="w-fit text-destructive"
        onClick={async () => {
          if (!window.confirm(`Uscire dal gruppo «${thread.name}»?`)) return;
          if (await rpc("phone_group_leave", { p_thread: thread.id, p_from: me.id })) {
            onChanged();
            onLeft();
          }
        }}
      >
        <LogOut /> Esci dal gruppo
      </Button>
    </div>
  );
}

/* ------------------------------ Rubrica ------------------------------ */

function Contacts({
  supabase,
  me,
  contacts,
  onChanged,
  onWrite,
  onError,
}: {
  supabase: Supabase;
  me: PhoneNumber;
  contacts: PhoneContact[];
  onChanged: () => void;
  onWrite: (digits: string) => void;
  onError: (e: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  return (
    <div className="flex h-full flex-col">
      <form
        className="flex flex-col gap-2 border-b border-white/10 p-3 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = normalizePhone(number);
          if (!name.trim() || !d) return onError("Scrivi nome e numero completo.");
          const { error } = await supabase.from("phone_contacts").insert({ number_id: me.id, digits: d, name: name.trim().slice(0, 40) });
          if (error) return onError(error.code === "23505" ? "Questo numero è già in rubrica." : "Non salvato. Riprova.");
          onError(null);
          setName("");
          setNumber("");
          onChanged();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Nome" className={inputCls} aria-label="Nome" />
        <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Numero" inputMode="tel" className={inputCls} aria-label="Numero" />
        <Button type="submit" className="h-10 rounded-full">
          <UserPlus /> Salva
        </Button>
      </form>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {contacts.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2">
            <Avatar name={c.name} url={null} size="size-9" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{c.name}</span>
              <span className="block text-xs text-muted-foreground">{formatPhone(c.digits)}</span>
            </span>
            <button type="button" onClick={() => onWrite(c.digits)} className="grid size-9 place-items-center rounded-full text-mint hover:bg-white/10" aria-label={`Scrivi a ${c.name}`}>
              <MessageCircle className="size-4" />
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Togliere ${c.name} dalla rubrica?`)) return;
                await supabase.from("phone_contacts").delete().eq("id", c.id);
                onChanged();
              }}
              className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
              aria-label={`Elimina ${c.name}`}
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
        {contacts.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Rubrica vuota.</li>}
      </ul>
    </div>
  );
}

/* ------------------------------ Profilo ------------------------------ */

function Profile({
  supabase,
  userId,
  me,
  canAdd,
  maxNumbers,
  rpc,
  onSaved,
  onAddNumber,
}: {
  supabase: Supabase;
  userId: string;
  me: PhoneNumber;
  canAdd: boolean;
  maxNumbers: number;
  rpc: Rpc;
  onSaved: () => void;
  onAddNumber: () => void;
}) {
  const [name, setName] = useState(me.display_name);
  const [status, setStatus] = useState(me.status_text);
  const [avatar, setAvatar] = useState(me.avatar_url);
  const [note, setNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  async function upload(f: File) {
    if (f.size > 2 * 1024 * 1024) return setNote("La foto deve pesare al massimo 2 MB.");
    setUploading(true);
    const ext = f.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${userId}/${me.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(PHONE_BUCKET).upload(path, f, { contentType: f.type });
    setUploading(false);
    if (error) return setNote("Foto non caricata. Riprova.");
    setAvatar(supabase.storage.from(PHONE_BUCKET).getPublicUrl(path).data.publicUrl);
    setNote("Foto pronta: premi Salva.");
  }

  return (
    <form
      className="flex h-full flex-col gap-3 overflow-y-auto p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await rpc("phone_update_profile", { p_number: me.id, p_name: name, p_avatar: avatar, p_status: status })) {
          setNote("Profilo salvato.");
          onSaved();
        }
      }}
    >
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => file.current?.click()} className="relative" aria-label="Cambia la foto del profilo">
          <Avatar name={name || "?"} url={avatar} size="size-20" />
          <span className="absolute right-0 bottom-0 grid size-7 place-items-center rounded-full bg-flamingo text-white">
            <Camera className="size-4" />
          </span>
        </button>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Il tuo numero</p>
          <p className="flex items-center gap-2 font-heading text-2xl tracking-wide">
            {formatPhone(me.digits)}
            <button type="button" onClick={() => navigator.clipboard?.writeText(formatPhone(me.digits))} className="text-muted-foreground hover:text-foreground" aria-label="Copia il numero">
              <Copy className="size-4" />
            </button>
          </p>
          {uploading && <p className="text-xs text-muted-foreground">Caricamento della foto…</p>}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Nome del profilo
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Info
        <input value={status} onChange={(e) => setStatus(e.target.value)} maxLength={140} placeholder="Es. Disponibile" className={inputCls} />
      </label>
      {avatar && (
        <button type="button" onClick={() => setAvatar(null)} className="w-fit text-xs text-muted-foreground underline">
          Togli la foto
        </button>
      )}
      {note && <p className="text-sm text-mint">{note}</p>}
      <Button type="submit" className="w-fit rounded-full px-6">
        Salva
      </Button>
      <div className="mt-auto border-t border-white/10 pt-3 text-sm">
        {canAdd ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => window.confirm("Attivare un altro numero per il tuo personaggio?") && onAddNumber()}
          >
            <Plus /> Attiva un altro numero
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Hai già {maxNumbers} numeri: è il massimo.</p>
        )}
      </div>
    </form>
  );
}

/* ------------------------------ Bloccati ------------------------------ */

function Blocked({
  supabase,
  me,
  blocks,
  contactByDigits,
  onChanged,
  onError,
}: {
  supabase: Supabase;
  me: PhoneNumber;
  blocks: PhoneBlock[];
  contactByDigits: Map<string, PhoneContact>;
  onChanged: () => void;
  onError: (e: string | null) => void;
}) {
  const [number, setNumber] = useState("");
  return (
    <div className="flex h-full flex-col">
      <form
        className="flex flex-col gap-2 border-b border-white/10 p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = normalizePhone(number);
          if (!d) return onError("Scrivi il numero completo da bloccare.");
          if (!window.confirm(`Bloccare ${formatPhone(d)}? Non riceverai più i suoi messaggi né le sue chiamate.`)) return;
          const { error } = await supabase.from("phone_blocks").insert({ number_id: me.id, digits: d });
          if (error && error.code !== "23505") return onError("Non bloccato. Riprova.");
          onError(null);
          setNumber("");
          onChanged();
        }}
      >
        <div className="flex gap-2">
          <input value={number} onChange={(e) => setNumber(e.target.value)} list="rubrica-blocchi" placeholder="Numero da bloccare" inputMode="tel" className={inputCls} aria-label="Numero da bloccare" />
          <datalist id="rubrica-blocchi">
            {[...contactByDigits.values()].map((c) => (
              <option key={c.id} value={formatPhone(c.digits)}>
                {c.name}
              </option>
            ))}
          </datalist>
          <Button type="submit" variant="destructive" className="h-10 rounded-full">
            <Ban /> Blocca
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Chi è bloccato non lo sa: i suoi messaggi e le sue chiamate semplicemente non ti arrivano.</p>
      </form>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {blocks.map((b) => (
          <li key={b.digits} className="flex items-center gap-2 px-3 py-2">
            <Ban className="size-4 text-destructive" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{contactByDigits.get(b.digits)?.name ?? formatPhone(b.digits)}</span>
              {contactByDigits.get(b.digits) && <span className="block text-xs text-muted-foreground">{formatPhone(b.digits)}</span>}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={async () => {
                await supabase.from("phone_blocks").delete().eq("number_id", me.id).eq("digits", b.digits);
                onChanged();
              }}
            >
              Sblocca
            </Button>
          </li>
        ))}
        {blocks.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nessun numero bloccato.</li>}
      </ul>
    </div>
  );
}
