"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, signIn, signUp, updatePassword } from "@/lib/actions/auth";
import { NAME_MAX, NAME_MIN } from "@/lib/character-name";
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
  const confirmError = useSearchParams().get("errore") === "conferma";

  return (
    <form action={action} className="flex flex-col gap-4">
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
      <Field
        id="name"
        label="Nome e cognome del personaggio"
        autoComplete="username"
        placeholder="Es. Lena Moreno"
        defaultValue={state.values?.name}
        minLength={NAME_MIN}
        maxLength={NAME_MAX}
      />
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
