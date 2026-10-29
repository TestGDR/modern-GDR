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

/**
 * Email dell'account per il login (maiuscole/minuscole indifferenti).
 * Vale il nome completo ("Santiago Medina Rojas") oppure solo il nome
 * ("Santiago"), se un solo personaggio si chiama così; se sono di più
 * risponde "ambiguous" e serve anche il cognome.
 */
export async function findEmailByName(name: string): Promise<string | null | "ambiguous"> {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY mancante");

  // Nel confronto "ilike" i caratteri % e _ vanno trattati come testo
  const pattern = name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\\%_]/g, (c) => `\\${c}`);
  if (!pattern) return null;
  let { data: found } = await admin.from("profiles").select("id").ilike("username", pattern).limit(2);
  // solo il nome: "Santiago" trova "Santiago Medina Rojas"
  if (!found?.length) ({ data: found } = await admin.from("profiles").select("id").ilike("username", `${pattern} %`).limit(2));
  if (!found?.length) return null;
  if (found.length > 1) return "ambiguous";

  const { data } = await admin.auth.admin.getUserById(found[0].id);
  return data.user?.email ?? null;
}
