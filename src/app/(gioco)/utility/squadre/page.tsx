import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { OrgsView } from "@/components/game/orgs-view";
import { PageHeader } from "@/components/game/page-header";
import { BackToUtility } from "@/components/game/utility";
import { activeCharacter, requirePlayer } from "@/lib/auth";
import { loadOrgs } from "@/lib/orgs-data";

export const metadata: Metadata = { title: "Squadre del college" };

type Params = Promise<{ apri?: string }>;

export default function Page({ searchParams }: { searchParams?: Params }) {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Squadre del college" subtitle="Le squadre sportive dell'università: descrizioni, ruoli in campo e atleti." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams?: Params }) {
  const [player, params, orgs] = await Promise.all([requirePlayer(), searchParams ?? Promise.resolve({ apri: undefined }), loadOrgs("group")]);
  return (
    <OrgsView
      key={params.apri ?? "elenco"}
      initialOpenId={params.apri ?? null}
      kind="group"
      teams
      orgs={orgs.filter((o) => o.sport)}
      characterId={activeCharacter(player)?.id ?? null}
      periodDays={1}
      maxGroups={0}
    />
  );
}
