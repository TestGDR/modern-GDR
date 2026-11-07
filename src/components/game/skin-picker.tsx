"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { SKINS, loadSkin, saveSkin, saveSkinImage, type Skin } from "@/lib/prefs";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Scheda → Modifica · Principale: «Scegli skin» (user_prefs.skin, dell'account).
// Si applica e si salva subito, senza premere Salva.

const PREVIEW: Record<Skin, string> = {
  classica: "bg-[linear-gradient(to_bottom,#271e4c,#4f3a78_70%,#6d4782)]",
  tramonto: "bg-[linear-gradient(to_bottom,#5a2c78_0%,#d9577f_45%,#ff9f5a_62%,#7d3f84_72%,#3d2466_92%,#22122e_100%)]",
};

export function SkinPicker() {
  const supabase = useMemo(() => createClient(), []);
  const [skin, setSkin] = useState<Skin | null>(null);
  // sfondo con l'immagine (per le skin che ce l'hanno)
  const [image, setImage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadSkin(supabase).then((s) => {
      if (!alive) return;
      setSkin(s.skin);
      setImage(s.image);
    });
    return () => {
      alive = false;
    };
  }, [supabase]);

  async function choose(next: Skin) {
    if (next === skin) return;
    setError(null);
    const ok = await saveSkin(supabase, next);
    if (ok) setSkin(next);
    else setError("Non sono riuscito a salvare la skin.");
  }

  async function toggleImage(on: boolean) {
    setError(null);
    const ok = await saveSkinImage(supabase, on);
    if (ok) setImage(on);
    else setError("Non sono riuscito a salvare la scelta dello sfondo.");
  }
  const hasImage = SKINS.find((s) => s.id === skin)?.image ?? false;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Scegli skin</p>
      <p className="-mt-1 text-xs text-muted-foreground">La grafica del sito, solo per te. Si cambia subito; con la modalità notte vale la grafica della notte.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {SKINS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => choose(s.id)}
            aria-pressed={skin === s.id}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-2 text-left text-sm transition",
              skin === s.id ? "border-flamingo bg-flamingo/15" : "border-white/10 bg-white/5 hover:bg-white/10",
            )}
          >
            <span className={cn("h-12 w-16 shrink-0 rounded-lg ring-1 ring-white/15", PREVIEW[s.id])} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 font-semibold">
                {s.label}
                {skin === s.id && <Check className="size-4 text-mint" />}
              </span>
              <span className="block text-xs text-muted-foreground">{s.description}</span>
            </span>
          </button>
        ))}
      </div>
      <label className={cn("flex items-center gap-2 text-sm", !hasImage && "opacity-50")}>
        <input type="checkbox" checked={image} disabled={!hasImage} onChange={(e) => toggleImage(e.target.checked)} className="size-4 accent-flamingo" />
        Mostra lo sfondo con l&apos;immagine
        <span className="text-xs text-muted-foreground">{hasImage ? "(spiaggia al tramonto; spento = tinta unita)" : "(questa skin non ha un'immagine)"}</span>
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
