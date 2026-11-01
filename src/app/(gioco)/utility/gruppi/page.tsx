import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { OrgsView } from "@/components/game/orgs-view";
import { PageHeader } from "@/components/game/page-header";
import { BackToUtility } from "@/components/game/utility";
import { activeCharacter, requirePlayer } from "@/lib/auth";
import { loadGroupCategories, loadOrgs } from "@/lib/orgs-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Gruppi" };

type Params = Promise<{ apri?: string }>;

export default function Page({ searchParams }: { searchParams?: Params }) {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Gruppi" subtitle="Confraternite, squadre, associazioni: descrizioni, ruoli e membri." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams?: Params }) {
  const [player, params] = await Promise.all([requirePlayer(), searchParams ?? Promise.resolve({ apri: undefined })]);
  const supabase = await createClient();
  const [orgs, categories, { data: settings }] = await Promise.all([
    loadOrgs("group"),
    loadGroupCategories(),
    supabase.from("game_settings").select("key, value").in("key", ["stipendio_giorni", "max_gruppi"]).overrideTypes<{ key: string; value: number }[], { merge: false }>(),
  ]);
  const setting = (key: string, fallback: number) => Number(settings?.find((s) => s.key === key)?.value ?? fallback);
  return (
    <OrgsView
      key={params.apri ?? "elenco"}
      initialOpenId={params.apri ?? null}
      kind="group"
      orgs={orgs}
      categories={categories}
      characterId={activeCharacter(player)?.id ?? null}
      periodDays={Math.max(1, setting("stipendio_giorni", 1))}
      maxGroups={setting("max_gruppi", 3)}
    />
  );
}
