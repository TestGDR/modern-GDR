"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Mail, Phone, PhoneCall, PhoneIncoming, PhoneOff, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { barButtonClass } from "@/components/game/sidebar-styles";
import { everyEvenInBackground, playEvent } from "@/lib/notify-sound";
import { formatPhone, type PhoneState } from "@/lib/phone";
import { createClient } from "@/lib/supabase/client";
import { setTitleCount } from "@/lib/title-count";
import { useResync } from "@/lib/use-resync";
import { cn } from "@/lib/utils";

// Messaggi OFF e Telefono nella barra in alto, con i loro contatori
// (dal Westeros: useUnread in GameShell.tsx). Il telefono cambia icona
// durante una chiamata e fa squillare in tutto il gioco.

const EMPTY_PHONE: PhoneState = { unread: 0, call: null };

/** Non letti OFF (messaggi, gruppi, messaggi a tutti, SISTEMA), in tempo reale */
function useOffUnread(userId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.rpc("off_unread", { p_channel: "off" });
    setCount((data as number | null) ?? 0);
  }, [supabase, userId]);

  useResync(refresh);

  useEffect(() => {
    if (!userId) return;
    const first = setTimeout(refresh, 0);
    const ch = supabase
      .channel(`unread:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "private_messages", filter: `recipient_id=eq.${userId}` }, () => refresh())
      // letto da un altro dispositivo o da un'altra scheda
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "private_messages", filter: `recipient_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "off_group_messages" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "off_group_members" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "off_broadcasts" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "off_broadcast_reads", filter: `user_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "system_messages", filter: `user_id=eq.${userId}` }, () => refresh())
      .subscribe();
    return () => {
      clearTimeout(first);
      supabase.removeChannel(ch);
    };
  }, [supabase, userId, refresh]);

  return count;
}

/** Telefono: non letti e chiamata in corso (o che squilla), in tempo reale */
function usePhoneState(userId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<PhoneState>(EMPTY_PHONE);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.rpc("phone_state");
    if (data) setState(data as PhoneState);
  }, [supabase, userId]);

  useResync(refresh, 60_000);

  useEffect(() => {
    if (!userId) return;
    const first = setTimeout(refresh, 0);
    const ch = supabase
      .channel(`telefono-stato:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "phone_messages" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "phone_members" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "phone_calls" }, () => refresh())
      .subscribe();
    return () => {
      clearTimeout(first);
      supabase.removeChannel(ch);
    };
  }, [supabase, userId, refresh]);

  // Mentre squilla, si ricontrolla spesso (la chiamata può diventare "persa")
  const ringing = state.call?.status === "squilla";
  useEffect(() => {
    if (!ringing) return;
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [ringing, refresh]);

  return { state, refresh };
}

function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full bg-flamingo px-1 text-[0.6rem] leading-4 font-bold text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Con i contatori dell'utente collegato */
export function MessageButtons({ userId }: { userId: string | null }) {
  const off = useOffUnread(userId);
  const { state: phone, refresh } = usePhoneState(userId);
  const pathname = usePathname();
  const incoming = phone.call?.status === "squilla" && phone.call.incoming;

  // Suoni: subito quando sale un conteggio, poi ogni 15 secondi finché resta
  // qualcosa da leggere; il telefono che squilla suona ogni 3 secondi
  const previous = useRef({ off: 0, phone: 0 });
  useEffect(() => {
    if (phone.unread > previous.current.phone) playEvent("on");
    else if (off > previous.current.off) playEvent("off");
    previous.current = { off, phone: phone.unread };
    if (off + phone.unread === 0) return;
    return everyEvenInBackground(() => playEvent(phone.unread > 0 ? "on" : "off"), 15_000);
  }, [off, phone.unread]);
  useEffect(() => {
    if (!incoming) return;
    playEvent("on");
    return everyEvenInBackground(() => playEvent("on"), 3_000);
  }, [incoming]);

  // Non letti nel titolo della scheda (sommati ai ticket)
  const total = off + phone.unread + (incoming ? 1 : 0);
  useEffect(() => {
    setTitleCount("messaggi", total);
  }, [total, pathname]);

  return (
    <>
      <Buttons off={off} phone={phone} />
      {incoming && phone.call && !pathname.startsWith("/telefono") && <IncomingCall call={phone.call} onDone={refresh} />}
    </>
  );
}

/** Segnaposto mentre arriva l'utente */
export function MessageButtonsFallback() {
  return <Buttons off={0} phone={EMPTY_PHONE} />;
}

function Buttons({ off, phone }: { off: number; phone: PhoneState }) {
  const call = phone.call;
  const active = call?.status === "attiva";
  const ringing = call?.status === "squilla" && call.incoming;
  const href = call ? `/telefono?numero=${call.my_number}&chat=${call.thread_id}` : "/telefono";
  const label = active ? (call.video ? "In video" : "In chiamata") : ringing ? "Squilla!" : "Telefono";
  return (
    <>
      <Link href="/messaggi?canale=off" className={cn(barButtonClass, off > 0 && "blink-call")} aria-label={off > 0 ? `Messaggi OFF: ${off} da leggere` : "Messaggi OFF"}>
        <Mail /> <span className="sm:hidden">OFF</span>
        <span className="hidden sm:inline">Messaggi OFF</span>
        <Badge n={off} />
      </Link>
      <Link
        href={href}
        className={cn(barButtonClass, (phone.unread > 0 || ringing) && "blink-call", active && "text-mint [&_svg]:animate-pulse")}
        aria-label={phone.unread > 0 ? `Telefono: ${phone.unread} da leggere` : label}
      >
        {active ? call.video ? <Video /> : <PhoneCall /> : ringing ? <PhoneIncoming /> : <Phone />}
        <span>{label}</span>
        <Badge n={phone.unread} />
      </Link>
    </>
  );
}

/** Avviso di chiamata in arrivo, in tutto il gioco */
function IncomingCall({ call, onDone }: { call: NonNullable<PhoneState["call"]>; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function answer(accept: boolean) {
    setPending(true);
    await supabase.rpc("phone_answer", { p_call: call.id, p_accept: accept });
    setPending(false);
    onDone();
    if (accept) router.push(`/telefono?numero=${call.my_number}&chat=${call.thread_id}`);
  }

  return (
    <div role="alertdialog" aria-label="Chiamata in arrivo" className="glass fixed right-4 bottom-4 z-[60] flex w-72 flex-col gap-3 rounded-3xl border-mint/40 p-4 shadow-2xl">
      <p className="flex items-center gap-2 text-sm text-mint">
        {call.video ? <Video className="size-4" /> : <PhoneIncoming className="size-4" />}
        {call.video ? "Videochiamata in arrivo" : "Chiamata in arrivo"}
      </p>
      <div>
        <p className="font-heading text-2xl tracking-wide">{call.other_name}</p>
        <p className="text-xs text-muted-foreground">{formatPhone(call.other_digits)}</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={pending} onClick={() => answer(true)} className="flex-1 rounded-full bg-mint text-night hover:bg-mint/90">
          <Phone /> Rispondi
        </Button>
        <Button type="button" disabled={pending} variant="destructive" onClick={() => answer(false)} className="flex-1 rounded-full">
          <PhoneOff /> Rifiuta
        </Button>
      </div>
    </div>
  );
}
