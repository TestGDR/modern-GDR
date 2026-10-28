"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Pezzi del forum che girano nel browser.

/** Evento: il forum è stato letto (l'icona della barra laterale si aggiorna) */
export const FORUM_READ_EVENT = "forum-letto";

/** Aprendo una discussione la si segna come letta */
export function MarkThreadRead({ threadId, lastPost }: { threadId: string; lastPost: string | null }) {
  useEffect(() => {
    createClient()
      .rpc("forum_mark_read", { p_thread: threadId })
      .then(() => window.dispatchEvent(new Event(FORUM_READ_EVENT)));
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
