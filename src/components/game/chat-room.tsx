"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowDown, ArrowLeft, Bandage, ChevronDown, Crown, Dices, Eye, EyeOff, LayoutGrid, LogIn, LogOut, NotebookPen, Package, Save, SendHorizontal, SlidersHorizontal, Swords, Users } from "lucide-react";
import { ItemsPanel } from "@/components/game/chat-items";
import { ChatToolWindow, NotepadPanel, SaveChatPanel } from "@/components/game/chat-tools";
import { ChatPrefsPanel } from "@/components/game/prefs-panel";
import {
  BlurredRows,
  DicePanel,
  EditBox,
  MasterPanel,
  LookWindow,
  MessageRow,
  RoomAccessBar,
  type DiceAttribute,
  type DiceSkill,
} from "@/components/game/chat-parts";
import { StashPanel, useRoomStash } from "@/components/game/chat-stash";
import { ChatTagsBar } from "@/components/game/chat-tags";
import { CombatPanel } from "@/components/game/combat-panel";
import { IncidentPanel } from "@/components/game/incident-panel";
import { NeedsCharacter } from "@/components/game/needs-character";
import { SafetyLight } from "@/components/game/safety-light";
import { Button } from "@/components/ui/button";
import { deleteMessage, editMessage, joinChat, leaveChat, setInvisible } from "@/lib/actions/chat";
import { HISTORY_SIZE, KIND_LABEL, freshSince, isFresh } from "@/lib/chat";
import { playEvent } from "@/lib/notify-sound";
import type { ChatPresent, ChatRoomData } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import { setMySubTag } from "@/lib/chat-subtag";
import { useResync } from "@/lib/use-resync";
import type { Message, MessageKind, RoomTag } from "@/lib/types";
import { firstName } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  data: ChatRoomData;
  /** Il personaggio approvato dell'utente (null: può solo guardare) */
  me: { id: string; name: string } | null;
  canNarrate: boolean;
  canModerate: boolean;
  /** crea, rinomina ed elimina i sotto-tag (chat.sottotag) */
  canTags: boolean;
  /** riempie la cassa comune (chat.cassa) */
  canStash: boolean;
  canInvisible: boolean;
  canDice: boolean;
  /** Staff del combattimento: numeri dei tiri, difese al posto dei giocatori, chiusura */
  canCombat: boolean;
  /** È il proprietario della chat su invito */
  isOwner: boolean;
  ownerName: string | null;
  attributes: DiceAttribute[];
  skills: DiceSkill[];
};

const byTime = (a: Message, b: Message) => a.created_at.localeCompare(b.created_at) || a.id - b.id;

/** Comandi della chat: ognuno si apre nella sua finestra */
type Tool = "scontro" | "incidente" | "oggetti" | "cassa" | "dadi" | "master" | "note" | "salva" | "impostazioni";

/**
 * Stanza di chat (dal Westeros: ChatRoom.tsx). Tempo reale con Supabase,
 * entrata e uscita dalla giocata, presenti, sussurri, dadi, modalità master,
 * correzione entro 5 minuti. I messaggi spariscono dopo la durata impostata.
 */
