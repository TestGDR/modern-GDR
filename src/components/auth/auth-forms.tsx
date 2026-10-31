"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword, requestPasswordReset, signIn, signUp, updatePassword } from "@/lib/actions/auth";
import { NAME_MAX, NAME_MIN } from "@/lib/character-name";
import { createClient } from "@/lib/supabase/client";
import type { FormState } from "@/lib/types";

const initial: FormState = {};

export function FormMessage({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-xl bg-destructive/15 px-3 py-2 text-sm text-destructive">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="rounded-xl bg-mint/15 px-3 py-2 text-sm text-mint">
        {state.success}
      </p>
    );
  }
  return null;
}

function Field({ id, label, ...props }: React.ComponentProps<"input"> & { id: string; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} required className="h-10 bg-night/40" {...props} />
    </div>
  );
}

export function LoginForm({ onForgotPassword }: { onForgotPassword?: () => void } = {}) {
  const [state, action, pending] = useActionState(signIn, initial);
  const params = useSearchParams();
  const confirmError = params.get("errore") === "conferma";
  const idle = params.get("inattivo") === "1";
  const expired = params.get("scaduta") === "1";

  return (
    <form action={action} className="flex flex-col gap-4">
      {idle && !state.error && <FormMessage state={{ success: "Sei stato disconnesso per inattività. Accedi di nuovo per tornare in gioco." }} />}
      {expired && !state.error && <FormMessage state={{ success: "La sessione è scaduta. Accedi di nuovo per tornare in gioco." }} />}
      {confirmError && !state.error && (
        <FormMessage state={{ error: "Il link non è valido o è scaduto. Prova ad accedere o richiedi un nuovo link." }} />
      )}
      <FormMessage state={state} />
      <Field id="name" label="Nome del personaggio" autoComplete="username" placeholder="Es. Lena Moreno" defaultValue={state.values?.name} />
      <Field id="password" label="Password" type="password" autoComplete="current-password" />
      {onForgotPassword ? (
        <button type="button" onClick={onForgotPassword} className="-mt-2 self-end text-xs text-muted-foreground hover:text-flamingo">
          Password dimenticata?
        </button>
      ) : (
        <Link href="/recupera-password" className="-mt-2 self-end text-xs text-muted-foreground hover:text-flamingo">
          Password dimenticata?
        </Link>
      )}
      <Button type="submit" size="lg" disabled={pending} className="h-11 rounded-full text-base">
        {pending ? "Accesso in corso…" : "Entra"}
      </Button>
    </form>
  );
}

type SignUpFormProps = {
  /** Nella finestra della home: niente cambio pagina, il riepilogo appare qui */
  inModal?: boolean;
  onGoToLogin?: () => void;
};

export function SignUpForm({ inModal, onGoToLogin }: SignUpFormProps = {}) {
  const [state, action, pending] = useActionState(signUp, initial);
  // Iscrizioni chiuse dallo staff (Gestione → Iscrizioni)
  const [closed, setClosed] = useState<string | null>(null);
  useEffect(() => {
    createClient()
      .from("signup_settings")
      .select("open, message")
      .maybeSingle<{ open: boolean; message: string }>()
      .then(({ data }) => setClosed(data && !data.open ? data.message || "Le iscrizioni sono chiuse in questo momento." : null));
  }, []);

  if (closed) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="font-semibold">Iscrizioni chiuse</p>
        <p className="text-sm text-muted-foreground">{closed}</p>
        {onGoToLogin && (
          <Button type="button" variant="outline" onClick={onGoToLogin} className="mt-2 h-11 w-full rounded-full text-base">
            Hai già un account? Accedi
          </Button>
        )}
      </div>
    );
  }

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="size-12 text-mint" />
        <p className="font-semibold">Registrazione completata!</p>
        <p className="text-sm text-muted-foreground">{state.success}</p>
        {onGoToLogin && (
          <Button type="button" onClick={onGoToLogin} className="mt-2 h-11 w-full rounded-full text-base">
            Accedi
          </Button>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {inModal && <input type="hidden" name="in_modal" value="1" />}
      <FormMessage state={state} />
      <div className="grid grid-cols-2 gap-3">
        <Field id="first_name" label="Nome del personaggio" autoComplete="username" placeholder="Es. Lena" defaultValue={state.values?.first_name} minLength={2} maxLength={20} />
        <Field id="last_name" label="Cognome" autoComplete="off" placeholder="Es. Moreno" defaultValue={state.values?.last_name} minLength={1} maxLength={NAME_MAX - NAME_MIN} />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Il nome è unico nel gioco: è quello con cui ti vedranno tutti e con cui entri. Una parola sola (es. Maria-Luisa).</p>
      <Field id="email" label="Email" type="email" autoComplete="email" placeholder="tu@email.com" defaultValue={state.values?.email} />
      <Field id="password" label="Password (almeno 8 caratteri)" type="password" autoComplete="new-password" minLength={8} />
      <p className="text-xs text-muted-foreground">
        Con questo nome entrerai in gioco e accederai al sito. Riceverai un&apos;email per confermare l&apos;account; il resto della
        scheda lo completi poi da Scheda personaggio.
      </p>
      <Button type="submit" size="lg" disabled={pending} className="mt-2 h-11 rounded-full text-base">
        {pending ? "Registrazione in corso…" : "Registrati"}
      </Button>
    </form>
  );
}

export function PasswordResetForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="size-12 text-mint" />
        <p className="text-sm">{state.success}</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <Field id="email" label="Email dell'account" type="email" autoComplete="email" placeholder="tu@email.com" defaultValue={state.values?.email} />
      <Button type="submit" size="lg" disabled={pending} className="mt-2 h-11 rounded-full text-base">
        {pending ? "Invio in corso…" : "Inviami il link"}
      </Button>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <Field id="password" label="Nuova password (almeno 8 caratteri)" type="password" autoComplete="new-password" minLength={8} />
      <Field id="confirm" label="Ripeti la nuova password" type="password" autoComplete="new-password" minLength={8} />
      <Button type="submit" size="lg" disabled={pending} className="mt-2 h-11 rounded-full text-base">
        {pending ? "Salvataggio…" : "Salva la nuova password"}
      </Button>
    </form>
  );
}

/** Cambio password dal gioco: password attuale e due volte quella nuova */
export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, initial);
  return (
    <form action={action} className="glass flex max-w-md flex-col gap-4 rounded-2xl p-5">
      <FormMessage state={state} />
      <Field id="current" label="Password attuale" type="password" autoComplete="current-password" />
      <Field id="password" label="Nuova password (almeno 8 caratteri)" type="password" autoComplete="new-password" minLength={8} />
      <Field id="confirm" label="Ripeti la nuova password" type="password" autoComplete="new-password" minLength={8} />
      <Button type="submit" disabled={pending} className="mt-1 h-10 self-start rounded-full">
        {pending ? "Salvataggio…" : "Cambia password"}
      </Button>
    </form>
  );
}

/** Avviso in home dopo la registrazione */
export function RegisteredBanner() {
  const registered = useSearchParams().get("registrato") === "1";
  if (!registered) return null;
  return (
    <div role="status" className="glass mx-auto mt-6 flex max-w-md items-start gap-3 rounded-2xl bg-night/60 p-4 text-left">
      <MailCheck className="mt-0.5 size-6 shrink-0 text-mint" />
      <div className="text-sm">
        <p className="font-semibold text-white">Registrazione completata!</p>
        <p className="text-white/80">
          Ti abbiamo mandato un&apos;email con il riepilogo dei tuoi dati. Conferma l&apos;account dal link, poi accedi.
        </p>
      </div>
    </div>
  );
}
