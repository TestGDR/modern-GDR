"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function siteOrigin() {
  return (await headers()).get("origin") ?? "";
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

  const supabase = await createClient();
  // Un nuovo account parte sempre da zero: chiude un'eventuale sessione rimasta aperta
  await supabase.auth.signOut();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Lo username finisce anche nell'email di riepilogo ({{ .Data.username }})
      data: { username },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/bacheca`,
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

  // Dopo la registrazione si torna alla home per fare l'accesso.
  // (Se la conferma email è disattivata Supabase apre già la sessione: la chiudiamo.)
  if (data.session) await supabase.auth.signOut();
  redirect("/?registrato=1");
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

  // Si entra subito in gioco: il personaggio si crea dalla Scheda personaggio
  redirect("/bacheca");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/** Invia l'email per scegliere una nuova password */
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email");
  if (!email.includes("@")) return { error: "Inserisci un'email valida.", values: { email } };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/nuova-password`,
  });

  if (error && (error.code === "over_email_send_rate_limit" || error.status === 429)) {
    return { error: "Troppe richieste in poco tempo. Riprova tra qualche minuto.", values: { email } };
  }
  // Stessa risposta che l'email esista o no, per non rivelare chi è iscritto
  return {
    success: `Se esiste un account con ${email}, riceverai a breve un'email con il link per scegliere una nuova password.`,
  };
}

/** Salva la nuova password (l'utente arriva qui dal link dell'email) */
export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "La password deve avere almeno 8 caratteri." };
  if (password !== confirm) return { error: "Le due password non coincidono." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "La nuova password deve essere diversa da quella vecchia." };
    if (error.code === "weak_password") return { error: "Password troppo debole: usane una più lunga o più varia." };
    return { error: `Password non aggiornata: ${error.message}` };
  }
  redirect("/bacheca");
}
