"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bandage, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { CharacterHealth, HealthStatus, WoundSeverity, CombatZone } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<HealthStatus, string> = { ok: "In forma", fuori_combattimento: "Fuori combattimento", emergenza_medica: "Emergenza medica" };
const SEVERITY_LABEL: Record<WoundSeverity, string> = { lieve: "Lieve", moderata: "Moderata", grave: "Grave", molto_grave: "Molto grave" };
const ZONE_LABEL: Record<CombatZone, string> = { testa: "Testa", tronco: "Tronco", braccio: "Braccio", gamba: "Gamba" };
// cosa pesa la penalità di una ferita, per zona
const PENALTY_ON: Record<CombatZone, string> = { braccio: "Rissa, Parare e armi", gamba: "Schivare", testa: "decide lo staff", tronco: "sforzi fisici (decide lo staff)" };

/** PF, recupero e ferite: li vedono il proprietario e lo staff (character_health_get) */
export function HealthSection({ characterId, canManage }: { characterId: string; canManage: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [health, setHealth] = useState<CharacterHealth | null | "vietato" | "caricamento">("caricamento");

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("character_health_get", { p_character: characterId });
    if (error) return setHealth("vietato");
    setHealth((data as CharacterHealth | null) ?? null);
  }, [supabase, characterId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura della sezione
    load();
  }, [load]);

  if (health === "caricamento") return <p className="text-sm text-muted-foreground">Carico…</p>;
  if (health === "vietato") return <p className="text-sm text-muted-foreground">Non hai i permessi necessari.</p>;
  if (!health) return <p className="text-sm text-muted-foreground">La salute si conta dopo l&apos;approvazione della scheda.</p>;

  const pct = Math.round((health.hp / Math.max(1, health.max)) * 100);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-3">
          <HeartPulse className="size-5 self-center text-flamingo" />
          <p className="font-heading text-3xl tracking-wide">
            {health.hp} <span className="text-lg text-muted-foreground">/ {health.max} PF</span>
          </p>
          <span
            className={cn(
              "ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold",
              health.status === "ok" ? "bg-mint/20 text-mint" : "bg-destructive/20 text-destructive",
            )}
          >
            {STATUS_LABEL[health.status]}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuemin={0} aria-valuemax={health.max} aria-valuenow={health.hp} aria-label="Punti ferita">
          <div className={cn("h-full rounded-full", pct > 50 ? "bg-mint" : pct > 20 ? "bg-peach" : "bg-destructive")} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          PF massimi = Vigore × 10. Recupero: +{health.rec} PF ogni 24 ore dall&apos;ultima ferita. A 0 PF si è fuori combattimento, mai morti.
        </p>
      </div>

      <div>
        <h3 className="mb-2 font-heading text-xl tracking-wide text-peach">Ferite attive</h3>
        {health.wounds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna ferita.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {health.wounds.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                <Bandage className="size-4 text-flamingo" />
                <strong>{ZONE_LABEL[w.zone]}</strong>
                <span className="text-peach">{SEVERITY_LABEL[w.severity]}</span>
                {w.penalty < 0 && (
                  <span className="text-xs text-muted-foreground">
                    {w.penalty} a {PENALTY_ON[w.zone]}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDate(w.created_at)} · {w.heals_at ? `guarisce il ${formatDate(w.heals_at)}` : "la chiude lo staff"}
                </span>
                {canManage && <HealButton woundId={w.id} onDone={load} />}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Delle ferite conta solo la penalità peggiore, non si sommano.</p>
      </div>

      {canManage && <StaffHealth characterId={characterId} health={health} onDone={load} />}
    </div>
  );
}

function HealButton({ woundId, onDone }: { woundId: string; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  async function heal() {
    const reason = window.prompt("Motivo della guarigione (resta nel registro):");
    if (reason === null) return;
    setBusy(true);
    const { error } = await supabase.rpc("wound_staff_heal", { p_wound: woundId, p_reason: reason });
    setBusy(false);
    if (error) window.alert(error.message);
    onDone();
  }
  return (
    <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={heal} className="rounded-full">
      Guarisci
    </Button>
  );
}

/** Staff: PF e stato a mano, con il motivo (tutto nel registro della salute) */
function StaffHealth({ characterId, health, onDone }: { characterId: string; health: CharacterHealth; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [hp, setHp] = useState(health.hp);
  const [status, setStatus] = useState<HealthStatus>(health.status);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc("health_staff_set", { p_character: characterId, p_hp: hp, p_status: status, p_reason: reason });
    setBusy(false);
    if (e) return setError(e.message);
    setReason("");
    onDone();
  }

  const field = "h-9 rounded-lg border border-input bg-night/40 px-2 text-sm outline-none focus-visible:border-ring";
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-orchid/30 bg-orchid/10 p-3">
      <p className="font-heading text-lg tracking-wide text-orchid">Staff · salute</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          PF
          <input type="number" min={0} max={health.max} value={hp} onChange={(e) => setHp(Number(e.target.value))} className={cn(field, "w-20")} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Stato
          <select value={status} onChange={(e) => setStatus(e.target.value as HealthStatus)} className={field}>
            {(Object.keys(STATUS_LABEL) as HealthStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs">
          Motivo
          <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Es. cure in ospedale" className={field} />
        </label>
        <Button type="button" size="sm" disabled={busy || reason.trim().length < 3} onClick={save} className="rounded-full">
          Salva
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">L&apos;emergenza medica si usa solo con armi letali (Fase B). Ogni modifica resta nel registro.</p>
    </div>
  );
}
