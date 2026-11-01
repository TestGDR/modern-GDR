"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleCheck, MailCheck } from "lucide-react";
import { FloatingWindow } from "@/components/floating-window";
import { cookiePolicy, legalVersion, privacyPolicy, signupIntro, termsOfService, type LegalSection } from "@/config/legal";
import { disclaimer } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword, requestPasswordReset, signIn, signUp, updatePassword } from "@/lib/actions/auth";
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

/** Avviso in primo piano dopo l'iscrizione: si chiude con "Ok!" */
function SignUpDone({ text, onOk }: { text: string; onOk: () => void }) {
  // sopra a tutto, anche fuori dalla finestra di iscrizione
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="iscrizione-ok" className="fixed inset-0 z-[100] grid place-items-center bg-night/70 p-4 backdrop-blur-sm">
      <div className="glass flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl p-6 text-center shadow-2xl">
        <CircleCheck className="size-12 text-mint" />
        <h2 id="iscrizione-ok" className="font-heading text-3xl tracking-wide text-sunset">
          Benvenuto!
        </h2>
        <p className="text-sm leading-relaxed">{text}</p>
        <Button type="button" onClick={onOk} autoFocus className="mt-2 h-11 w-full rounded-full text-base">
          Ok!
        </Button>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------- Consensi della registrazione ------------------------- */

type Doc = "disclaimer" | "terms" | "privacy" | "cookie";
const DOCS: Record<Doc, { title: string; sections: LegalSection[] }> = {
  disclaimer: { title: "Disclaimer", sections: [{ text: disclaimer }] },
  terms: { title: "Termini del servizio", sections: termsOfService },
  privacy: { title: "Privacy policy", sections: privacyPolicy },
  cookie: { title: "Cookie policy", sections: cookiePolicy },
};
type Consent = "disclaimer" | "terms" | "privacy" | "age";
/** Documenti da aprire (e richiudere) prima di poter spuntare la casella */
const CONSENT_DOCS: Record<Consent, Doc[]> = { disclaimer: ["disclaimer"], terms: ["terms"], privacy: ["privacy", "cookie"], age: [] };

function DocLink({ doc, onOpen }: { doc: Doc; onOpen: (d: Doc) => void }) {
  return (
    <button type="button" onClick={() => onOpen(doc)} className="font-semibold text-peach uppercase underline decoration-dotted underline-offset-4 hover:text-flamingo">
      {DOCS[doc].title}
    </button>
  );
}

export function SignUpForm({ inModal, onGoToLogin }: SignUpFormProps = {}) {
  const [state, action, pending] = useActionState(signUp, initial);
  // documenti aperti e richiusi, caselle spuntate
  const [read, setRead] = useState<Set<Doc>>(() => new Set());
  const [openDoc, setOpenDoc] = useState<Doc | null>(null);
  const [checked, setChecked] = useState<Record<Consent, boolean>>({ disclaimer: false, terms: false, privacy: false, age: false });
  const unlocked = (c: Consent) => CONSENT_DOCS[c].every((d) => read.has(d));
  const allChecked = (Object.keys(checked) as Consent[]).every((c) => checked[c]);
  const router = useRouter();
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
    // Ok!: dalla finestra della home si passa all'accesso, dalla pagina di iscrizione si torna alla home
    return <SignUpDone text={state.success} onOk={() => (onGoToLogin ? onGoToLogin() : router.push("/"))} />;
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {inModal && <input type="hidden" name="in_modal" value="1" />}
      <FormMessage state={state} />
      <Field id="first_name" label="Nome del personaggio" autoComplete="username" placeholder="Es. Lena" defaultValue={state.values?.first_name} minLength={2} maxLength={20} />
      <p className="-mt-2 text-xs text-muted-foreground">
        Solo il nome: è unico nel gioco, è quello con cui ti vedranno tutti e con cui entri. Una parola sola (es. Maria-Luisa). Il cognome lo scegli dopo, nella creazione
        del personaggio.
      </p>
      <Field id="email" label="Email" type="email" autoComplete="email" placeholder="tu@email.com" defaultValue={state.values?.email} />
      <Field id="password" label="Password (almeno 8 caratteri)" type="password" autoComplete="new-password" minLength={8} />
      <p className="text-xs text-muted-foreground">
        Con questo nome entrerai in gioco e accederai al sito. Riceverai un&apos;email per confermare l&apos;account; il resto della
        scheda lo completi poi da Scheda personaggio.
      </p>

      {/* consensi: le caselle con un documento si attivano dopo averlo aperto e richiuso */}
      <div className="flex flex-col gap-1 border-t border-white/10 pt-4">
        <p className="font-heading text-xl tracking-wide text-peach">Prima di iscriverti</p>
        <p className="text-sm leading-snug">{signupIntro}</p>
        <p className="text-xs text-muted-foreground">Versione dei documenti: {legalVersion}.</p>
      </div>
      <p className="rounded-xl border border-sand/40 bg-sand/10 px-3 py-2.5 text-sm leading-snug">
        Per registrarti devi spuntare tutte le caselle. I nomi in maiuscolo si aprono con un clic: leggili e chiudi la finestra, e la casella diventa attiva.
      </p>
      <div className="flex flex-col gap-2.5 text-sm">
        {(
          [
            ["disclaimer", <>Dichiaro di aver letto e accettato il <DocLink doc="disclaimer" onOpen={setOpenDoc} /></>],
            ["terms", <>Dichiaro di aver letto e accettato i <DocLink doc="terms" onOpen={setOpenDoc} /></>],
            ["privacy", <>Dichiaro di aver letto e accettato la <DocLink doc="privacy" onOpen={setOpenDoc} /> e la <DocLink doc="cookie" onOpen={setOpenDoc} /></>],
            ["age", <>Dichiaro di avere almeno 18 anni compiuti</>],
          ] as [Consent, React.ReactNode][]
        ).map(([key, text]) => {
          const enabled = unlocked(key);
          return (
            <div key={key} className="flex items-start gap-2.5">
              <input
                id={`consenso_${key}`}
                name={`accept_${key}`}
                type="checkbox"
                checked={checked[key]}
                disabled={!enabled}
                onChange={(e) => setChecked((c) => ({ ...c, [key]: e.target.checked }))}
                className="mt-0.5 size-4 shrink-0 accent-flamingo disabled:cursor-not-allowed disabled:opacity-40"
                title={enabled ? undefined : "Apri e chiudi il documento per attivarla"}
              />
              {/* niente <label>: il clic sul nome apre il documento */}
              <span className={enabled ? undefined : "text-muted-foreground"}>{text}</span>
            </div>
          );
        })}
      </div>

      <Button type="submit" size="lg" disabled={pending || !allChecked} className="mt-2 h-11 rounded-full text-base">
        {pending ? "Registrazione in corso…" : "Registrati"}
      </Button>
      {openDoc && (
        <FloatingWindow
          label={DOCS[openDoc].title}
          initialWidth={620}
          initialHeight={640}
          onClose={() => {
            setRead((r) => new Set(r).add(openDoc));
            setOpenDoc(null);
          }}
          header={<h2 className="pb-4 font-heading text-3xl tracking-wide">{DOCS[openDoc].title}</h2>}
        >
          <div className="flex flex-col gap-4 text-left text-sm leading-relaxed text-foreground/90">
            {openDoc !== "disclaimer" && <p className="text-xs text-muted-foreground">Versione: {legalVersion}</p>}
            {DOCS[openDoc].sections.map((s, i) => (
              <section key={s.heading ?? i} className="flex flex-col gap-1.5">
                {s.heading && <h3 className="font-heading text-lg tracking-wide text-peach">{s.heading}</h3>}
                {s.text.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </section>
            ))}
          </div>
        </FloatingWindow>
      )}
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
