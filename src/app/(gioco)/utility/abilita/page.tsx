import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { SkillsReference } from "@/components/game/rules-reference";
import { BackToUtility } from "@/components/game/utility";
import { requirePlayer } from "@/lib/auth";
import { getRulesData } from "@/lib/data";

export const metadata: Metadata = { title: "Abilità" };

export default function Page() {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Abilità" subtitle="Caratteristiche e abilità con le descrizioni, da consultare." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePlayer();
  const { attributes, skills } = await getRulesData();
  return <SkillsReference attributes={attributes} skills={skills} />;
}
