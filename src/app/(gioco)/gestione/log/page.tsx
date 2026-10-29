import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Users } from "lucide-react";
import { BackToPanel, inputClass } from "@/components/admin/admin-ui";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/admin";
import { can } from "@/lib/auth";
import { KIND_LABEL } from "@/lib/chat";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { MessageKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Log" };

type Tab = "chat" | "on" | "off";
const TABS: { id: Tab; label: string; perm: string }[] = [
  { id: "chat", label: "Log chat", perm: "chat.log" },
  { id: "on", label: "Telefono", perm: "messaggi.log" },
  { id: "off", label: "Messaggi OFF", perm: "messaggi.log" },
];
const LIMIT = 300;

export default function Page({ searchParams }: PageProps<"/gestione/log">) {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Log" subtitle="Rileggi le chat di gioco, il telefono e i messaggi OFF, con filtri per persona, chat e data." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

async function Content({ searchParams }: { searchParams: PageProps<"/gestione/log">["searchParams"] }) {
  const player = await requirePermission("chat.log", "messaggi.log");
  const params = await searchParams;
  const allowed = TABS.filter((t) => can(player, t.perm));
  const tab = allowed.find((t) => t.id === str(params.scheda))?.id ?? allowed[0].id;
  const chi = str(params.chi);
  const stanza = str(params.stanza);
  const dal = /^\d{4}-\d{2}-\d{2}$/.test(str(params.dal)) ? str(params.dal) : "";
  const al = /^\d{4}-\d{2}-\d{2}$/.test(str(params.al)) ? str(params.al) : "";
  const supabase = await createClient();

  const { data: rooms } = await supabase.from("rooms").select("id, name").order("name").overrideTypes<{ id: string; name: string }[], { merge: false }>();
  const from = dal ? new Date(`${dal}T00:00:00`).toISOString() : null;
  const to = al ? new Date(`${al}T23:59:59`).toISOString() : null;

  // Persona cercata (nome del personaggio = nome dell'account)
  let personId: string | null = null;
  if (chi && tab === "off") {
    const { data } = await supabase.rpc("find_player", { p_name: chi });
    personId = ((data ?? []) as { user_id: string }[])[0]?.user_id ?? "00000000-0000-0000-0000-000000000000";
  }

  type Row = { key: string; at: string; who: string; to: string | null; where: string | null; kind: string; body: string; badge?: string };
  let rows: Row[] = [];

  if (tab === "chat") {
    let q = supabase
      .from("messages")
      .select("id, created_at, character_name, kind, content, recipient, room:rooms(name)")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (chi) q = q.ilike("character_name", `%${chi.replace(/[%_\\]/g, "\\$&")}%`);
    if (stanza) q = q.eq("room_id", stanza);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    const { data } = await q.overrideTypes<
      { id: number; created_at: string; character_name: string; kind: MessageKind; content: string; recipient: string | null; room: { name: string } | null }[],
      { merge: false }
    >();
    rows = (data ?? []).map((m) => ({
      key: `c${m.id}`,
      at: m.created_at,
      who: m.character_name,
      to: m.recipient,
      where: m.room?.name ?? null,
      kind: KIND_LABEL[m.kind],
      body: m.content,
    }));
  } else if (tab === "on") {
    // Telefono: chi scrive (personaggio e numero), conversazione o gruppo
    type PhoneRow = {
      id: number;
      created_at: string;
      mode: string;
      body: string;
      deleted_at: string | null;
      original: { body: string } | null;
      sender: { display_name: string; digits: string; character: { name: string } | null } | null;
      thread: { is_group: boolean; name: string } | null;
    };
    let q = supabase
      .from("phone_messages")
      .select(`id, created_at, mode, body, deleted_at, original:phone_deleted_bodies(body), sender:phone_numbers${chi ? "!inner" : ""}(display_name, digits, character:characters${chi ? "!inner" : ""}(name)), thread:phone_threads(is_group, name)`)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (chi) q = q.ilike("sender.character.name", `%${chi}%`);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    const { data } = await q.overrideTypes<PhoneRow[], { merge: false }>();
    const MODE: Record<string, string> = { testo: "Messaggio", vocale: "Vocale", chiamata: "Chiamata", videochiamata: "Videochiamata", evento: "Avviso" };
    rows = (data ?? []).map((m) => ({
      key: `t${m.id}`,
      at: m.created_at,
      who: m.sender ? `${m.sender.character?.name ?? m.sender.display_name} (+${m.sender.digits})` : "Telefono",
      to: null,
      where: m.thread?.is_group ? m.thread.name : null,
      kind: MODE[m.mode] ?? m.mode,
      // messaggio eliminato dal mittente: lo staff vede il testo originale
      body: m.deleted_at ? `[eliminato] ${m.original?.body ?? m.body}` : m.body,
      badge: m.thread?.is_group ? "gruppo" : undefined,
    }));
  } else {
    let dm = supabase.from("private_messages").select("id, sender_id, recipient_id, body, created_at").eq("kind", tab).order("created_at", { ascending: false }).limit(LIMIT);
    if (personId) dm = dm.or(`sender_id.eq.${personId},recipient_id.eq.${personId}`);
    if (from) dm = dm.gte("created_at", from);
    if (to) dm = dm.lte("created_at", to);
    let gm = supabase
      .from("off_group_messages")
      .select("id, sender_id, body, created_at, grp:off_groups!inner(name, channel)")
      .eq("grp.channel", tab)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (personId) gm = gm.eq("sender_id", personId);
    if (from) gm = gm.gte("created_at", from);
    if (to) gm = gm.lte("created_at", to);
    const [{ data: d1 }, { data: d2 }] = await Promise.all([
      dm.overrideTypes<{ id: number; sender_id: string; recipient_id: string; body: string; created_at: string }[], { merge: false }>(),
      gm.overrideTypes<{ id: number; sender_id: string; body: string; created_at: string; grp: { name: string } | null }[], { merge: false }>(),
    ]);
    const ids = [...new Set([...(d1 ?? []).flatMap((m) => [m.sender_id, m.recipient_id]), ...(d2 ?? []).map((m) => m.sender_id)])];
    const { data: names } = ids.length ? await supabase.rpc("log_names", { p_users: ids }) : { data: [] };
    const nameOf = Object.fromEntries(((names ?? []) as { user_id: string; name: string }[]).map((n) => [n.user_id, n.name]));
    rows = [
      ...(d1 ?? []).map((m) => ({ key: `d${m.id}`, at: m.created_at, who: nameOf[m.sender_id] ?? "…", to: nameOf[m.recipient_id] ?? "…", where: null, kind: "Diretto", body: m.body })),
      ...(d2 ?? []).map((m) => ({ key: `g${m.id}`, at: m.created_at, who: nameOf[m.sender_id] ?? "…", to: null, where: m.grp?.name ?? null, kind: "Gruppo", body: m.body, badge: "gruppo" })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, LIMIT);
  }

  const link = (t: Tab) => `/gestione/log?scheda=${t}`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1">
        {allowed.map((t) => (
          <Link
            key={t.id}
            href={link(t.id)}
            className={cn("rounded-full px-4 py-2 text-sm", tab === t.id ? "bg-flamingo/20 text-white shadow-[inset_0_0_0_1px_var(--flamingo)]" : "text-muted-foreground hover:bg-white/5")}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <form className="glass grid grid-cols-1 gap-2 rounded-2xl p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto]">
        <input type="hidden" name="scheda" value={tab} />
        <input name="chi" defaultValue={chi} placeholder={tab === "off" ? "Nome e cognome" : "Personaggio"} className={inputClass} />
        {tab === "chat" ? (
          <select name="stanza" defaultValue={stanza} className={inputClass}>
            <option value="">Tutte le chat</option>
            {(rooms ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="hidden lg:block" />
        )}
        <input type="date" name="dal" defaultValue={dal} className={inputClass} aria-label="Dal giorno" />
        <input type="date" name="al" defaultValue={al} className={inputClass} aria-label="Al giorno" />
        <Button type="submit" className="h-10 rounded-full">
          Filtra
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        Al massimo {LIMIT} messaggi, dal più recente.
        {tab === "chat" && !player.level.is_admin && " I sussurri li vede solo l'Amministratore."}
      </p>
      {rows.length === 0 && <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">Nessun messaggio con questi filtri.</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.key} className="glass rounded-2xl px-4 py-3 text-sm">
            <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{r.who}</span>
              {r.to && <span>→ {r.to}</span>}
              {r.where && (
                <span className="flex items-center gap-1">
                  {r.badge && <Users className="size-3" />} {r.where}
                </span>
              )}
              <span className="rounded bg-white/10 px-1.5">{r.kind}</span>
              <span className="ml-auto">{formatDateTime(r.at)}</span>
            </p>
            <p className="mt-1 leading-relaxed break-words whitespace-pre-line">{r.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