export function ChatRoom({ data, me, canNarrate, canModerate, canTags, canStash, canInvisible, canDice, canCombat, isOwner, ownerName, attributes, skills }: Props) {
  const { room, settings } = data;
  const roomId = room.id;
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  /* ---------- Presenti e messaggi ---------- */
  const [present, setPresent] = useState<ChatPresent[]>(data.present);
  const [hidden, setHidden] = useState(data.hiddenCount);
  const [messages, setMessages] = useState<Message[]>(data.messages);
  // cresce a ogni messaggio di combattimento: il pannello dello scontro si ricarica
  const [combatTick, setCombatTick] = useState(0);
  // ritratti dei personaggi che scrivono (per le azioni) e look aperto
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [look, setLook] = useState<{ name: string; avatar: string | null; appearance: string | null } | null>(null);
  // ritratti dei PNG che parlano in chat
  const [npcAvatars, setNpcAvatars] = useState<Record<string, string | null>>({});
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

  // sotto-tag scelto da ogni presente (personaggio → sotto-tag)
  const [presentTags, setPresentTags] = useState<Record<string, string | null>>({});
  const loadPresentTags = useCallback(async () => {
    const { data: rows } = await supabase.from("chat_presence").select("character_id, tag_id").eq("room_id", roomId);
    if (rows) setPresentTags(Object.fromEntries((rows as { character_id: string; tag_id: string | null }[]).map((r) => [r.character_id, r.tag_id])));
  }, [supabase, roomId]);

  const loadPresence = useCallback(async () => {
    const [{ data: list }, { data: n }] = await Promise.all([
      supabase.rpc("chat_present", { p_room: roomId }),
      supabase.rpc("chat_hidden_count", { p_room: roomId }),
      loadPresentTags(),
    ]);
    if (list) setPresent(list as ChatPresent[]);
    setHidden((n as number | null) ?? 0);
  }, [supabase, roomId, loadPresentTags]);

  useEffect(() => {
    const channel = supabase
      .channel(`presenti:${roomId}`)
      // solo entrate e uscite: ogni messaggio aggiorna chat_presence, e rileggere i presenti
      // a ogni messaggio (per tutti i presenti) costerebbe molte richieste
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_presence", filter: `room_id=eq.${roomId}` }, () => loadPresence())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_presence" }, () => loadPresence())
      // cambio di sotto-tag: arriva già nella riga, senza rileggere niente
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_presence", filter: `room_id=eq.${roomId}` }, (payload) => {
        const row = payload.new as { character_id?: string; tag_id?: string | null };
        if (!row.character_id) return;
        const id = row.character_id;
        const tag = row.tag_id ?? null;
        setPresentTags((prev) => (prev[id] === tag ? prev : { ...prev, [id]: tag }));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") loadPresentTags();
      });
    // chi resta inattivo esce da solo: si ricontrolla ogni 3 minuti, a scheda visibile
    const t = setInterval(() => {
      if (document.visibilityState === "visible") loadPresence();
    }, 180_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(t);
    };
  }, [supabase, roomId, loadPresence, loadPresentTags]);

  const joined = !!me && present.some((p) => p.character_id === me.id);
  const invisible = data.invisible;
  const canWrite = !!me && (joined || invisible);

  /* ---------- Cassa comune ---------- */
  const stash = useRoomStash(roomId, me?.id ?? null);

  /* ---------- Sotto-tag ---------- */
  const [tags, setTags] = useState<RoomTag[]>([]);
  const [myTagRaw, setMyTag] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const loadTags = useCallback(async () => {
    const { data: rows } = await supabase.from("room_tags").select("id, room_id, name, position").eq("room_id", roomId).order("position").order("created_at");
    if (rows) setTags(rows as RoomTag[]);
  }, [supabase, roomId]);
  useEffect(() => {
    const channel = supabase
      .channel(`sottotag:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_tags" }, (payload) => {
        const row = (payload.new ?? payload.old) as { room_id?: string };
        if (!row.room_id || row.room_id === roomId) loadTags();
      })
      // collegato (anche dopo una caduta): si leggono i sotto-tag
      .subscribe((status) => {
        if (status === "SUBSCRIBED") loadTags();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, roomId, loadTags]);
  // il mio sotto-tag (salvato nel database): si rilegge entrando in giocata
  const meIdForTag = me?.id;
  useEffect(() => {
    if (!meIdForTag || !joined) return;
    supabase
      .from("chat_presence")
      .select("tag_id")
      .eq("room_id", roomId)
      .eq("character_id", meIdForTag)
      .maybeSingle<{ tag_id: string | null }>()
      .then(({ data: row }) => setMyTag(row?.tag_id ?? null));
  }, [supabase, roomId, meIdForTag, joined]);
  // fuori dalla giocata o sotto-tag eliminato: parte principale
  const myTag = joined && myTagRaw && tags.some((t) => t.id === myTagRaw) ? myTagRaw : null;
  async function pickTag(tag: string | null) {
    if (!me) return;
    const before = myTagRaw;
    setMyTag(tag);
    setPresentTags((prev) => ({ ...prev, [me.id]: tag }));
    const { error: e } = await supabase.rpc("chat_set_tag", { p_room: roomId, p_character: me.id, p_tag: tag });
    if (e) {
      setMyTag(before);
      setTagError(e.message);
    } else setTagError(null);
  }
  const tagName = (id: string | null | undefined) => tags.find((t) => t.id === id)?.name ?? "Principale";
  /** nome del sotto-tag di un messaggio (solo se ne ha uno che esiste ancora) */
  const msgTag = (m: Message) => (m.tag_id ? (tags.find((t) => t.id === m.tag_id)?.name ?? null) : null);
  // il mio sotto-tag va anche nell'elenco «Online» della barra laterale
  const myTagName = myTag ? (tags.find((t) => t.id === myTag)?.name ?? null) : null;
  useEffect(() => {
    setMySubTag(roomId, myTagName);
  }, [roomId, myTagName]);
  useEffect(() => () => setMySubTag(null, null), []);
  /** messaggio di un altro sotto-tag: più piccolo e sbiadito (la narrazione del master e i messaggi di sistema mai) */
  const otherTag = (m: Message) => tags.length > 0 && m.kind !== "sistema" && m.kind !== "master" && (m.tag_id ?? null) !== myTag;

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
        if (msg.kind === "combattimento") setCombatTick((n) => n + 1);
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
  // finestre dei comandi aperte (più d'una insieme)
  const [tools, setTools] = useState<Tool[]>([]);
  const toggleTool = (t: Tool) => setTools((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));
  const closeTool = (t: Tool) => setTools((list) => list.filter((x) => x !== t));
  // menu dei comandi su cellulare
  const [menu, setMenu] = useState(false);
  // blocco note: resta finché non si manda in chat
  const [note, setNote] = useState("");
  // presenti su cellulare: chiusi, si apre il nome di tutti
  const [showPresent, setShowPresent] = useState(false);
  // Fortunato del mio personaggio (ritiro del d10, una volta per periodo)
  const [lucky, setLucky] = useState(false);
  useEffect(() => {
    if (!me) return;
    supabase
      .rpc("my_trait_uses", { p_character: me.id })
      .then(({ data: u }) => setLucky(((u ?? []) as { type: string; left: number }[]).some((x) => x.type === "reroll" && x.left > 0)));
  }, [supabase, me]);
  async function reroll(m: Message, kind: "fortunato" | "sfortunato") {
    setError(null);
    const { error: e } = await supabase.rpc("roll_reroll", { p_message: m.id, p_kind: kind });
    if (e) return setError(e.message);
    if (kind === "fortunato") setLucky(false);
  }
  // chi narra può parlare come un PNG approvato
  const [npcs, setNpcs] = useState<{ id: string; name: string; role: string }[]>([]);
  const [npcId, setNpcId] = useState("");
  useEffect(() => {
    if (!canNarrate) return;
    supabase
      .from("npcs")
      .select("id, name, role")
      .eq("status", "approvato")
      .eq("active", true)
      .order("name")
      .then(({ data: rows }) => setNpcs((rows ?? []) as { id: string; name: string; role: string }[]));
  }, [supabase, canNarrate]);
  const [editing, setEditing] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);

  const others = present.filter((p) => p.character_id !== me?.id);
  const master = room.master_max !== null ? { min: room.master_min ?? 0, max: room.master_max } : null;
  const maxLen = kind === "azione" && master ? master.max : settings.max_length;
  const left = maxLen - text.length;
  // si evidenzia il mio nome (e il nome completo, se qualcuno lo scrive)
  const myNames = useMemo(() => (me && me.name.trim().length >= 2 ? [...new Set([me.name.trim(), firstName(me.name)])].filter((n) => n.length >= 2) : []), [me]);

  // Si entra in giocata col pulsante «Entra in chat» e si esce con «Esci dalla chat»
  // (documento «Chat e giocate»): niente più entrata e uscita automatiche
  const canJoin = !!me && data.canEnter && (room.is_open || canModerate) && !invisible;
  const meId = me?.id ?? null;
  // giocata in corso in un'altra chat: prima si esce da lì
  const [joinBusy, setJoinBusy] = useState<{ id: string; name: string } | null>(null);
  const busyIn = joinBusy ?? data.busyIn;
  const [leaving, setLeaving] = useState(false);

  async function enter() {
    if (!meId) return;
    setBusy(true);
    setError(null);
    const res = await joinChat(roomId, meId);
    setBusy(false);
    if (res.busyRoomId) {
      setJoinBusy({ id: res.busyRoomId, name: data.busyIn?.name ?? "un'altra chat" });
      return setError(res.error ?? null);
    }
    if (res.error) return setError(res.error);
    router.refresh();
  }

  /** Esci dalla chat: con save la giocata va nell'archivio (se non riesce si resta in chat) */
  async function exit(save: boolean) {
    if (!meId) return;
    setBusy(true);
    setError(null);
    const res = await leaveChat(roomId, meId, save);
    setBusy(false);
    if (res.error) return setError(res.error);
    setLeaving(false);
    // uscito (con o senza salvataggio): si torna alla mappa
    router.push("/mappa");
  }

  async function toggleInvisible() {
    setBusy(true);
    const res = await setInvisible(!invisible);
    setBusy(false);
    if (res.error) return setError(res.error);
    router.refresh();
  }

  /** Manda in chat il testo (della casella o del blocco note); se riesce lo svuota */
  async function send(source: string = text, clear: () => void = () => setText("")) {
    const content = source.trim();
    if (!content || !me || sending) return;
    if (kind === "azione" && master && content.length < master.min) {
      return setError(`Modalità master: l'azione deve avere almeno ${master.min} caratteri (ne ha ${content.length}).`);
    }
    // sussurro: il destinatario dev'essere uno dei presenti
    // per il sussurro basta il nome (vale anche il nome completo)
    const wanted = recipient.trim().toLowerCase();
    const whisperTo = kind === "sussurro" ? others.find((o) => o.name.toLowerCase() === wanted || firstName(o.name).toLowerCase() === wanted) : null;
    if (kind === "sussurro" && !whisperTo) {
      return setError(others.length ? "Per sussurrare scegli nel destinatario uno dei presenti." : "Non c'è nessun altro in chat a cui sussurrare.");
    }
    if (kind === "png") {
      if (!npcId) return setError("Scegli il PNG che parla.");
      setSending(true);
      setError(null);
      const { data: id, error: npcError } = await supabase.rpc("chat_npc_say", { p_room: roomId, p_character: me.id, p_npc: npcId, p_content: content });
      setSending(false);
      if (npcError) return setError(npcError.message);
      const { data: npcRow } = await supabase.from("messages").select("*").eq("id", id as number).maybeSingle<Message>();
      if (npcRow) addMessage(npcRow, true);
      clear();
      return;
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
        recipient: whisperTo ? firstName(whisperTo.name) : recipient.trim() || null,
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
    clear();
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
    if (!window.confirm(`Eliminare questo messaggio di ${firstName(m.character_name)}?`)) return;
    const res = await deleteMessage(m.id);
    if (res.error) return setError(res.error);
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
  }

  // Ritratti: si leggono una volta per ogni personaggio che compare
  const missing = useMemo(() => [...new Set(messages.filter((m) => m.kind === "azione").map((m) => m.character_id))].filter((id) => !(id in avatars)), [messages, avatars]);
  useEffect(() => {
    if (!missing.length) return;
    let alive = true;
    supabase
      .from("characters")
      .select("id, avatar_url")
      .in("id", missing)
      .then(({ data: rows }) => {
        if (!alive) return;
        const found = Object.fromEntries(((rows ?? []) as { id: string; avatar_url: string | null }[]).map((r) => [r.id, r.avatar_url]));
        setAvatars((prev) => ({ ...prev, ...Object.fromEntries(missing.map((id) => [id, found[id] ?? null])) }));
      });
    return () => {
      alive = false;
    };
  }, [supabase, missing]);

  const missingNpc = useMemo(() => [...new Set(messages.filter((m) => m.kind === "png" && m.npc_id).map((m) => m.npc_id as string))].filter((id) => !(id in npcAvatars)), [messages, npcAvatars]);
  useEffect(() => {
    if (!missingNpc.length) return;
    let alive = true;
    supabase
      .from("npcs")
      .select("id, avatar_url")
      .in("id", missingNpc)
      .then(({ data: rows }) => {
        if (!alive) return;
        const found = Object.fromEntries(((rows ?? []) as { id: string; avatar_url: string | null }[]).map((r) => [r.id, r.avatar_url]));
        setNpcAvatars((prev) => ({ ...prev, ...Object.fromEntries(missingNpc.map((id) => [id, found[id] ?? null])) }));
      });
    return () => {
      alive = false;
    };
  }, [supabase, missingNpc]);

  async function openLook(m: Message) {
    const { data: c } = await supabase.from("characters").select("name, avatar_url, appearance").eq("id", m.character_id).maybeSingle<{ name: string; avatar_url: string | null; appearance: string | null }>();
    setLook({ name: c?.name ?? m.character_name, avatar: c?.avatar_url ?? null, appearance: c?.appearance ?? null });
  }

  // alla mappa senza riaprire il riquadro del quartiere
  const back = "/mappa";
  const blurred = !joined && !invisible;
  // «Salva»: i messaggi da quando sono entrato in chat (l'ultimo «è entrato in chat» mio)
  const myEntry = me ? messages.findLastIndex((m) => m.character_id === me.id && m.kind === "sistema" && m.content === "è entrato in chat.") : -1;
  const sinceJoin = myEntry >= 0 ? messages.slice(myEntry) : messages;
  // per salvare la chat servono almeno 3 mie azioni
  const myActions = me ? messages.filter((m) => m.character_id === me.id && m.kind === "azione").length : 0;

  // i comandi della chat, nello stesso ordine nella barra e nel menu del cellulare
  const commands: { id: Tool; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: "note", label: "Blocco note", icon: <NotebookPen />, show: true },
    { id: "dadi", label: "Dadi", icon: <Dices />, show: canDice },
    { id: "scontro", label: "Combattimento", icon: <Swords />, show: true },
    { id: "incidente", label: "Incidente", icon: <Bandage />, show: true },
    { id: "oggetti", label: "Oggetti", icon: <Package />, show: true },
    // la cassa compare quando c'è dentro qualcosa (lo staff la vede sempre per riempirla)
    { id: "cassa", label: "Cassa comune", icon: <Archive />, show: canStash || stash.rows.length > 0 },
    { id: "salva", label: "Salva chat", icon: <Save />, show: true },
    { id: "master", label: "Master", icon: <Crown />, show: canNarrate || canModerate },
    { id: "impostazioni", label: "Impostazioni", icon: <SlidersHorizontal />, show: true },
  ];

  return (
    <div className="fixed inset-x-0 bottom-0 top-[calc(5rem+env(safe-area-inset-top))] z-10 p-[10px] lg:top-24 lg:left-72">
    <div className="glass flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
      {/* Intestazione */}
      <header className={cn("relative shrink-0 overflow-hidden bg-gradient-to-r px-3 py-1.5 sm:px-5", room.district.gradient)}>
        <div className="absolute inset-0 bg-night/35" />
        <div className="relative flex items-center gap-3">
          <Link href={back} className="rounded-full p-1.5 text-white/90 hover:bg-white/15" aria-label="Torna alla mappa">
            <ArrowLeft className="size-5" />
          </Link>
          {/* solo il nome della chat */}
          <h1 className="min-w-0 truncate font-heading text-xl leading-none tracking-wide text-white">{room.name}</h1>
          <SafetyLight safety={room.safety} size="md" />
          <span className="flex-1" />
          {canInvisible && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={toggleInvisible} className="rounded-full text-white hover:bg-white/15" title="Staff: leggi e scrivi senza comparire tra i presenti">
              {invisible ? <EyeOff /> : <Eye />}
              <span className="hidden sm:inline">{invisible ? "Invisibile" : "Visibile"}</span>
            </Button>
          )}
        </div>
      </header>

      <LookWindow person={look} onClose={() => setLook(null)} />

      {room.access === "su_invito" && (
        <RoomAccessBar roomId={roomId} ownerName={ownerName} guests={data.guests} canManage={isOwner || canModerate} onChanged={() => router.refresh()} />
      )}

      {/* Presenti */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 text-sm sm:px-6 sm:py-2">
        <button
          type="button"
          onClick={() => setShowPresent((v) => !v)}
          className="flex items-center gap-1.5 text-xs sm:pointer-events-none"
          aria-expanded={showPresent}
        >
          <Users className="size-4 shrink-0 text-mint" />
          <span className="sm:hidden">{present.length === 0 ? "Nessuno in giocata" : `${present.length} in giocata`}</span>
          {present.length > 0 && <ChevronDown className={cn("size-3.5 transition-transform sm:hidden", showPresent && "rotate-180")} />}
        </button>
        {present.length === 0 ? (
          <span className="hidden text-muted-foreground sm:inline">Nessuno in giocata.</span>
        ) : (
          present.map((p) => (
            <span
              key={p.character_id}
              className={cn("rounded-full px-2.5 py-0.5 text-xs", showPresent ? "inline" : "hidden sm:inline", p.character_id === me?.id ? "bg-flamingo/25 text-white" : "bg-white/10")}
            >
              {firstName(p.name)}
              {/* il sotto-tag in cui si trova (solo se ne ha scelto uno) */}
              {presentTags[p.character_id] && tags.some((t) => t.id === presentTags[p.character_id]) && (
                <span className="ml-1 text-[0.65rem] text-peach">· {tagName(presentTags[p.character_id])}</span>
              )}
            </span>
          ))
        )}
        {joined && (
          <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => setLeaving(true)} className="ml-auto rounded-full border border-white/15">
            <LogOut /> Esci dalla chat
          </Button>
        )}
      </div>
      {/* uscita dalla giocata: finestra al centro dello schermo, sopra a tutto */}
      {leaving &&
        createPortal(
          <div className="fixed inset-0 z-[2147482000] grid place-items-center bg-night/60 p-4 backdrop-blur-sm">
            <div role="dialog" aria-modal="true" aria-labelledby="esci-titolo" className="glass flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-4 rounded-2xl p-5 shadow-2xl">
              <div className="flex flex-col gap-1 text-center">
                <LogOut className="mx-auto size-7 text-peach" />
                <h2 id="esci-titolo" className="font-heading text-2xl tracking-wide text-peach">
                  Esci dalla chat
                </h2>
                <p className="text-sm text-muted-foreground">Vuoi salvare la giocata prima di uscire? Finisce in Utility → Archivio giocate e la vedi solo tu.</p>
              </div>
              {error && <p className="rounded-lg bg-destructive/15 px-3 py-2 text-center text-sm text-destructive">{error}</p>}
              <div className="flex flex-col gap-2">
                <Button type="button" disabled={busy} onClick={() => exit(true)} className="rounded-full">
                  <Save /> Sì, salva ed esci
                </Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => exit(false)} className="rounded-full">
                  <LogOut /> No, esci senza salvare
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => (setLeaving(false), setError(null))} className="rounded-full">
                  Resta in chat
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {!blurred && (
        <ChatTagsBar roomId={roomId} tags={tags} current={myTag} canPick={joined} canManage={canTags} onPick={pickTag} onChanged={loadTags} onError={setTagError} />
      )}
      {tagError && <p className="shrink-0 border-b border-border px-4 py-1 text-xs text-destructive sm:px-6">{tagError}</p>}

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
          className="flex h-full flex-col gap-2 overflow-y-auto px-2 py-3 sm:gap-3 sm:px-6 sm:py-4"
        >
          {blurred ? (
            <div className="flex flex-col gap-4">
              {hidden > 0 && <BlurredRows count={hidden} />}
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-white/10 bg-night/50 px-5 py-6 text-center">
                <p className="font-heading text-xl tracking-wide text-peach">Non fai ancora parte della giocata</p>
                <p className="text-sm text-muted-foreground">
                  {hidden > 0 ? `In questa chat ci sono ${hidden} messaggi recenti: entrando li leggi.` : "La chat è tranquilla: entrando inizi tu la scena."}
                </p>
                {!room.is_open && <p className="text-sm text-muted-foreground">Questa chat è chiusa dallo staff.</p>}
                {busyIn && busyIn.id !== roomId ? (
                  <p className="text-sm text-peach">
                    Hai una giocata in corso in{" "}
                    <Link href={`/chat/${busyIn.id}`} className="font-semibold underline hover:text-flamingo">
                      {busyIn.name}
                    </Link>
                    : prima vai lì e premi «Esci dalla chat».
                  </p>
                ) : (
                  canJoin && (
                    <Button type="button" disabled={busy} onClick={enter} className="rounded-full">
                      <LogIn /> Entra in chat
                    </Button>
                  )
                )}
                {error && !busyIn && <p className="text-sm text-destructive">{error}</p>}
              </div>
            </div>
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nessun messaggio recente. Inizia tu la scena.</p>
          ) : (
            messages.map((m) =>
              editing?.id === m.id ? (
                <EditBox key={m.id} message={m} maxLength={m.kind === "azione" && master ? master.max : settings.max_length} onDone={(t) => saveEdit(m, t)} />
              ) : otherTag(m) ? (
                <div key={m.id} className="opacity-45 transition-opacity [zoom:0.85] hover:opacity-80" title={`Sotto-tag: ${tagName(m.tag_id)}`}>
                  <MessageRow
                    message={m}
                    myNames={myNames}
                    mine={m.character_id === me?.id && m.kind !== "sistema"}
                    canModerate={canModerate}
                    now={now}
                    onEdit={setEditing}
                    onDelete={remove}
                    avatar={m.kind === "png" ? (npcAvatars[m.npc_id ?? ""] ?? null) : (avatars[m.character_id] ?? null)}
                    onLook={openLook}
                    canSeeRolls={canNarrate || canCombat}
                    rerolls={[]}
                    onReroll={reroll}
                    subTag={msgTag(m)}
                  />
                </div>
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
                  avatar={m.kind === "png" ? (npcAvatars[m.npc_id ?? ""] ?? null) : (avatars[m.character_id] ?? null)}
                  onLook={openLook}
                  canSeeRolls={canNarrate || canCombat}
                  rerolls={
                    m.kind === "dado" && !m.roll_data?.reroll && now - Date.parse(m.created_at) < 15 * 60_000
                      ? [...(m.character_id === me?.id && lucky ? (["fortunato"] as const) : []), ...(canNarrate && m.character_id !== me?.id ? (["sfortunato"] as const) : [])]
                      : []
                  }
                  onReroll={reroll}
                  subTag={msgTag(m)}
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
          className="flex shrink-0 flex-col gap-2 border-t border-border p-2 sm:p-4"
        >
          <CombatPanel
            roomId={roomId}
            me={me}
            present={present}
            isMaster={canNarrate || canCombat}
            tick={combatTick}
            open={tools.includes("scontro")}
            onOpen={() => toggleTool("scontro")}
            onClose={() => closeTool("scontro")}
            onError={setError}
          />
          {tools.includes("dadi") && (
            <ChatToolWindow title="Tiro Interlock" icon={<Dices className="size-5" />} width={460} onClose={() => closeTool("dadi")}>
              <DicePanel roomId={roomId} characterId={me.id} attributes={attributes} skills={skills} onClose={() => closeTool("dadi")} onError={setError} />
            </ChatToolWindow>
          )}
          {tools.includes("incidente") && (
            <ChatToolWindow title="Incidente" icon={<Bandage className="size-5" />} tone="text-flamingo" width={480} onClose={() => closeTool("incidente")}>
              <IncidentPanel roomId={roomId} me={me} present={present} isMaster={canNarrate || canCombat} onDone={() => closeTool("incidente")} onError={setError} />
            </ChatToolWindow>
          )}
          {tools.includes("oggetti") && (
            <ChatToolWindow title="Oggetti" icon={<Package className="size-5" />} onClose={() => closeTool("oggetti")}>
              <ItemsPanel roomId={roomId} characterId={me.id} others={others} onError={setError} />
            </ChatToolWindow>
          )}
          {tools.includes("cassa") && (
            <ChatToolWindow title="Cassa comune" icon={<Archive className="size-5" />} width={520} onClose={() => closeTool("cassa")}>
              <StashPanel roomId={roomId} characterId={me.id} rows={stash.rows} canManage={canStash} joined={joined} onChanged={stash.reload} onError={setError} />
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </ChatToolWindow>
          )}
          {tools.includes("master") && (
            <ChatToolWindow title="Modalità master" icon={<Crown className="size-5" />} tone="text-orchid" onClose={() => closeTool("master")}>
              <MasterPanel roomId={roomId} characterId={me.id} active={master} onClose={() => closeTool("master")} onError={setError} />
            </ChatToolWindow>
          )}
          {tools.includes("note") && (
            <ChatToolWindow title="Blocco note" icon={<NotebookPen className="size-5" />} width={520} onClose={() => closeTool("note")}>
              <NotepadPanel value={note} onChange={setNote} sending={sending} maxLength={maxLen} kind={kind} onSend={() => send(note, () => setNote(""))} />
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </ChatToolWindow>
          )}
          {tools.includes("impostazioni") && (
            <ChatToolWindow title="Impostazioni della chat" icon={<SlidersHorizontal className="size-5" />} width={560} onClose={() => closeTool("impostazioni")}>
              <ChatPrefsPanel />
            </ChatToolWindow>
          )}
          {tools.includes("salva") && (
            <ChatToolWindow title="Salva chat" icon={<Save className="size-5" />} onClose={() => closeTool("salva")}>
              <SaveChatPanel roomName={room.name} messages={sinceJoin} myActions={myActions} />
            </ChatToolWindow>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-1.5 text-xs sm:flex-wrap sm:gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as MessageKind)}
              aria-label="Tipo di messaggio"
              className="h-8 max-w-28 shrink-0 rounded-lg border border-input bg-night/40 px-1.5 outline-none focus-visible:border-ring sm:max-w-none sm:px-2"
            >
              <option value="azione">{KIND_LABEL.azione}</option>
              <option value="fuori_gioco">{KIND_LABEL.fuori_gioco}</option>
              <option value="sussurro">{KIND_LABEL.sussurro}</option>
              {canNarrate && <option value="master">{KIND_LABEL.master}</option>}
              {canNarrate && npcs.length > 0 && <option value="png">{KIND_LABEL.png}</option>}
            </select>
            {kind === "png" ? (
              <select
                value={npcId}
                onChange={(e) => setNpcId(e.target.value)}
                aria-label="PNG che parla"
                className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-night/40 px-2 outline-none focus-visible:border-ring sm:max-w-56"
              >
                <option value="">Quale PNG parla?</option>
                {npcs.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                    {n.role ? ` · ${n.role}` : ""}
                  </option>
                ))}
              </select>
            ) : (
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              list={`dest-${roomId}`}
              maxLength={60}
              placeholder={kind === "sussurro" ? "A chi sussurri? (il nome)" : "Destinatario (facoltativo)"}
              aria-label="Destinatario"
              className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-night/40 px-2 outline-none focus-visible:border-ring sm:max-w-56"
            />
            )}
            <datalist id={`dest-${roomId}`}>
              {others.map((o) => (
                <option key={o.character_id} value={firstName(o.name)} />
              ))}
            </datalist>
            {/* computer: i comandi in fila (il nome per esteso sugli schermi larghi) */}
            <span className="ml-auto hidden gap-0.5 sm:flex">
              {commands
                .filter((c) => c.show)
                .map((c) => (
                  <Button
                    key={c.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleTool(c.id)}
                    className={cn("rounded-full", tools.includes(c.id) && "bg-white/10 text-peach", c.id === "cassa" && stash.rows.length > 0 && "text-peach")}
                    aria-pressed={tools.includes(c.id)}
                    title={c.label}
                    aria-label={c.label}
                  >
                    {c.icon}
                    <span className="hidden 2xl:inline">{c.label}</span>
                  </Button>
                ))}
            </span>
            {/* cellulare: i comandi raggruppati in un menu */}
            <span className="relative ml-auto shrink-0 sm:hidden">
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setMenu((v) => !v)} className="rounded-full border border-white/15" aria-expanded={menu} aria-label="Comandi della chat">
                <LayoutGrid />
              </Button>
              {menu && (
                <span className="absolute right-0 bottom-full z-30 mb-2 flex w-52 flex-col overflow-hidden rounded-2xl border border-white/15 bg-night/95 p-1 shadow-2xl backdrop-blur">
                  {commands
                    .filter((c) => c.show)
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setMenu(false);
                          toggleTool(c.id);
                        }}
                        className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/10 [&_svg]:size-4 [&_svg]:text-peach", tools.includes(c.id) && "bg-white/10")}
                      >
                        {c.icon}
                        {c.label}
                      </button>
                    ))}
                </span>
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
              rows={2}
              placeholder={
                kind === "fuori_gioco" ? "Scrivi fuori dal gioco…" : kind === "master" ? "Narra la scena…" : kind === "png" ? "Cosa dice o fa il PNG?" : "Cosa fa il tuo personaggio? Il parlato va tra < > o «», i pensieri tra [ ]…"
              }
              className="min-h-0 flex-1 resize-none rounded-xl border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring sm:min-h-20"
            />
            <Button type="submit" size="icon-lg" disabled={sending || !text.trim()} className="h-auto self-stretch px-3 sm:px-4" aria-label="Invia">
              <SendHorizontal />
            </Button>
          </div>
          <p className={cn("text-right text-[0.7rem] sm:text-xs", left < 50 ? "text-peach" : "text-muted-foreground")}>
            <span className="hidden sm:inline">Invio per mandare, Maiusc+Invio per andare a capo · </span>
            {left} caratteri
          </p>
        </form>
      ) : null}
    </div>
    </div>
  );
}
