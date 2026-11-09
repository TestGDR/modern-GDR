"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

// Pezzi del forum che girano nel browser.

/** Evento: il forum è stato letto (l'icona della barra laterale si aggiorna) */
export const FORUM_READ_EVENT = "forum-letto";

// Discussioni lette in questa visita (id → quando): le pagine del forum arrivano dal
// server con i pallini «nuovo» di quel momento e non si ricaricano; così il pallino
// sparisce subito, senza chiedere di nuovo la pagina al server.
const readAt = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;
function markLocal(threadId: string) {
  readAt.set(threadId, Date.now());
  version++;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
/** Si ridisegna quando una discussione viene letta */
export function useForumReadVersion() {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}
/** Letta in questa visita (e dopo il suo ultimo messaggio, se lo si sa) */
export function readLocally(threadId: string, updatedAt?: string | null) {
  const t = readAt.get(threadId);
  return t !== undefined && (!updatedAt || Date.parse(updatedAt) <= t);
}

/** Pallino «messaggi nuovi»: sparisce appena la discussione è letta */
export function UnreadDot({ threadId, updatedAt }: { threadId: string; updatedAt?: string | null }) {
  useForumReadVersion();
  if (readLocally(threadId, updatedAt)) return null;
  return <span className="size-2.5 shrink-0 rounded-full bg-flamingo" aria-label="Messaggi nuovi" />;
}

/** Aprendo una discussione la si segna come letta */
export function MarkThreadRead({ threadId, lastPost }: { threadId: string; lastPost: string | null }) {
  useEffect(() => {
    createClient()
      .rpc("forum_mark_read", { p_thread: threadId })
      .then(() => {
        markLocal(threadId);
        window.dispatchEvent(new Event(FORUM_READ_EVENT));
      });
  }, [threadId, lastPost]);
  return null;
}

/** Dopo "Segna tutto come letto" l'icona si aggiorna */
export function ForumReadSignal() {
  useEffect(() => {
    window.dispatchEvent(new Event(FORUM_READ_EVENT));
  });
  return null;
}
