"use client";

import { useSyncExternalStore } from "react";

// Il sotto-tag in cui si trova il mio personaggio nella chat aperta: lo scrive
// la chat, lo legge l'elenco «Online» della barra laterale.

type MySubTag = { roomId: string | null; name: string | null };

const NONE: MySubTag = { roomId: null, name: null };
let state: MySubTag = NONE;
const listeners = new Set<() => void>();

export function setMySubTag(roomId: string | null, name: string | null) {
  if (state.roomId === roomId && state.name === name) return;
  state = roomId ? { roomId, name } : NONE;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useMySubTag(): MySubTag {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => NONE,
  );
}
