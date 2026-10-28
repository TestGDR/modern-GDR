"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, Trash2 } from "lucide-react";
import type { ActionResult } from "@/lib/actions/admin";
import { cn } from "@/lib/utils";

// Pezzi comuni del pannello di gestione.

export const inputClass =
  "h-10 w-full rounded-lg border border-input bg-night/40 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
export const textareaClass =
  "min-h-20 w-full rounded-lg border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Esegue un'azione del pannello mostrando attesa ed errore */
export function useAdminAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function execute(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) onSuccess?.();
      else setError(result.error ?? "Operazione non riuscita.");
    });
  }
  return { pending, error, setError, execute };
}

export function BackToPanel() {
  return (
    <Link href="/gestione" className="mb-3 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Gestione
    </Link>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">
      {error}
    </p>
  );
}

export function FieldLabel({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm", className)}>
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Interruttore attiva/disattiva */
export function ActiveToggle({ checked, onChange, label = "Attiva" }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 rounded-full transition-colors", checked ? "bg-mint/70" : "bg-white/15")}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", checked ? "left-5.5" : "left-0.5")} />
      </button>
      {label}
    </label>
  );
}

/** Frecce su/giù per riordinare */
export function MoveButtons({ onMove, disabled, first, last }: { onMove: (d: -1 | 1) => void; disabled?: boolean; first: boolean; last: boolean }) {
  const cls = "grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-25";
  return (
    <span className="flex shrink-0">
      <button type="button" className={cls} disabled={disabled || first} onClick={() => onMove(-1)} aria-label="Sposta su">
        <ArrowUp className="size-4" />
      </button>
      <button type="button" className={cls} disabled={disabled || last} onClick={() => onMove(1)} aria-label="Sposta giù">
        <ArrowDown className="size-4" />
      </button>
    </span>
  );
}

/** Elimina con conferma */
export function DeleteButton({ onConfirm, what, disabled }: { onConfirm: () => void; what: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (window.confirm(`Eliminare ${what}? L'operazione non si può annullare.`)) onConfirm();
      }}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/15 hover:text-destructive disabled:opacity-25"
      aria-label={`Elimina ${what}`}
    >
      <Trash2 className="size-4" />
    </button>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.7rem]", active ? "bg-mint/15 text-mint" : "bg-white/10 text-muted-foreground")}>
      {active ? "attiva" : "disattivata"}
    </span>
  );
}
