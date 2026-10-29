import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { OrgsView } from "@/components/game/orgs-view";
import { PageHeader } from "@/components/game/page-header";
import { BackToUtility } from "@/components/game/utility";
import { activeCharacter, requirePlayer } from "@/lib/auth";
import { loadOrgs } from "@/lib/orgs-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lavori" };

export default function Page() {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Lavori" subtitle="Full time e part time: descrizioni, ruoli e stipendi. Scegli qui il tuo." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const player = await requirePlayer();
  const supabase = await createClient();
  const [orgs, { data: settings }] = await Promise.all([
    loadOrgs("job"),
    supabase.from("game_settings").select("key, value").in("key", ["stipendio_giorni", "max_gruppi"]).overrideTypes<{ key: string; value: number }[], { merge: false }>(),
  ]);
  const setting = (key: string, fallback: number) => Number(settings?.find((s) => s.key === key)?.value ?? fallback);
  return (
    <OrgsView
      kind="job"
      orgs={orgs}
      characterId={activeCharacter(player)?.id ?? null}
      periodDays={Math.max(1, setting("stipendio_giorni", 1))}
      maxGroups={setting("max_gruppi", 3)}
    />
  );
}
