import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { TraitsReference } from "@/components/game/rules-reference";
import { BackToUtility } from "@/components/game/utility";
import { requirePlayer } from "@/lib/auth";
import { getRulesData } from "@/lib/data";

export const metadata: Metadata = { title: "Vantaggi e tratti" };

export default function Page() {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Vantaggi e tratti" subtitle="Tutti i vantaggi, gli svantaggi e i tratti con le descrizioni, da consultare." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePlayer();
  const { options } = await getRulesData();
  return <TraitsReference options={options} />;
}
