"use client";

import { useEffect, useMemo, useState } from "react";
import { Bandage } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatPresent } from "@/lib/data";
import { firstName } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Chat → Incidente: un incidente fuori dal combattimento (taglio, caduta, moto…).
// Il database tira danno e resistenza (incident_roll), toglie i PF, apre la ferita e scrive l'esito in chat.

export type IncidentTier = "lieve" | "normale" | "medio" | "grave";
export type IncidentType = {
  id: string;
  name: string;
  tier: IncidentTier;
  dice_count: number;
  dice_sides: number;
  bonus: number;
  cd: number;
  description: string;
  sort_order: number;
  active: boolean;
};

export const TIER_LABEL: Record<IncidentTier, string> = { lieve: "Lieve", normale: "Normale", medio: "Medio", grave: "Grave" };
export const TIER_TONE: Record<IncidentTier, string> = { lieve: "text-mint", normale: "text-sand", medio: "text-peach", grave: "text-destructive" };
const TIERS: IncidentTier[] = ["lieve", "normale", "medio", "grave"];
const ZONES = [
  { id: "", label: "A caso" },
  { id: "testa", label: "Testa" },
  { id: "tronco", label: "Tronco" },
  { id: "braccio", label: "Braccio" },
  { id: "gamba", label: "Gamba" },
];

/** Danno in dadi: 2d6+4 */
export const diceText = (t: Pick<IncidentType, "dice_count" | "dice_sides" | "bonus">) => `${t.dice_count}d${t.dice_sides}${t.bonus ? `+${t.bonus}` : ""}`;

const selectCls = "h-9 w-full rounded-lg border border-white/15 bg-night/40 px-2.5 text-sm";

export function IncidentPanel({
  roomId,
  me,
  present,
  isMaster,
  onDone,
  onError,
}: {
  roomId: string;
  me: { id: string; name: string };
  present: ChatPresent[];
  isMaster: boolean;
  onDone: () => void;
  onError: (msg: string | null) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [types, setTypes] = useState<IncidentType[]>([]);
  const [typeId, setTypeId] = useState("");
  const [zone, setZone] = useState("");
  const [target, setTarget] = useState(me.id);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase
      .from("incident_types")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .order("name")
      .then(({ data }) => {
        if (alive) setTypes((data ?? []) as IncidentType[]);
      });
    return () => {
      alive = false;
    };
  }, [supabase]);

  const chosen = types.find((t) => t.id === typeId) ?? null;
  // il Master può farlo capitare a chiunque sia in giocata
  const targets = isMaster ? [me, ...present.filter((p) => p.character_id !== me.id).map((p) => ({ id: p.character_id, name: p.name }))] : [me];

  async function roll() {
    if (!chosen) return;
    setBusy(true);
    onError(null);
    const { error } = await supabase.rpc("incident_roll", { p_room: roomId, p_character: target, p_type: chosen.id, p_zone: zone || null });
    setBusy(false);
    if (error) return onError(error.message);
    setTypeId("");
    onDone();
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Per gli incidenti fuori dal combattimento: un taglio in cucina, una caduta in bici, un volo dalla moto. Il danno lo decidono i dadi; Vigore + Resistenza fisica + d10 contro la
        difficoltà lo dimezza. Con un danno alto arriva una ferita, che dà un malus ai tiri finché non guarisce.
      </p>
      {isMaster && targets.length > 1 && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          A chi capita
          <select className={selectCls} value={target} onChange={(e) => setTarget(e.target.value)}>
            {targets.map((p) => (
              <option key={p.id} value={p.id}>
                {firstName(p.name)}
                {p.id === me.id ? " (tu)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
        {TIERS.map((tier) => {
          const list = types.filter((t) => t.tier === tier);
          if (list.length === 0) return null;
          return (
            <div key={tier}>
              <p className={cn("mb-1 font-heading text-base tracking-wide", TIER_TONE[tier])}>{TIER_LABEL[tier]}</p>
              <div className="grid gap-1 sm:grid-cols-2">
                {list.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    title={t.description}
                    onClick={() => setTypeId(t.id)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-left text-xs",
                      typeId === t.id ? "border-flamingo bg-flamingo/25 text-foreground" : "border-white/10 bg-white/5 hover:bg-white/10",
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {chosen && (
        <p className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-muted-foreground">
          <strong className="text-foreground">{chosen.name}</strong>
          {chosen.description && ` — ${chosen.description}`} Danno {diceText(chosen)}, difficoltà {chosen.cd}.
        </p>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Dove si fa male (se arriva una ferita)
        <select className={selectCls} value={zone} onChange={(e) => setZone(e.target.value)}>
          {ZONES.map((z) => (
            <option key={z.id} value={z.id}>
              {z.label}
            </option>
          ))}
        </select>
      </label>
      <Button type="button" disabled={!chosen || busy} onClick={roll} className="rounded-full">
        <Bandage /> {busy ? "Tiro…" : "Tira l'incidente"}
      </Button>
    </div>
  );
}
