"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, signUp } from "@/lib/actions/auth";
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

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initial);
  const confirmError = useSearchParams().get("errore") === "conferma";

  return (
    <form action={action} className="flex flex-col gap-4">
      {confirmError && !state.error && (
        <FormMessage state={{ error: "Il link di conferma non è valido o è scaduto. Prova ad accedere o registrati di nuovo." }} />
      )}
      <FormMessage state={state} />
      <Field id="email" label="Email" type="email" autoComplete="email" placeholder="tu@email.com" defaultValue={state.values?.email} />
      <Field id="password" label="Password" type="password" autoComplete="current-password" />
      <Button type="submit" size="lg" disabled={pending} className="mt-2 h-11 rounded-full text-base">
        {pending ? "Accesso in corso…" : "Entra"}
      </Button>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, initial);

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
      <Field
        id="username"
        label="Nome utente (fuori dal gioco)"
        autoComplete="username"
        defaultValue={state.values?.username}
        minLength={3}
        maxLength={24}
        pattern="[a-zA-Z0-9_.]{3,24}"
        title="3-24 caratteri: lettere, numeri, punto o trattino basso"
      />
      <Field id="email" label="Email" type="email" autoComplete="email" placeholder="tu@email.com" defaultValue={state.values?.email} />
      <Field id="password" label="Password (almeno 8 caratteri)" type="password" autoComplete="new-password" minLength={8} />
      <Button type="submit" size="lg" disabled={pending} className="mt-2 h-11 rounded-full text-base">
        {pending ? "Registrazione in corso…" : "Registrati"}
      </Button>
    </form>
  );
}
