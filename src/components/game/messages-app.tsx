"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCheck, LogOut, Megaphone, Plus, SendHorizontal, Trash2, UserMinus, UserPlus, Users, X } from "lucide-react";
import { CharacterAvatar } from "@/components/game/character-avatar";
import { Button } from "@/components/ui/button";
import { formatTime, initials } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { useResync } from "@/lib/use-resync";
import { useStickToBottom } from "@/lib/use-stick-bottom";
import type { Channel, PrivateMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

// Messaggi ON e OFF (dal Westeros: OffMessages.tsx), usati due volte: un canale
// per volta. Conversazioni a due, gruppi, messaggi a tutti e (solo OFF) SISTEMA.
// Tutto in tempo reale. Spunte: ✓ inviato, ✓✓ letto.

export type Contact = { id: string; name: string; avatar: string | null };

type Group = { id: string; name: string; created_by: string | null };
type Member = { group_id: string; user_id: string; last_read_at: string };
type GroupMsg = { id: number; group_id: string; sender_id: string; body: string; created_at: string };
type Broadcast = { id: number; sender_id: string | null; body: string; created_at: string };
type SystemMsg = { id: number; body: string; created_at: string; read_at: string | null };

type Conversation = {
  key: string; // "dm:<utente>", "group:<id>", "global", "system"
  name: string;
  avatar?: string | null;
  kind: "dm" | "group" | "global" | "system";
  lastBody?: string;
  lastAt?: string;
  unread: number;
};

type Bubble = { id: string; mine: boolean; author: string; avatar: string | null; body: string; at: string; status?: "sent" | "read"; system?: boolean };

const LABEL: Record<Channel, string> = { on: "Messaggi ON", off: "Messaggi OFF" };

function listTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? formatTime(iso)
    : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" });
}

