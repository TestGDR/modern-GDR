import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Client con la chiave SEGRETA di Supabase: ignora la RLS.
 * Solo sul server e solo per operazioni mirate (es. trovare l'email
 * collegata al nome del personaggio durante l'accesso).
 * La chiave sta nella variabile SUPABASE_SECRET_KEY, mai nel codice.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Email dell'account con questo nome (maiuscole/minuscole indifferenti), o null */
export async function findEmailByName(name: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY mancante");

  // Nel confronto "ilike" i caratteri % e _ vanno trattati come testo
  const pattern = name.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", pattern)
    .maybeSingle<{ id: string }>();
  if (!profile) return null;

  const { data } = await admin.auth.admin.getUserById(profile.id);
  return data.user?.email ?? null;
}
