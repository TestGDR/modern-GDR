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
import { refreshCounters, useCounters } from "@/lib/counters";
import { cn } from "@/lib/utils";

// Messaggi OFF e Telefono nella barra in alto, con i loro contatori
// (dal Westeros: useUnread in GameShell.tsx). Il telefono cambia icona
// durante una chiamata e fa squillare in tutto il gioco.

/** Telefono: mentre squilla si ricontrolla spesso (la chiamata può diventare "persa") */
function usePhoneRinging(ringing: boolean) {
  useEffect(() => {
    if (!ringing) return;
    const t = setInterval(() => refreshCounters(true), 15_000);
    return () => clearInterval(t);
  }, [ringing]);
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
export function MessageButtons({ userId, center }: { userId: string | null; center?: React.ReactNode }) {
  // contatori condivisi (una sola chiamata per tutte le icone: src/lib/counters.ts)
  const counters = useCounters();
  const off = userId ? counters.off : 0;
  const phone = userId ? counters.phone : { unread: 0, call: null };
  const refresh = useCallback(() => {
    refreshCounters(true);
  }, []);
  usePhoneRinging(phone.call?.status === "squilla");
  const pathname = usePathname();
  const incoming = phone.call?.status === "squilla" && phone.call.incoming;

  // Suoni: subito quando sale un conteggio, poi ogni 15 secondi finché resta
  // qualcosa da leggere; il telefono che squilla suona ogni 3 secondi.
  // Durante una chiamata il telefono suona solo quando arriva una risposta,
  // senza ripetersi (si può chiudere la finestra e riaprirla al suono).
  const inCall = phone.call?.status === "attiva";
  const phoneReminder = inCall ? 0 : phone.unread;
  const previous = useRef({ off: 0, phone: 0 });
  useEffect(() => {
    if (phone.unread > previous.current.phone) playEvent("on");
    else if (off > previous.current.off) playEvent("off");
    previous.current = { off, phone: phone.unread };
  }, [off, phone.unread]);
  useEffect(() => {
    if (off + phoneReminder === 0) return;
    return everyEvenInBackground(() => playEvent(phoneReminder > 0 ? "on" : "off"), 15_000);
  }, [off, phoneReminder]);
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
      <Buttons off={off} phone={phone} center={center} />
      {incoming && phone.call && !pathname.startsWith("/telefono") && <IncomingCall call={phone.call} onDone={refresh} />}
    </>
  );
}

/** Segnaposto mentre arriva l'utente */
export function MessageButtonsFallback({ center }: { center?: React.ReactNode }) {
  return <Buttons off={0} phone={{ unread: 0, call: null }} center={center} />;
}

// Stessa larghezza ai due lati: il ritratto resta al centro
const SAME_WIDTH = "w-16 sm:w-28";

/** Messaggi OFF · (ritratto al centro) · Telefono */
function Buttons({ off, phone, center }: { off: number; phone: PhoneState; center?: React.ReactNode }) {
  const call = phone.call;
  const active = call?.status === "attiva";
  const ringing = call?.status === "squilla" && call.incoming;
  const href = call ? `/telefono?numero=${call.my_number}&chat=${call.thread_id}` : "/telefono";
  const label = active ? (call.video ? "In video" : "In chiamata") : ringing ? "Squilla!" : "Telefono";
  return (
    <>
      <Link href="/messaggi?canale=off" className={cn(barButtonClass, SAME_WIDTH, off > 0 && "blink-call")} aria-label={off > 0 ? `Messaggi OFF: ${off} da leggere` : "Messaggi OFF"}>
        <Mail /> <span className="sm:hidden">OFF</span>
        <span className="hidden sm:inline">Messaggi OFF</span>
        <Badge n={off} />
      </Link>
      {center}
      <Link
        href={href}
        className={cn(barButtonClass, SAME_WIDTH, (phone.unread > 0 || ringing) && "blink-call", active && "text-mint [&_svg]:animate-pulse")}
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
