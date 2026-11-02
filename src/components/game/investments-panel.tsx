"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, PiggyBank } from "lucide-react";
import { inputClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { formatDollars } from "@/lib/bank";
import { RISK_LABEL, pctText, type InvestmentProduct, type InvestmentsOverview } from "@/lib/finance";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Servizi bancari → Investimenti: si versano soldi dal conto, il valore cambia ogni mese
// (conto deposito sicuro, fondo, azioni e cripto rischiose), si ritira con una commissione.

export function InvestmentsPanel({ characterId }: { characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<InvestmentsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: d, error: e } = await supabase.rpc("investments_overview", { p_character: characterId });
    if (e) setError(e.message);
    else setData(d as InvestmentsOverview);
  }, [supabase, characterId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  async function call(fn: string, args: Record<string, unknown>, done: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error: e } = await supabase.rpc(fn, args);
    setBusy(false);
    if (e) return setError(e.message);
    setInfo(done);
    load();
  }

  if (!data) return error ? <p className="text-sm text-destructive">{error}</p> : <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  const total = data.products.reduce((t, p) => t + (p.value ?? 0), 0);
  return (
    <section className="glass flex flex-col gap-3 rounded-2xl p-5">
      <div className="flex flex-wrap items-center gap-2">
        <PiggyBank className="size-5 text-mint" />
        <h2 className="font-heading text-2xl tracking-wide">Investimenti</h2>
        {total > 0 && <span className="ml-auto rounded-full bg-mint/15 px-3 py-1 text-xs text-mint">Investito ora: {formatDollars(total)}</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        Ogni {data.days} giorni il valore cambia da solo e ti arriva un messaggio. Versamento minimo {formatDollars(data.minimum)}; quando ritiri la banca trattiene il {data.fee}%.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && <p className="text-sm text-mint">{info}</p>}
      <ul className="grid gap-2 md:grid-cols-3">
        {data.products.map((p) => (
          <ProductCard key={p.id} product={p} characterId={characterId} minimum={data.minimum} busy={busy} call={call} />
        ))}
      </ul>
    </section>
  );
}

function ProductCard({
  product: p,
  characterId,
  minimum,
  busy,
  call,
}: {
  product: InvestmentProduct;
  characterId: string;
  minimum: number;
  busy: boolean;
  call: (fn: string, args: Record<string, unknown>, done: string) => void;
}) {
  const [amount, setAmount] = useState(minimum);
  const gain = p.value !== null && p.invested !== null ? p.value - p.invested : 0;
  const range = p.min_pct === p.max_pct ? `${pctText(p.min_pct)} al mese` : `da ${pctText(p.min_pct)} a ${pctText(p.max_pct)} al mese`;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-white/10 bg-night/30 p-3 text-sm">
      <div>
        <p className="font-medium">{p.name}</p>
        <p className={cn("text-[0.7rem]", p.risk === "alto" ? "text-flamingo" : p.risk === "medio" ? "text-peach" : "text-mint")}>
          {RISK_LABEL[p.risk]} · {range}
          {p.crash_chance > 0 && ` · ${p.crash_chance}% di crollo (${pctText(p.crash_pct)})`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
      </div>
      {p.value !== null && (
        <div className="rounded-lg bg-white/5 px-2 py-1.5 text-xs">
          Valore: <strong className="text-sand">{formatDollars(p.value)}</strong>
          <span className={cn("ml-1", gain >= 0 ? "text-mint" : "text-destructive")}>
            ({gain >= 0 ? "+" : ""}
            {formatDollars(gain)})
          </span>
          {p.history.length > 0 && (
            <span className="mt-0.5 block text-muted-foreground">
              Ultimi mesi: {p.history.map((h) => `${pctText(h.pct)}${h.crash ? " crollo" : ""}`).join(" · ")}
            </span>
          )}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <input className={cn(inputClass, "h-8 w-24")} type="number" min={minimum} step={100} value={amount} aria-label={`Quanto versare in ${p.name}`} onChange={(e) => setAmount(Number(e.target.value))} />
        <Button
          type="button"
          size="xs"
          disabled={busy || amount < minimum}
          onClick={() => window.confirm(`Versare ${formatDollars(amount)} in ${p.name}?`) && call("invest_deposit", { p_character: characterId, p_product: p.id, p_amount: Math.round(amount) }, `Versati ${formatDollars(amount)} in ${p.name}.`)}
        >
          Versa
        </Button>
        {p.value !== null && p.value > 0 && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => window.confirm(`Ritirare tutto da ${p.name} (${formatDollars(p.value ?? 0)}, meno la commissione)?`) && call("invest_withdraw", { p_character: characterId, p_product: p.id, p_amount: null }, `Ritirato tutto da ${p.name}.`)}
          >
            Ritira tutto
          </Button>
        )}
      </div>
    </li>
  );
}
