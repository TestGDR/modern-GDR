"use client";

import { useEffect, useState } from "react";
import { HoverTip } from "@/components/game/hover-tip";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Icona del livello OFF (Amministratore, Master, Moderatore…), con il nome nel fumetto.

export function LevelIcon({ icon, name, className }: { icon: string | null | undefined; name: string | null | undefined; className?: string }) {
  if (!icon) return null;
  return (
    <HoverTip label={name ?? "Livello"} className="inline-flex shrink-0">
      {/* immagine esterna scelta dallo staff: niente ottimizzazione di Next */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon} alt={name ?? "Livello"} className={cn("size-4 object-contain", className)} />
    </HoverTip>
  );
}

/** Livello del proprietario di una scheda, letto dal database */
export function CharacterLevelIcon({ characterId, className, withName = false }: { characterId: string; className?: string; withName?: boolean }) {
  const [level, setLevel] = useState<{ name: string; icon_url: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    createClient()
      .rpc("character_owner_level", { p_character: characterId })
      .then(({ data }) => {
        if (alive) setLevel((data ?? null) as typeof level);
      });
    return () => {
      alive = false;
    };
  }, [characterId]);
  if (!level?.icon_url) return null;
  if (!withName) return <LevelIcon icon={level.icon_url} name={level.name} className={className} />;
  // icona con sotto il nome del livello (scheda)
  return (
    <span className="flex flex-col items-center gap-1">
      <LevelIcon icon={level.icon_url} name={level.name} className={className} />
      <span className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">{level.name}</span>
    </span>
  );
}
