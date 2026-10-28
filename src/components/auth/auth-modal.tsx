"use client";

import { createContext, Suspense, use, useCallback, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { FloatingWindow } from "@/components/floating-window";
import { LoginForm, PasswordResetForm, SignUpForm } from "@/components/auth/auth-forms";

type Mode = "login" | "signup" | "reset";

const AuthModalContext = createContext<((mode: Mode) => void) | null>(null);

const titles: Record<Mode, { title: string; subtitle: string; label: string }> = {
  login: { title: "Bentornato", subtitle: "Accedi per tornare in gioco.", label: "Accedi" },
  signup: { title: "Benvenuto a Miami", subtitle: "Crea il tuo account, poi il tuo personaggio.", label: "Registrati" },
  reset: { title: "Password dimenticata", subtitle: "Ti mandiamo un link per sceglierne una nuova.", label: "Recupera password" },
};

/** Avvolge la home: i pulsanti "Accedi" e "Registrati" aprono la finestra invece di cambiare pagina */
export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const close = useCallback(() => setMode(null), []);
  const t = mode ? titles[mode] : null;

  return (
    <AuthModalContext value={setMode}>
      {children}
      {mode && t && (
        <FloatingWindow
          label={t.label}
          onClose={close}
          header={
            <div className="pt-2 pb-5 text-center">
              <Logo href={null} size="sm" className="items-center" />
              <h2 className="mt-5 font-heading text-3xl tracking-wide">{t.title}</h2>
              <p className="text-sm text-muted-foreground">{t.subtitle}</p>
            </div>
          }
        >
          {/* key: ogni modulo riparte pulito quando si cambia scheda */}
          {mode === "login" && (
            <Suspense>
              <LoginForm key="login" onForgotPassword={() => setMode("reset")} />
            </Suspense>
          )}
          {mode === "signup" && <SignUpForm key="signup" inModal onGoToLogin={() => setMode("login")} />}
          {mode === "reset" && <PasswordResetForm key="reset" />}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                Non hai un account?{" "}
                <SwitchLink onClick={() => setMode("signup")}>Registrati</SwitchLink>
              </>
            ) : mode === "signup" ? (
              <>
                Hai già un account? <SwitchLink onClick={() => setMode("login")}>Accedi</SwitchLink>
              </>
            ) : (
              <SwitchLink onClick={() => setMode("login")}>Torna all&apos;accesso</SwitchLink>
            )}
          </p>
        </FloatingWindow>
      )}
    </AuthModalContext>
  );
}

function SwitchLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="font-medium text-flamingo hover:underline">
      {children}
    </button>
  );
}

/** Pulsante che apre la finestra di accesso o registrazione */
export function OpenAuthButton({ mode, className, children }: { mode: Mode; className?: string; children: React.ReactNode }) {
  const open = use(AuthModalContext);
  return (
    <button type="button" className={className} onClick={() => open?.(mode)}>
      {children}
    </button>
  );
}
