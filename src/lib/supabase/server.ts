import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client Supabase per Server Components, Server Actions e Route Handlers.
// Crea sempre un nuovo client per ogni richiesta: non salvarlo in variabili globali.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chiamato da un Server Component: i cookie non si possono scrivere qui.
            // Va bene così, perché il proxy aggiorna la sessione a ogni richiesta.
          }
        },
      },
    },
  );
}
