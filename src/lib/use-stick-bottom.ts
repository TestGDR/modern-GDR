"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Tiene una conversazione puntata sull'ultimo messaggio: a ogni messaggio
 * nuovo (cambia `key`) scorre in fondo. Quando un'immagine finisce di
 * caricarsi riscorre in fondo, se si era già in fondo.
 * Scorre solo il riquadro della chat, mai la pagina o la finestra intorno.
 */
export function useStickToBottom<T extends HTMLElement>(key: unknown) {
  const ref = useRef<T>(null);
  const atBottom = useRef(true);

  const toBottom = useCallback(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    toBottom();
    atBottom.current = true;
  }, [key, toBottom]);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // il caricamento delle immagini non risale fino al riquadro: si ascolta in "cattura"
  const onLoadCapture = useCallback(() => {
    if (atBottom.current) toBottom();
  }, [toBottom]);

  return { ref, onScroll, onLoadCapture };
}
