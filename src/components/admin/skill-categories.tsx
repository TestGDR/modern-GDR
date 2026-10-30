"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Abbinamento abilità → categorie di tiro (sociale, percezione, riflessi…):
// dice quali vantaggi, svantaggi e tratti valgono in un tiro.

const CATEGORIES = [
  ["sociale", "Sociale"],
  ["inganno", "Inganno"],
  ["percezione", "Percezione"],
  ["intuizione", "Intuizione"],
  ["volonta", "Volontà"],
  ["resistenza", "Resistenza"],
  ["fisico", "Fisico"],
  ["riflessi", "Riflessi"],
  ["manualita", "Manualità"],
  ["furtivita", "Furtività"],
  ["conoscenza", "Conoscenza"],
  ["arte", "Arte"],
] as const;

export function SkillCategories({ skills }: { skills: { id: string; name: string }[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [links, setLinks] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("skill_categories").select("skill_id, category");
    setLinks(new Set(((data ?? []) as { skill_id: string; category: string }[]).map((r) => `${r.skill_id}:${r.category}`)));
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  async function toggle(skillId: string, category: string) {
    setError(null);
    const key = `${skillId}:${category}`;
    const { error: e } = links.has(key)
      ? await supabase.from("skill_categories").delete().eq("skill_id", skillId).eq("category", category)
      : await supabase.from("skill_categories").insert({ skill_id: skillId, category });
    if (e) setError(e.message);
    load();
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-2xl tracking-wide text-peach">Categorie di tiro</h2>
      <p className="text-sm text-muted-foreground">
        Ogni abilità appartiene a una o più categorie: un vantaggio come «Sensi acuti (+2 percezione)» vale in tutti i tiri con un&apos;abilità di quella categoria, anche in combattimento.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ul className="glass divide-y divide-white/10 overflow-hidden rounded-2xl">
        {skills.map((s) => (
          <li key={s.id} className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center">
            <span className="text-sm sm:w-56 sm:shrink-0">{s.name}</span>
            <span className="flex flex-wrap gap-1">
              {CATEGORIES.map(([key, label]) => {
                const on = links.has(`${s.id}:${key}`);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(s.id, key)}
                    className={cn("rounded-full border px-2 py-0.5 text-[0.7rem]", on ? "border-flamingo bg-flamingo/25 text-white" : "border-white/10 text-muted-foreground hover:bg-white/5")}
                  >
                    {label}
                  </button>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
