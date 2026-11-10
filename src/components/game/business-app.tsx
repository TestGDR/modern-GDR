"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, Loader2, Pencil, TrendingUp } from "lucide-react";
import { inputClass } from "@/components/admin/admin-ui";
import { VenuesDirectory } from "@/components/game/venue";
import { Button } from "@/components/ui/button";
import { formatDollars } from "@/lib/bank";
import { OUTCOME_LABEL, type BusinessReport, type BusinessType, type CharacterBusiness } from "@/lib/finance";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Utility → Attività: si compra un'attività dal catalogo, si gestisce una volta al mese
// con un tiro (caratteristica + abilità + d10) e l'incasso arriva sul conto.
// Regole e controlli sono nel database (business_*).

type Skill = { id: string; name: string; attribute: string };

export function BusinessApp({ characterId }: { characterId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [types, setTypes] = useState<BusinessType[] | null>(null);
  const [mine, setMine] = useState<CharacterBusiness | null>(null);
  const [reports, setReports] = useState<BusinessReport[]>([]);
  const [skills, setSkills] = useState<Record<string, Skill>>({});
  const [settings, setSettings] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const [t, b, s, g] = await Promise.all([
      supabase.from("business_types").select("*").eq("active", true).order("sort_order"),
      characterId ? supabase.from("character_businesses").select("*").eq("character_id", characterId).maybeSingle<CharacterBusiness>() : Promise.resolve({ data: null }),
      supabase.from("skills").select("id, name, attribute:attributes(code)"),
      supabase.from("game_settings").select("key, value").or("key.like.attivita_%,key.eq.locale_incasso_pct"),
    ]);
    setTypes((t.data ?? []) as BusinessType[]);
    setMine((b.data as CharacterBusiness | null) ?? null);
    setSkills(
      Object.fromEntries(
        ((s.data ?? []) as unknown as { id: string; name: string; attribute: { code: string } | null }[]).map((x) => [x.id, { id: x.id, name: x.name, attribute: x.attribute?.code ?? "" }]),
      ),
    );
    setSettings(Object.fromEntries(((g.data ?? []) as { key: string; value: number }[]).map((x) => [x.key, Number(x.value)])));
    if (b.data) {
      const { data: r } = await supabase.from("business_reports").select("*").eq("business_id", (b.data as CharacterBusiness).id).order("created_at", { ascending: false }).limit(6);
      setReports((r ?? []) as BusinessReport[]);
    } else setReports([]);
    setNow(Date.now());
  }, [supabase, characterId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  async function call(fn: string, args: Record<string, unknown>, done?: (data: unknown) => string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    const { data, error: e } = await supabase.rpc(fn, args);
    setBusy(false);
    if (e) return setError(e.message);
    if (done) setInfo(done(data));
    load();
  }

  if (!types) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  const days = settings.attivita_giorni ?? 30;
  const skillText = (id: string | null) => (id && skills[id] ? `${skills[id].attribute} + ${skills[id].name}` : "—");

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-xl bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>}
      {info && <p className="rounded-xl bg-mint/15 px-3 py-2 text-sm text-mint">{info}</p>}

      {!characterId && <p className="text-sm text-muted-foreground">Per comprare un&apos;attività serve un personaggio approvato.</p>}

      {mine && (
        <MyBusiness
          business={mine}
          reports={reports}
          skill={skillText(mine.skill_id)}
          days={days}
          resale={settings.attivita_rivendita ?? 70}
          share={settings.locale_incasso_pct ?? 30}
          neglect={settings.attivita_trascurata ?? 2}
          now={now}
          busy={busy}
          onManage={() =>
            call("business_manage", { p_character: characterId }, (d) => {
              const r = d as { outcome: keyof typeof OUTCOME_LABEL; amount: number; total: number; cd: number };
              return `${OUTCOME_LABEL[r.outcome]} (${r.total} contro ${r.cd}): ${r.amount >= 0 ? "+" : ""}${formatDollars(r.amount)} sul conto.`;
            })
          }
          onRename={(name) => call("business_rename", { p_character: characterId, p_name: name }, () => "Nome cambiato.")}
          onSell={() => {
            const back = Math.round((mine.price_paid * (settings.attivita_rivendita ?? 70)) / 100);
            if (window.confirm(`Vendere ${mine.name}? Riprendi ${formatDollars(back)}.`))
              call("business_sell", { p_character: characterId }, () => `Venduta: +${formatDollars(back)} sul conto.`);
          }}
        />
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-xl tracking-wide text-peach">Attività in vendita</h2>
        <p className="text-xs text-muted-foreground">
          Una volta al mese la gestisci con un tiro (caratteristica + abilità + d10 contro {settings.attivita_cd ?? 14}): mese d&apos;oro +50%, normale la rendita, fiacco
          niente, disastroso perdi metà della rendita. Una sola attività per personaggio; si rivende al {settings.attivita_rivendita ?? 70}% del prezzo.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {types.map((t) => (
            <BusinessCard key={t.id} type={t} skill={skillText(t.skill_id)} canBuy={!!characterId && !mine} busy={busy} onBuy={(name) => call("business_buy", { p_character: characterId, p_type: t.id, p_name: name }, () => `${name || t.name} è tua!`)} />
          ))}
        </ul>
      </section>

      <VenuesDirectory />
    </div>
  );
}

function MyBusiness({
  business,
  reports,
  skill,
  days,
  resale,
  share,
  neglect,
  now,
  busy,
  onManage,
  onRename,
  onSell,
}: {
  business: CharacterBusiness;
  reports: BusinessReport[];
  skill: string;
  days: number;
  resale: number;
  share: number;
  neglect: number;
  now: number;
  busy: boolean;
  onManage: () => void;
  onRename: (name: string) => void;
  onSell: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(business.name);
  const next = new Date(business.managed_at).getTime() + days * 24 * 3600 * 1000;
  const ready = now >= next;
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-sand/30 bg-gradient-to-br from-violet/30 via-dusk/40 to-sand/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Briefcase className="size-5 text-sand" />
        {editing ? (
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onRename(name);
              setEditing(false);
            }}
          >
            <input className={cn(inputClass, "h-8")} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" size="sm" disabled={busy}>
              Salva
            </Button>
          </form>
        ) : (
          <>
            <h2 className="font-heading text-2xl tracking-wide">{business.name}</h2>
            <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Cambia nome" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
            </button>
          </>
        )}
        <span className="text-xs text-muted-foreground">{business.type_name}</span>
      </div>
      <p className="text-sm">
        Rendita del mese: <strong className="text-sand">{formatDollars(business.base_income)}</strong> · gestione: {skill} · pagata {formatDollars(business.price_paid)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" className="rounded-full" disabled={busy || !ready} onClick={onManage}>
          <TrendingUp /> Gestisci il mese
        </Button>
        {!ready && <span className="text-xs text-muted-foreground">Prossima gestione dal {new Date(next).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
        <Button type="button" size="sm" variant="ghost" className="ml-auto" disabled={busy} onClick={onSell}>
          Vendi ({resale}%)
        </Button>
      </div>
      <p className="text-[0.7rem] text-muted-foreground">
        Se non la gestisci entro 5 giorni dalla scadenza, va avanti da sola con −{neglect} al tiro.
      </p>
      <p className="text-[0.7rem] text-muted-foreground">
        Il tuo locale è nell&apos;elenco qui sotto: aprilo per scriverne descrizione e immagine. La chat dove si trova e i prodotti li decide lo staff; di ogni vendita
        ricevi il {share}% sul conto.
      </p>
      {reports.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap gap-x-2">
              <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}</span>
              <span className={cn(r.outcome === "oro" && "text-sand", r.outcome === "disastro" && "text-destructive")}>{OUTCOME_LABEL[r.outcome]}</span>
              <span>
                {r.amount >= 0 ? "+" : ""}
                {formatDollars(r.amount)}
              </span>
              <span className="text-muted-foreground">
                ({r.total} contro {r.cd}
                {r.auto ? ", automatica" : ""})
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BusinessCard({ type, skill, canBuy, busy, onBuy }: { type: BusinessType; skill: string; canBuy: boolean; busy: boolean; onBuy: (name: string) => void }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <li className="glass flex flex-col gap-1.5 rounded-xl p-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{type.name}</span>
        <span className="shrink-0 font-heading text-lg tracking-wide text-sand">{formatDollars(type.price)}</span>
      </div>
      <p className="text-xs text-muted-foreground">{type.description}</p>
      <p className="text-[0.7rem] text-lavender">
        Rendita {formatDollars(type.base_income)} al mese · gestione {skill}
      </p>
      {canBuy &&
        (open ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (window.confirm(`Comprare ${type.name} per ${formatDollars(type.price)}?`)) onBuy(name.trim());
            }}
          >
            <input className={cn(inputClass, "h-8")} value={name} maxLength={60} placeholder="Il nome del tuo locale (facoltativo)" onChange={(e) => setName(e.target.value)} />
            <Button type="submit" size="sm" disabled={busy}>
              Compra
            </Button>
          </form>
        ) : (
          <Button type="button" size="xs" variant="outline" className="self-start rounded-full" onClick={() => setOpen(true)}>
            Compra
          </Button>
        ))}
    </li>
  );
}
