"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Home, KeyRound, Loader2, Save } from "lucide-react";
import { inputClass, textareaClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { formatDollars } from "@/lib/bank";
import { bySortThenName, type CharacterHome, type HomeMode, type HouseType } from "@/lib/housing";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Utility → Case: catalogo dello staff (comprare o affittare) e le mie case.
// Si paga con il conto: l'acquisto subito, l'affitto il primo mese subito e poi
// ogni mese con gli altri accrediti. Indirizzo e descrizione li scrive il giocatore.

type Tab = "agenzia" | "mie";
type Place = { id: string; name: string };

export function HomesApp({ characterId }: { characterId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("agenzia");
  const [types, setTypes] = useState<HouseType[] | null>(null);
  const [mine, setMine] = useState<CharacterHome[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [settings, setSettings] = useState({ max: 3, resale: 70 });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [t, h, l, bank, s] = await Promise.all([
      supabase.from("house_types").select("*").eq("active", true),
      characterId ? supabase.from("character_homes").select("*").eq("character_id", characterId).order("created_at") : Promise.resolve({ data: [] }),
      supabase.from("locations").select("id, name").order("name"),
      characterId ? supabase.from("bank_accounts").select("balance").eq("character_id", characterId).maybeSingle<{ balance: number }>() : Promise.resolve({ data: null }),
      supabase.from("game_settings").select("key, value").in("key", ["case_max", "case_rivendita_percento"]),
    ]);
    setTypes(((t.data ?? []) as HouseType[]).sort(bySortThenName));
    setMine((h.data ?? []) as CharacterHome[]);
    setPlaces((l.data ?? []) as Place[]);
    setBalance(bank.data?.balance ?? null);
    const value = (key: string, fallback: number) => Number((s.data ?? []).find((r: { key: string }) => r.key === key)?.value ?? fallback);
    setSettings({ max: value("case_max", 3), resale: value("case_rivendita_percento", 70) });
  }, [supabase, characterId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  async function take(t: HouseType, mode: HomeMode) {
    if (!characterId) return;
    const price = mode === "proprieta" ? t.buy_price : t.rent_price;
    const what = mode === "proprieta" ? `Comprare ${t.name} per ${formatDollars(price ?? 0)}?` : `Prendere in affitto ${t.name} per ${formatDollars(price ?? 0)} al mese? Il primo mese si paga subito.`;
    if (!window.confirm(what)) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error: e } = await supabase.rpc("home_take", { p_character: characterId, p_type: t.id, p_mode: mode });
    setBusy(false);
    if (e) return setError(e.message);
    setInfo(`${t.name}: è tua! Scrivi l'indirizzo in «Le mie case».`);
    setTab("mie");
    load();
  }
  async function release(h: CharacterHome) {
    const back = Math.floor((h.price_paid * settings.resale) / 100);
    const what = h.mode === "proprieta" ? `Vendere ${h.name}? Tornano sul conto ${formatDollars(back)}.` : `Disdire l'affitto di ${h.name}?`;
    if (!window.confirm(what)) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error: e } = await supabase.rpc("home_release", { p_home: h.id });
    setBusy(false);
    if (e) return setError(e.message);
    setInfo(h.mode === "proprieta" ? "Casa venduta." : "Affitto disdetto.");
    load();
  }

  if (!types) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex gap-1 rounded-full bg-white/5 p-1">
          <TabButton active={tab === "agenzia"} onClick={() => setTab("agenzia")}>
            <Home className="size-3.5" /> Agenzia immobiliare
          </TabButton>
          {characterId && (
            <TabButton active={tab === "mie"} onClick={() => setTab("mie")}>
              <KeyRound className="size-3.5" /> Le mie case {mine.length > 0 && <span className="text-peach">{mine.length}</span>}
            </TabButton>
          )}
        </nav>
        {balance !== null && <span className="ml-auto rounded-full bg-sand/15 px-3 py-1 text-xs text-sand">Sul conto: {formatDollars(balance)}</span>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && <p className="text-sm text-mint">{info}</p>}

      {tab === "mie" ? (
        <section className="flex flex-col gap-2">
          {mine.length === 0 && <p className="text-sm text-muted-foreground">Non hai ancora una casa.</p>}
          {mine.map((h) => (
            <MyHome key={h.id} home={h} places={places} resale={settings.resale} busy={busy} onRelease={() => release(h)} onSaved={load} />
          ))}
        </section>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Puoi avere fino a {settings.max} case. L&apos;affitto si paga ogni mese insieme agli altri accrediti (Utility → Servizi bancari); vendendo una casa comprata torna il{" "}
            {settings.resale}% del prezzo.
          </p>
          {types.length === 0 && <p className="text-sm text-muted-foreground">L&apos;agenzia non ha ancora case da proporre.</p>}
          <ul className="grid gap-2 sm:grid-cols-2">
            {types.map((t) => (
              <li key={t.id} className="glass flex flex-col gap-2 rounded-xl p-3">
                <div className="flex items-start gap-3">
                  <Thumb url={t.image_url} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{t.name}</span>
                    <span className="block text-xs whitespace-pre-line text-muted-foreground">{t.description}</span>
                  </span>
                </div>
                {characterId && (
                  <div className="mt-auto flex flex-wrap justify-end gap-2">
                    {t.rent_price !== null && (
                      <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => take(t, "affitto")}>
                        Affitta · {formatDollars(t.rent_price)}/mese
                      </Button>
                    )}
                    {t.buy_price !== null && (
                      <Button type="button" size="sm" className="rounded-full" disabled={busy} onClick={() => take(t, "proprieta")}>
                        Compra · {formatDollars(t.buy_price)}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!characterId && <p className="text-sm text-muted-foreground">Per comprare o affittare serve un personaggio approvato.</p>}
        </>
      )}
    </div>
  );
}

function MyHome({ home, places, resale, busy, onRelease, onSaved }: { home: CharacterHome; places: Place[]; resale: number; busy: boolean; onRelease: () => void; onSaved: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState({ address: home.address, location_id: home.location_id ?? "", description: home.description });
  const [state, setState] = useState<{ saving: boolean; error: string | null; saved: boolean }>({ saving: false, error: null, saved: false });
  const changed = f.address !== home.address || (f.location_id || null) !== home.location_id || f.description !== home.description;

  async function save() {
    setState({ saving: true, error: null, saved: false });
    const { error: e } = await supabase
      .from("character_homes")
      .update({ address: f.address.trim().slice(0, 120), location_id: f.location_id || null, description: f.description.trim().slice(0, 1000) })
      .eq("id", home.id);
    setState({ saving: false, error: e?.message ?? null, saved: !e });
    if (!e) onSaved();
  }

  return (
    <article className="glass flex flex-col gap-2 rounded-xl p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Thumb url={home.image_url} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{home.name}</span>
          <span className={cn("text-xs", home.mode === "affitto" ? "text-lavender" : "text-sand")}>
            {home.mode === "affitto" ? `In affitto · ${formatDollars(home.rent)} al mese` : `Di proprietà${home.price_paid > 0 ? ` · pagata ${formatDollars(home.price_paid)}` : ""}`}
          </span>
        </span>
        <Button type="button" size="sm" variant="ghost" className="rounded-full text-flamingo" disabled={busy} onClick={onRelease}>
          {home.mode === "affitto" ? "Disdici l'affitto" : `Vendi (${formatDollars(Math.floor((home.price_paid * resale) / 100))})`}
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_14rem]">
        <input className={inputClass} value={f.address} maxLength={120} placeholder="Indirizzo (es. 1240 Ocean Drive, interno 5)" onChange={(e) => setF({ ...f, address: e.target.value })} />
        <select className={inputClass} value={f.location_id} onChange={(e) => setF({ ...f, location_id: e.target.value })} aria-label="Quartiere">
          <option value="">Quartiere…</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <textarea className={textareaClass} value={f.description} maxLength={1000} placeholder="Com'è la casa dentro (facoltativo)" onChange={(e) => setF({ ...f, description: e.target.value })} />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={!changed || state.saving} onClick={save}>
          <Save /> Salva
        </Button>
        {state.saved && !changed && <span className="text-xs text-mint">Salvato.</span>}
        {state.error && <span className="text-xs text-destructive">{state.error}</span>}
      </div>
    </article>
  );
}

function Thumb({ url }: { url: string | null }) {
  if (!url)
    return (
      <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-white/5">
        <Home className="size-5 text-muted-foreground" />
      </span>
    );
  // immagine esterna scelta dallo staff
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="size-14 shrink-0 rounded-lg object-cover" />;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs", active ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:bg-white/5")}>
      {children}
    </button>
  );
}
