import "server-only";
import { io } from "next/cache";

/**
 * Ora corrente per i componenti del server.
 * Con Cache Components l'ora va letta solo dopo `io()`: durante il
 * prerendering si ferma qui, durante una visita prosegue subito.
 */
export async function requestTime() {
  await io();
  return new Date();
}
