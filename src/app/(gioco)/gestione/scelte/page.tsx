import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { OptionsManager } from "@/components/admin/options-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { getAllRules, getRulesUsage, getSettings } from "@/lib/admin-data";
import { parseSettings } from "@/lib/interlock";

export const metadata: Metadata = { title: "Vantaggi, svantaggi e tratti" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Vantaggi, svantaggi e tratti" subtitle="Anche il tenore di vita." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("regole.gestire");
  const [{ options, skills }, usage, settings] = await Promise.all([getAllRules(), getRulesUsage(), getSettings()]);
  return <OptionsManager options={options} skills={skills} usage={usage} pxPerLevel={parseSettings(settings).pxPerLevel} />;
}