export function MessagesApp({
  channel,
  me,
  initialTo,
  canBroadcast,
}: {
  channel: Channel;
  me: Contact;
  initialTo: Contact | null;
  canBroadcast: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [dms, setDms] = useState<PrivateMessage[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [groupMsgs, setGroupMsgs] = useState<GroupMsg[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [broadcastRead, setBroadcastRead] = useState<string | null>(null);
  const [systemMsgs, setSystemMsgs] = useState<SystemMsg[]>([]);
  const [hidden, setHidden] = useState<Record<string, string>>({});
  const [people, setPeople] = useState<Record<string, Contact>>(() => ({ [me.id]: me, ...(initialTo ? { [initialTo.id]: initialTo } : {}) }));
  const [extra, setExtra] = useState<string[]>(initialTo ? [initialTo.id] : []);
  const [active, setActive] = useState<string | null>(initialTo ? `dm:${initialTo.id}` : null);
  const [panel, setPanel] = useState<"none" | "new-group" | "members">("none");

  // Nomi e ritratti delle persone che compaiono (nome del personaggio, se approvato)
  const peopleRef = useRef(people);
  useEffect(() => {
    peopleRef.current = people;
  }, [people]);
  const learn = useCallback(
    async (ids: (string | null)[]) => {
      const missing = [...new Set(ids.filter((id): id is string => !!id && !peopleRef.current[id]))];
      if (missing.length === 0) return;
      const { data } = await supabase.rpc("player_cards", { p_users: missing });
      const rows = (data ?? []) as { user_id: string; name: string; avatar_url: string | null }[];
      setPeople((prev) => ({ ...prev, ...Object.fromEntries(rows.map((r) => [r.user_id, { id: r.user_id, name: r.name, avatar: r.avatar_url }])) }));
    },
    [supabase],
  );

  // ----- caricamento -----
  const loadDms = useCallback(async () => {
    const { data } = await supabase
      .from("private_messages")
      .select("*")
      .eq("kind", channel)
      .order("created_at", { ascending: false })
      .limit(1000);
    const rows = ((data ?? []) as PrivateMessage[]).reverse();
    setDms(rows);
    learn(rows.flatMap((m) => [m.sender_id, m.recipient_id]));
  }, [supabase, channel, learn]);

  const loadGroups = useCallback(async () => {
    const { data: g } = await supabase.from("off_groups").select("id, name, created_by").eq("channel", channel);
    const list = (g ?? []) as Group[];
    const ids = list.map((x) => x.id);
    setGroups(list);
    if (ids.length === 0) {
      setMembers([]);
      setGroupMsgs([]);
      return;
    }
    const [{ data: m }, { data: msgs }] = await Promise.all([
      supabase.from("off_group_members").select("group_id, user_id, last_read_at").in("group_id", ids),
      supabase.from("off_group_messages").select("id, group_id, sender_id, body, created_at").in("group_id", ids).order("created_at", { ascending: false }).limit(1000),
    ]);
    const mem = (m ?? []) as Member[];
    const gm = ((msgs ?? []) as GroupMsg[]).reverse();
    setMembers(mem);
    setGroupMsgs(gm);
    learn([...mem.map((x) => x.user_id), ...gm.map((x) => x.sender_id)]);
  }, [supabase, channel, learn]);

  const loadBroadcasts = useCallback(async () => {
    const [{ data: b }, { data: r }] = await Promise.all([
      supabase.from("off_broadcasts").select("id, sender_id, body, created_at").eq("channel", channel).order("created_at", { ascending: false }).limit(200),
      supabase.from("off_broadcast_reads").select("last_read_at").eq("channel", channel).maybeSingle<{ last_read_at: string }>(),
    ]);
    const list = ((b ?? []) as Broadcast[]).reverse();
    setBroadcasts(list);
    setBroadcastRead(r?.last_read_at ?? null);
    learn(list.map((x) => x.sender_id));
  }, [supabase, channel, learn]);

  const loadSystem = useCallback(async () => {
    if (channel !== "off") return;
    const { data } = await supabase.from("system_messages").select("id, body, created_at, read_at").order("created_at", { ascending: false }).limit(200);
    setSystemMsgs(((data ?? []) as SystemMsg[]).reverse());
  }, [supabase, channel]);

  const loadAll = useCallback(() => {
    loadDms();
    loadGroups();
    loadBroadcasts();
    loadSystem();
    supabase
      .from("off_hidden")
      .select("conv_key, hidden_at")
      .eq("channel", channel)
      .then(({ data }) => setHidden(Object.fromEntries(((data ?? []) as { conv_key: string; hidden_at: string }[]).map((h) => [h.conv_key, h.hidden_at]))));
  }, [supabase, channel, loadDms, loadGroups, loadBroadcasts, loadSystem]);

  useEffect(() => {
    const t = setTimeout(loadAll, 0);
    return () => clearTimeout(t);
  }, [loadAll]);
  useResync(loadAll);

  // ----- tempo reale -----
  useEffect(() => {
    const ch = supabase
      .channel(`messaggi-${channel}:${me.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "private_messages", filter: `recipient_id=eq.${me.id}` }, (p) => {
        const row = p.new as PrivateMessage;
        if (row.kind !== channel) return;
        learn([row.sender_id]);
        setDms((prev) => (prev?.some((m) => m.id === row.id) ? prev : [...(prev ?? []), row]));
      })
      // l'altro ha letto un mio messaggio: ✓✓
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "private_messages", filter: `sender_id=eq.${me.id}` }, (p) => {
        const row = p.new as PrivateMessage;
        setDms((prev) => prev?.map((m) => (m.id === row.id ? { ...m, read_at: row.read_at } : m)) ?? prev);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "off_group_messages" }, (p) => {
        const row = p.new as GroupMsg;
        learn([row.sender_id]);
        setGroupMsgs((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
      })
      // aggiunto o tolto da un gruppo, membri cambiati
      .on("postgres_changes", { event: "*", schema: "public", table: "off_group_members" }, () => loadGroups())
      .on("postgres_changes", { event: "*", schema: "public", table: "off_broadcasts" }, () => loadBroadcasts())
      .on("postgres_changes", { event: "*", schema: "public", table: "system_messages", filter: `user_id=eq.${me.id}` }, () => loadSystem())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, channel, me.id, learn, loadGroups, loadBroadcasts, loadSystem]);

  // ----- conversazioni (senza i messaggi di quelle tolte dall'elenco) -----
  const shownDms = useMemo(
    () =>
      (dms ?? []).filter((m) => {
        const other = m.sender_id === me.id ? m.recipient_id : m.sender_id;
        const until = hidden[`dm:${other}`];
        return !until || m.created_at > until;
      }),
    [dms, hidden, me.id],
  );
  const shownBroadcasts = useMemo(() => broadcasts.filter((b) => !hidden.global || b.created_at > hidden.global), [broadcasts, hidden]);

  const conversations = useMemo(() => {
    const out: Conversation[] = [];
    if (channel === "off" && systemMsgs.length > 0) {
      const last = systemMsgs.at(-1);
      out.push({ key: "system", name: "SISTEMA", kind: "system", lastBody: last?.body, lastAt: last?.created_at, unread: systemMsgs.filter((m) => !m.read_at).length });
    }
    if (shownBroadcasts.length > 0 || canBroadcast) {
      const last = shownBroadcasts.at(-1);
      out.push({
        key: "global",
        name: "Messaggi a tutti",
        kind: "global",
        lastBody: last?.body,
        lastAt: last?.created_at,
        unread: shownBroadcasts.filter((b) => b.sender_id !== me.id && broadcastRead !== null && b.created_at > broadcastRead).length,
      });
    }
    for (const g of groups) {
      const msgs = groupMsgs.filter((m) => m.group_id === g.id);
      const myRead = members.find((m) => m.group_id === g.id && m.user_id === me.id)?.last_read_at ?? "";
      const last = msgs.at(-1);
      out.push({
        key: `group:${g.id}`,
        name: g.name,
        kind: "group",
        lastBody: last ? `${last.sender_id === me.id ? "Tu" : (people[last.sender_id]?.name ?? "…")}: ${last.body}` : "Gruppo creato",
        lastAt: last?.created_at,
        unread: msgs.filter((m) => m.sender_id !== me.id && m.created_at > myRead).length,
      });
    }
    const byPerson = new Map<string, Conversation>();
    for (const id of extra) {
      const c = people[id];
      if (c) byPerson.set(id, { key: `dm:${id}`, name: c.name, avatar: c.avatar, kind: "dm", unread: 0 });
    }
    for (const m of shownDms) {
      const mine = m.sender_id === me.id;
      const otherId = mine ? m.recipient_id : m.sender_id;
      const other = people[otherId];
      const entry = byPerson.get(otherId) ?? { key: `dm:${otherId}`, name: other?.name ?? "…", avatar: other?.avatar, kind: "dm" as const, unread: 0 };
      entry.name = other?.name ?? entry.name;
      entry.avatar = other?.avatar ?? entry.avatar;
      entry.lastBody = (mine ? "Tu: " : "") + m.body;
      entry.lastAt = m.created_at;
      if (!mine && !m.read_at) entry.unread++;
      byPerson.set(otherId, entry);
    }
    out.push(...byPerson.values());
    // le più recenti in alto; SISTEMA e messaggi a tutti restano primi
    const pinned = (c: Conversation) => (c.kind === "system" ? 0 : c.kind === "global" ? 1 : 2);
    return out.sort((a, b) => pinned(a) - pinned(b) || (b.lastAt ?? "9").localeCompare(a.lastAt ?? "9"));
  }, [channel, systemMsgs, shownBroadcasts, broadcastRead, canBroadcast, groups, groupMsgs, members, shownDms, extra, people, me.id]);

  const current = conversations.find((c) => c.key === active) ?? null;
  const activeGroup = current?.kind === "group" ? (groups.find((g) => `group:${g.id}` === active) ?? null) : null;
  const groupMembers = activeGroup ? members.filter((m) => m.group_id === activeGroup.id) : [];
  const dmId = current?.kind === "dm" ? current.key.slice(3) : null;

  // ----- segna come letta la conversazione aperta -----
  const unreadHere = current?.unread ?? 0;
  const marking = useRef("");
  useEffect(() => {
    if (!current || unreadHere === 0) return;
    const mark = `${current.key}:${current.lastAt}`;
    if (marking.current === mark) return;
    marking.current = mark;
    const now = new Date().toISOString();
    if (current.kind === "dm" && dmId) {
      supabase
        .from("private_messages")
        .update({ read_at: now })
        .eq("kind", channel)
        .eq("recipient_id", me.id)
        .eq("sender_id", dmId)
        .is("read_at", null)
        .then(() => setDms((prev) => prev?.map((m) => (m.sender_id === dmId && m.recipient_id === me.id && !m.read_at ? { ...m, read_at: now } : m)) ?? prev));
    } else if (current.kind === "group" && activeGroup) {
      const last = groupMsgs.filter((m) => m.group_id === activeGroup.id).at(-1)?.created_at;
      if (!last) return;
      supabase
        .from("off_group_members")
        .update({ last_read_at: last })
        .eq("group_id", activeGroup.id)
        .eq("user_id", me.id)
        .then(() => setMembers((prev) => prev.map((m) => (m.group_id === activeGroup.id && m.user_id === me.id ? { ...m, last_read_at: last } : m))));
    } else if (current.kind === "global") {
      const last = broadcasts.at(-1)?.created_at;
      if (!last) return;
      supabase
        .from("off_broadcast_reads")
        .upsert({ user_id: me.id, channel, last_read_at: last })
        .then(() => setBroadcastRead(last));
    } else if (current.kind === "system") {
      supabase
        .from("system_messages")
        .update({ read_at: now })
        .is("read_at", null)
        .then(() => setSystemMsgs((prev) => prev.map((m) => (m.read_at ? m : { ...m, read_at: now }))));
    }
  }, [supabase, channel, current, unreadHere, dmId, activeGroup, groupMsgs, broadcasts, me.id]);

  // ----- messaggi della conversazione aperta -----
  const currentKey = current?.key ?? null;
  const currentKind = current?.kind ?? null;
  const bubbles: Bubble[] = useMemo(() => {
    if (!currentKey) return [];
    const who = (id: string | null) => (id ? people[id] : undefined);
    if (currentKind === "dm")
      return shownDms
        .filter((m) => (m.sender_id === dmId && m.recipient_id === me.id) || (m.sender_id === me.id && m.recipient_id === dmId))
        .map((m) => ({
          id: `d${m.id}`,
          mine: m.sender_id === me.id,
          author: who(m.sender_id)?.name ?? "…",
          avatar: who(m.sender_id)?.avatar ?? null,
          body: m.body,
          at: m.created_at,
          status: m.read_at ? ("read" as const) : ("sent" as const),
        }));
    if (currentKind === "group")
      return groupMsgs
        .filter((m) => `group:${m.group_id}` === currentKey)
        .map((m) => ({ id: `g${m.id}`, mine: m.sender_id === me.id, author: who(m.sender_id)?.name ?? "…", avatar: who(m.sender_id)?.avatar ?? null, body: m.body, at: m.created_at }));
    if (currentKind === "system")
      return systemMsgs.map((m) => ({ id: `s${m.id}`, mine: false, author: "SISTEMA", avatar: null, system: true, body: m.body, at: m.created_at }));
    return shownBroadcasts.map((b) => ({
      id: `b${b.id}`,
      mine: b.sender_id === me.id,
      author: who(b.sender_id)?.name ?? "Staff",
      avatar: who(b.sender_id)?.avatar ?? null,
      body: b.body,
      at: b.created_at,
    }));
  }, [currentKey, currentKind, shownDms, dmId, groupMsgs, shownBroadcasts, systemMsgs, people, me.id]);

  // ----- azioni -----
  async function send(body: string): Promise<string | null> {
    if (!current) return "Nessuna conversazione.";
    if (current.kind === "dm" && dmId) {
      const { data, error } = await supabase.from("private_messages").insert({ kind: channel, recipient_id: dmId, body }).select("*").single<PrivateMessage>();
      if (error || !data)
        return error?.code === "42501"
          ? channel === "on"
            ? "Nei messaggi ON servono personaggi approvati, sia tuo sia di chi riceve."
            : "Non puoi scrivere a questa persona."
          : "Invio non riuscito.";
      setDms((prev) => [...(prev ?? []), data]);
    } else if (current.kind === "group" && activeGroup) {
      const { data, error } = await supabase.from("off_group_messages").insert({ group_id: activeGroup.id, body }).select("id, group_id, sender_id, body, created_at").single<GroupMsg>();
      if (error || !data) return "Invio non riuscito.";
      setGroupMsgs((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
    } else if (current.kind === "global") {
      const { error } = await supabase.from("off_broadcasts").insert({ channel, body });
      if (error) return "Invio non riuscito.";
      loadBroadcasts();
    }
    return null;
  }

  async function findPlayer(raw: string): Promise<Contact | string> {
    const name = raw.trim();
    if (name.length < 3) return "Scrivi il nome e cognome.";
    const { data } = await supabase.rpc("find_player", { p_name: name });
    const row = ((data ?? []) as { user_id: string; name: string; avatar_url: string | null; has_character: boolean }[])[0];
    if (!row) return `Nessuno si chiama «${name}».`;
    if (channel === "on" && !row.has_character) return `${row.name} non ha ancora un personaggio approvato: scrivigli nei messaggi OFF.`;
    const c = { id: row.user_id, name: row.name, avatar: row.avatar_url };
    setPeople((prev) => ({ ...prev, [c.id]: c }));
    return c;
  }

  async function openByName(raw: string) {
    const c = await findPlayer(raw);
    if (typeof c === "string") return c;
    if (c.id === me.id) return "Non puoi scrivere a te stesso.";
    setExtra((prev) => (prev.includes(c.id) ? prev : [...prev, c.id]));
    setActive(`dm:${c.id}`);
    setPanel("none");
    return null;
  }

  async function createGroup(name: string, memberNames: string[]) {
    const ids: string[] = [];
    for (const n of memberNames) {
      const c = await findPlayer(n);
      if (typeof c === "string") return c;
      if (c.id !== me.id) ids.push(c.id);
    }
    if (ids.length === 0) return "Aggiungi almeno un'altra persona.";
    const { data, error } = await supabase.rpc("create_off_group", { p_channel: channel, p_name: name, p_members: ids });
    if (error) return error.message;
    await loadGroups();
    setActive(`group:${data as string}`);
    setPanel("none");
    return null;
  }

  async function addMember(raw: string) {
    if (!activeGroup) return null;
    const c = await findPlayer(raw);
    if (typeof c === "string") return c;
    const { error } = await supabase.rpc("add_off_group_member", { p_group: activeGroup.id, p_user: c.id });
    if (error) return error.message;
    loadGroups();
    return null;
  }

  async function removeMember(userId: string) {
    if (!activeGroup) return;
    const leaving = userId === me.id;
    if (!window.confirm(leaving ? `Uscire dal gruppo «${activeGroup.name}»?` : `Togliere ${people[userId]?.name ?? "questa persona"} dal gruppo?`)) return;
    await supabase.rpc("remove_off_group_member", { p_group: activeGroup.id, p_user: userId });
    if (leaving) {
      setActive(null);
      setPanel("none");
    }
    loadGroups();
  }

  async function leaveGroup(groupId: string, name: string) {
    if (!window.confirm(`Uscire dal gruppo «${name}»? Non riceverai più i suoi messaggi.`)) return;
    await supabase.rpc("remove_off_group_member", { p_group: groupId, p_user: me.id });
    if (active === `group:${groupId}`) setActive(null);
    loadGroups();
  }

  async function deleteGroup(groupId: string, name: string) {
    if (!window.confirm(`Eliminare il gruppo «${name}» per tutti, con tutti i suoi messaggi?`)) return;
    await supabase.rpc("delete_off_group", { p_group: groupId });
    if (active === `group:${groupId}`) setActive(null);
    loadGroups();
  }

  // Toglie la conversazione dal mio elenco (l'altro la conserva). Il segno è l'ora
  // dell'ultimo messaggio: i messaggi nuovi la fanno ricomparire
  async function deleteConversation(c: Conversation) {
    if (c.kind === "group") return leaveGroup(c.key.slice(6), c.name);
    const question =
      c.kind === "system"
        ? "Eliminare tutti i messaggi di SISTEMA?"
        : c.kind === "global"
          ? "Togliere i messaggi a tutti dal tuo elenco?"
          : `Togliere la conversazione con ${c.name} dal tuo elenco? Per ${c.name} resterà com'è.`;
    if (!window.confirm(question)) return;
    if (c.kind === "system") {
      await supabase.from("system_messages").delete().eq("user_id", me.id);
      setSystemMsgs([]);
    } else {
      const otherId = c.kind === "dm" ? c.key.slice(3) : null;
      const last = (otherId ? shownDms.filter((m) => m.sender_id === otherId || m.recipient_id === otherId) : shownBroadcasts).at(-1)?.created_at;
      if (last) {
        if (otherId)
          await supabase.from("private_messages").update({ read_at: new Date().toISOString() }).eq("kind", channel).eq("recipient_id", me.id).eq("sender_id", otherId).is("read_at", null);
        else await supabase.from("off_broadcast_reads").upsert({ user_id: me.id, channel, last_read_at: last });
        await supabase.from("off_hidden").upsert({ user_id: me.id, channel, conv_key: c.key, hidden_at: last });
        setHidden((h) => ({ ...h, [c.key]: last }));
        if (!otherId) setBroadcastRead(last);
      }
      if (otherId) setExtra((prev) => prev.filter((x) => x !== otherId));
    }
    if (active === c.key) setActive(null);
  }

  const isOwner = activeGroup?.created_by === me.id;
  const canWriteHere = current?.kind === "system" ? false : current?.kind !== "global" || canBroadcast;
  const showList = !active && panel !== "new-group";

  return (
    <div className="flex h-[min(72dvh,640px)] min-h-[420px] overflow-hidden rounded-2xl border border-border bg-night/40">
      {/* Conversazioni */}
      <aside className={cn("w-full flex-col border-border md:flex md:w-72 md:shrink-0 md:border-r", showList ? "flex" : "hidden")}>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", channel === "on" ? "bg-flamingo/20 text-flamingo" : "bg-lavender/20 text-lavender")}>{channel.toUpperCase()}</span>
          <span className="text-xs text-muted-foreground">{channel === "on" ? "Tra personaggi, in gioco" : "Tra giocatori, fuori gioco"}</span>
        </div>
        <NameForm label="Nuovo messaggio a" button="Apri" placeholder="Nome e cognome" onSubmit={openByName} />
        <div className="border-b border-border px-3 pb-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => (setPanel("new-group"), setActive(null))} className="w-full rounded-full">
            <Plus /> Nuovo gruppo
          </Button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {dms === null && <li className="p-3 text-sm text-muted-foreground">Caricamento…</li>}
          {dms !== null && conversations.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nessuna conversazione.</li>}
          {conversations.map((c) => {
            const isGroupOwner = c.kind === "group" && groups.find((g) => `group:${g.id}` === c.key)?.created_by === me.id;
            return (
              <li key={c.key} className={cn("group flex items-stretch border-b border-border/60 transition-colors hover:bg-white/5", c.key === active && "bg-flamingo/10")}>
                <button type="button" onClick={() => (setActive(c.key), setPanel("none"))} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left">
                  <ConversationIcon c={c} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={cn("flex-1 truncate font-medium", c.kind === "global" || c.kind === "system" ? "text-peach" : "")}>{c.name}</span>
                      <span className={cn("shrink-0 text-[0.65rem]", c.unread ? "text-mint" : "text-muted-foreground")}>{listTime(c.lastAt)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={cn("flex-1 truncate text-xs", c.unread ? "text-foreground" : "text-muted-foreground")}>
                        {c.lastBody ?? (c.kind === "global" ? "Messaggi dello staff a tutti" : "Nuova conversazione")}
                      </span>
                      {c.unread > 0 && <span className="min-w-5 rounded-full bg-mint px-1.5 text-center text-[0.65rem] font-bold text-night">{c.unread}</span>}
                    </span>
                  </span>
                </button>
                <span className="flex flex-col justify-center pr-1 opacity-60 group-hover:opacity-100">
                  {c.kind === "group" && isGroupOwner ? (
                    <button type="button" onClick={() => deleteGroup(c.key.slice(6), c.name)} className="rounded p-1.5 hover:text-destructive" title="Elimina il gruppo per tutti" aria-label="Elimina il gruppo">
                      <Trash2 className="size-4" />
                    </button>
                  ) : c.kind === "group" ? (
                    <button type="button" onClick={() => leaveGroup(c.key.slice(6), c.name)} className="rounded p-1.5 hover:text-destructive" title="Esci dal gruppo" aria-label="Esci dal gruppo">
                      <LogOut className="size-4" />
                    </button>
                  ) : (
                    <button type="button" onClick={() => deleteConversation(c)} className="rounded p-1.5 hover:text-destructive" title="Togli dal mio elenco" aria-label="Elimina la conversazione">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Conversazione aperta o nuovo gruppo */}
      <section className={cn("min-w-0 flex-1 flex-col md:flex", showList ? "hidden" : "flex")}>
        {panel === "new-group" ? (
          <NewGroup channel={channel} onCreate={createGroup} onCancel={() => setPanel("none")} />
        ) : !current ? (
          <p className="m-auto max-w-xs p-6 text-center text-sm text-muted-foreground">Scegli una conversazione, scrivi il nome di qualcuno o crea un gruppo.</p>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-border px-3 py-2.5">
              <button type="button" onClick={() => (setActive(null), setPanel("none"))} className="rounded-full p-1 text-muted-foreground hover:text-foreground md:hidden" aria-label="Torna alle conversazioni">
                <ArrowLeft className="size-5" />
              </button>
              <ConversationIcon c={current} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-heading text-xl tracking-wide">{current.name}</h3>
                {activeGroup && (
                  <button type="button" onClick={() => setPanel(panel === "members" ? "none" : "members")} className="block max-w-full truncate text-xs text-muted-foreground hover:text-foreground">
                    {groupMembers.map((m) => (m.user_id === me.id ? "Tu" : (people[m.user_id]?.name ?? "…"))).join(", ")}
                  </button>
                )}
                {current.kind === "global" && <p className="text-xs text-muted-foreground">Arrivano a tutti, collegati e non</p>}
                {current.kind === "system" && <p className="text-xs text-muted-foreground">Avvisi automatici del sito</p>}
              </div>
              {activeGroup && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setPanel(panel === "members" ? "none" : "members")} className="rounded-full">
                  <Users /> {groupMembers.length}
                </Button>
              )}
            </header>

            {panel === "members" && activeGroup ? (
              <MembersPanel
                members={groupMembers.map((m) => m.user_id)}
                people={people}
                meId={me.id}
                ownerId={activeGroup.created_by}
                isOwner={isOwner}
                onAdd={addMember}
                onRemove={removeMember}
                onClose={() => setPanel("none")}
              />
            ) : (
              <>
                <Thread bubbles={bubbles} />
                {canWriteHere ? (
                  <Composer key={current.key} onSend={send} placeholder={current.kind === "global" ? `Scrivi a tutti (${LABEL[channel]})…` : "Scrivi un messaggio…"} />
                ) : (
                  <p className="border-t border-border p-3 text-center text-sm text-muted-foreground">
                    {current.kind === "system" ? "Ai messaggi di SISTEMA non si risponde." : "Solo lo staff può scrivere a tutti."}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/* ------------------------------ Pezzi ------------------------------ */

function ConversationIcon({ c }: { c: Pick<Conversation, "kind" | "name" | "avatar"> }) {
  if (c.kind === "system")
    return <span className="grid size-10 shrink-0 place-items-center rounded-full bg-peach/20 font-heading text-sm text-peach">SYS</span>;
  if (c.kind === "global")
    return (
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-peach/20 text-peach">
        <Megaphone className="size-5" />
      </span>
    );
  if (c.kind === "group")
    return (
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lavender/20 text-lavender">
        <Users className="size-5" />
      </span>
    );
  return c.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={c.avatar} alt="" className="size-10 shrink-0 rounded-full object-cover ring-2 ring-white/10" />
  ) : (
    <CharacterAvatar initials={initials(c.name)} />
  );
}

const fullDate = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });

function Thread({ bubbles }: { bubbles: Bubble[] }) {
  // sempre puntata sull'ultimo messaggio arrivato
  const { ref: scrollRef, onScroll: onThreadScroll, onLoadCapture: onImageLoad } = useStickToBottom<HTMLDivElement>(`${bubbles[0]?.id ?? ""}:${bubbles.at(-1)?.id ?? ""}:${bubbles.length}`);
  if (bubbles.length === 0) return <p className="m-auto p-6 text-sm text-muted-foreground">Nessun messaggio: scrivi tu il primo.</p>;
  return (
    <div ref={scrollRef} onScroll={onThreadScroll} onLoadCapture={onImageLoad} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
      <div className="flex flex-col gap-2">
        {bubbles.map((b, i) => {
          const day = fullDate(b.at);
          const showDay = i === 0 || fullDate(bubbles[i - 1].at) !== day;
          return (
            <Fragment key={b.id}>
              {showDay && <p className="my-2 text-center text-[0.7rem] tracking-wide text-muted-foreground uppercase">{day}</p>}
              <div className={cn("flex max-w-[85%] gap-2", b.mine ? "self-end flex-row-reverse" : "self-start")}>
                {!b.mine && !b.system && (
                  <span className="mt-auto">
                    {b.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.avatar} alt="" className="size-7 rounded-full object-cover" />
                    ) : (
                      <CharacterAvatar initials={initials(b.author)} className="size-7 text-xs" />
                    )}
                  </span>
                )}
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm",
                    b.system ? "border border-peach/30 bg-peach/10" : b.mine ? "rounded-br-sm bg-flamingo/25" : "rounded-bl-sm bg-white/10",
                  )}
                >
                  {!b.mine && <p className={cn("mb-0.5 text-xs font-semibold", b.system ? "text-peach" : "text-lavender")}>{b.author}</p>}
                  <p className="leading-relaxed break-words whitespace-pre-line">{b.body}</p>
                  <p className="mt-0.5 flex items-center justify-end gap-1 text-[0.65rem] text-muted-foreground">
                    {formatTime(b.at)}
                    {b.mine && b.status === "read" && <CheckCheck className="size-3.5 text-mint" aria-label="Letto" />}
                    {b.mine && b.status === "sent" && <Check className="size-3.5" aria-label="Inviato" />}
                  </p>
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function Composer({ onSend, placeholder }: { onSend: (body: string) => Promise<string | null>; placeholder: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  async function submit() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const err = await onSend(body);
    setSending(false);
    if (err) setError(err);
    else setText("");
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-1 border-t border-border p-2"
    >
      {error && <p className="px-1 text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder={placeholder}
          className="min-h-0 flex-1 resize-none rounded-xl border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring"
        />
        <Button type="submit" size="icon-lg" disabled={sending || !text.trim()} className="h-auto self-stretch px-3" aria-label="Invia">
          <SendHorizontal />
        </Button>
      </div>
    </form>
  );
}

function NameForm({ label, button, placeholder, onSubmit }: { label: string; button: string; placeholder: string; onSubmit: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const err = await onSubmit(name);
        if (err) setError(err);
        else setName("");
      }}
      className="flex flex-col gap-1.5 p-3"
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder={placeholder}
          className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-night/40 px-2.5 text-sm outline-none focus-visible:border-ring"
        />
        <Button type="submit" size="sm" disabled={name.trim().length < 3} className="h-9 rounded-full">
          {button}
        </Button>
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </form>
  );
}

function NewGroup({ channel, onCreate, onCancel }: { channel: Channel; onCreate: (name: string, members: string[]) => Promise<string | null>; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [list, setList] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        const names = list.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
        const err = await onCreate(name, names);
        setPending(false);
        if (err) setError(err);
      }}
      className="flex flex-col gap-3 overflow-y-auto p-4"
    >
      <h3 className="font-heading text-2xl tracking-wide">Nuovo gruppo {channel.toUpperCase()}</h3>
      <label className="flex flex-col gap-1.5 text-sm">
        Nome del gruppo
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required className="h-10 rounded-lg border border-input bg-night/40 px-3 outline-none focus-visible:border-ring" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Membri
        <textarea
          value={list}
          onChange={(e) => setList(e.target.value)}
          rows={4}
          placeholder={"Un nome per riga (nome e cognome)\nLena Moreno\nMax Rivera"}
          className="rounded-lg border border-input bg-night/40 px-3 py-2 outline-none focus-visible:border-ring"
        />
        <span className="text-xs text-muted-foreground">
          {channel === "on" ? "Nei gruppi ON solo giocatori con un personaggio approvato." : "Tu entri nel gruppo da solo; puoi aggiungere e togliere membri dopo."}
        </span>
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} className="rounded-full">
          Annulla
        </Button>
        <Button type="submit" disabled={pending || !name.trim()} className="rounded-full">
          <Users /> Crea il gruppo
        </Button>
      </div>
    </form>
  );
}

function MembersPanel({
  members,
  people,
  meId,
  ownerId,
  isOwner,
  onAdd,
  onRemove,
  onClose,
}: {
  members: string[];
  people: Record<string, Contact>;
  meId: string;
  ownerId: string | null;
  isOwner: boolean;
  onAdd: (name: string) => Promise<string | null>;
  onRemove: (userId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-4 pt-3">
        <h4 className="font-heading text-xl tracking-wide">Membri</h4>
        <button type="button" onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:text-foreground" aria-label="Chiudi">
          <X className="size-4" />
        </button>
      </div>
      {isOwner && <NameForm label="Aggiungi un membro" button="Aggiungi" placeholder="Nome e cognome" onSubmit={onAdd} />}
      <ul className="flex flex-col gap-1 px-3 pb-3">
        {members.map((id) => {
          const p = people[id];
          return (
            <li key={id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5">
              <ConversationIcon c={{ kind: "dm", name: p?.name ?? "…", avatar: p?.avatar }} />
              <span className="min-w-0 flex-1 truncate text-sm">
                {id === meId ? "Tu" : (p?.name ?? "…")}
                {id === ownerId && <span className="ml-2 text-xs text-peach">ha creato il gruppo</span>}
              </span>
              {(isOwner || id === meId) && (
                <button type="button" onClick={() => onRemove(id)} className="rounded p-1.5 text-muted-foreground hover:text-destructive" aria-label={id === meId ? "Esci dal gruppo" : "Togli dal gruppo"} title={id === meId ? "Esci dal gruppo" : "Togli dal gruppo"}>
                  {id === meId ? <LogOut className="size-4" /> : <UserMinus className="size-4" />}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!isOwner && (
        <p className="flex items-center gap-1.5 px-4 pb-4 text-xs text-muted-foreground">
          <UserPlus className="size-3.5" /> Solo chi ha creato il gruppo aggiunge e toglie i membri.
        </p>
      )}
    </div>
  );
}
