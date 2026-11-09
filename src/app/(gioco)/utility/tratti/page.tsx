import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { TraitsReference, type FameBgItem } from "@/components/game/rules-reference";
import { BackToUtility } from "@/components/game/utility";
import { requirePlayer } from "@/lib/auth";
import { getRulesData } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Vantaggi e tratti" };

export default function Page() {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Vantaggi e tratti" subtitle="Tutti i vantaggi, gli svantaggi, i tratti e le voci di background di fama, con le descrizioni, da consultare." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePlayer();
  const supabase = await createClient();
  const [{ options, settings }, { data: fame }] = await Promise.all([
    getRulesData(),
    supabase
      .from("fame_bg_items")
      .select("id, name, description, category, cost_pf, fame_points, infamy_points, social_followers")
      .eq("active", true)
      .order("category")
      .order("sort_order"),
  ]);
  const setting = (key: string, fallback: number) => Number(settings.find((s) => s.key === key)?.value ?? fallback);
  return (
    <TraitsReference
      options={options}
      fameItems={(fame ?? []) as FameBgItem[]}
      fameRules={{ pf: setting("fama_pf_iniziali", 10), maxFame: setting("fama_max_background", 40), maxFollowers: setting("social_bg_max", 50000) }}
    />
  );
}
