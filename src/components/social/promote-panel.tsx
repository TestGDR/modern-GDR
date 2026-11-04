"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Social → Promuovi: follower comprati e campagne sponsorizzate, pagati dal conto.
// Il database (social_buy) controlla soldi e pacchetto e decide se l'acquisto viene scoperto.

type Package = { id: string; name: string; description: string; kind: "follower" | "campagna"; amount: number; days: number; multiplier: number; price: number };

export function PromotePanel({ characterId, onDone }: { characterId: string; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from("social_packages")
      .select("id, name, description, kind, amount, days, multiplier, price")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => alive && setPackages((data ?? []) as Package[]));
    return () => {
      alive = false;
    };
  }, [supabase]);

  async function buy(p: Package) {
    if (!window.confirm(`Comprare «${p.name}» per ${p.price.toLocaleString("it-IT")} $?`)) return;
    setBusy(p.id);
    setMsg(null);
    const { data, error } = await supabase.rpc("social_buy", { p_character: characterId, p_package: p.id });
    setBusy(null);
    if (error) return setMsg({ ok: false, text: error.message });
    const r = data as { kind: string; caught: boolean };
    setMsg({
      ok: !r.caught,
      text:
        r.kind === "follower"
          ? r.caught
            ? "Fatto, ma qualcuno se n'è accorto: «Follower comprati» è finito nella tua infamia."
            : `Fatto: ${p.amount.toLocaleString("it-IT")} follower in più (calano un po' ogni giorno).`
          : `Campagna attiva per ${p.days} giorni: crescita e like ×${p.multiplier}.`,
    });
    onDone();
  }

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
      <h3 className="flex items-center gap-2 font-semibold">
        <Megaphone className="size-4 text-peach" /> Promuovi il profilo
      </h3>
      <p className="text-xs text-muted-foreground">
        Il tuo pubblico cresce da solo ogni giorno in base alla tua fama, se pubblichi. Qui puoi spingerlo pagando dal conto: i follower comprati calano col tempo e
        qualcuno potrebbe accorgersene.
      </p>
      {msg && <p className={msg.ok ? "text-sm text-mint" : "text-sm text-flamingo"}>{msg.text}</p>}
      {!packages ? (
        <Loader2 className="animate-spin text-muted-foreground" />
      ) : packages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun pacchetto in vendita.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {packages.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-night/30 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <strong className="font-medium">{p.name}</strong>
                {p.description && <span className="block text-xs text-muted-foreground">{p.description}</span>}
              </span>
              <Button type="button" size="sm" className="rounded-full" disabled={busy !== null} onClick={() => buy(p)}>
                {busy === p.id ? <Loader2 className="animate-spin" /> : `${p.price.toLocaleString("it-IT")} $`}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
