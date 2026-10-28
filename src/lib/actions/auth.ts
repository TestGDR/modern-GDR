"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidName, NAME_MAX, NAME_MIN, normalizeName } from "@/lib/character-name";
import { findEmailByName } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function siteOrigin() {
  return (await headers()).get("origin") ?? "";
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  // Il nome scelto in registrazione è il nome del personaggio, ed è quello con cui si accede
  const name = normalizeName(text(formData, "name"));
  const email = text(formData, "email");
  const password = String(formData.get("password") ?? "");
  // In caso di errore, nome ed email restano nel modulo
  const fail = (error: string): FormState => ({ error, values: { name, email } });

  if (!isValidName(name)) {
    return fail(`Il nome del personaggio deve avere da ${NAME_MIN} a ${NAME_MAX} caratteri: lettere, spazi, apostrofo o trattino.`);
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
      // Diventa profiles.username e finisce nell'email di riepilogo ({{ .Data.username }})
      data: { username: name },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/mappa`,
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("database error")) {
      return fail("Esiste già un personaggio con questo nome. Scegline un altro.");
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

  const confirmText = data.session
    ? "Ora puoi accedere con il nome del personaggio e la password."
    : "Ti abbiamo mandato un'email: apri il link per confermare l'account, poi accedi con il nome del personaggio.";
  if (formData.get("in_modal") === "1") return { success: confirmText };
  redirect("/?registrato=1");
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const login = normalizeName(text(formData, "name"));
  const password = String(formData.get("password") ?? "");
  const fail = (error: string): FormState => ({ error, values: { name: login } });
  if (!login || !password) return fail("Inserisci il nome del personaggio e la password.");

  // Si accede col nome del personaggio; per comodità funziona anche l'email
  let email: string | null = login.includes("@") ? login : null;
  if (!email) {
    try {
      email = await findEmailByName(login);
    } catch {
      return fail("Accesso non disponibile: manca la configurazione del server (chiave segreta di Supabase).");
    }
  }
  // Stesso messaggio se il nome non esiste o se la password è sbagliata
  if (!email) return fail("Nome del personaggio o password non corretti.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return fail("Devi prima confermare l'email: controlla la posta (anche lo spam).");
    }
    if (error.code === "invalid_credentials") {
      return fail("Nome del personaggio o password non corretti.");
    }
    return fail(`Accesso non riuscito: ${error.message}`);
  }

  // Si entra in gioco dalla mappa: la scheda si completa da Scheda personaggio
  redirect("/mappa");
}

export async function signOut() {
  const supabase = await createClient();
  // si sparisce subito dai presenti online
  await supabase.rpc("leave_online");
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
  redirect("/mappa");
}
