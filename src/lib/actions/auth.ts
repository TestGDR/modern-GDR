"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = text(formData, "username");
  const email = text(formData, "email");
  const password = String(formData.get("password") ?? "");
  // In caso di errore, nome utente ed email restano nel modulo
  const fail = (error: string): FormState => ({ error, values: { username, email } });

  if (!USERNAME_RE.test(username)) {
    return fail("Il nome utente deve avere 3-24 caratteri: lettere, numeri, punto o trattino basso.");
  }
  if (!email.includes("@")) return fail("Inserisci un'email valida.");
  if (password.length < 8) return fail("La password deve avere almeno 8 caratteri.");

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username },
      emailRedirectTo: `${origin}/auth/confirm?next=/crea-personaggio`,
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("database error")) {
      return fail("Questo nome utente è già in uso. Scegline un altro.");
    }
    if (error.code === "user_already_exists") {
      return fail("Esiste già un account con questa email. Prova ad accedere.");
    }
    if (error.code === "weak_password") {
      return fail("Password troppo debole: usane una più lunga o più varia.");
    }
    if (error.code === "email_address_not_authorized") {
      return fail("Le registrazioni non sono ancora aperte: lo staff deve attivare l'invio delle email.");
    }
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return fail("Troppe registrazioni in poco tempo. Riprova tra qualche minuto.");
    }
    return fail(`Registrazione non riuscita: ${error.message}`);
  }

  // Se la conferma email è disattivata, la sessione è già attiva
  if (data.session) redirect("/crea-personaggio");

  return {
    success: `Ti abbiamo mandato un'email a ${email}. Apri il link per confermare l'account, poi crea il tuo personaggio.`,
  };
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email");
  const password = String(formData.get("password") ?? "");
  const fail = (error: string): FormState => ({ error, values: { email } });
  if (!email || !password) return fail("Inserisci email e password.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return fail("Devi prima confermare l'email: controlla la posta (anche lo spam).");
    }
    if (error.code === "invalid_credentials") {
      return fail("Email o password non corretti.");
    }
    return fail(`Accesso non riuscito: ${error.message}`);
  }

  redirect("/bacheca");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
