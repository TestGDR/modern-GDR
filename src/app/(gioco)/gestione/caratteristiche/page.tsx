import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { AttributesManager } from "@/components/admin/attributes-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { getAllRules, getRulesUsage } from "@/lib/admin-data";

export const metadata: Metadata = { title: "Caratteristiche" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Caratteristiche" />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("regole.gestire");
  const [{ attributes, skills }, usage] = await Promise.all([getAllRules(), getRulesUsage()]);
  const skillCount: Record<string, number> = {};
  for (const s of skills) skillCount[s.attribute_id] = (skillCount[s.attribute_id] ?? 0) + 1;
  return <AttributesManager attributes={attributes} skillCount={skillCount} usage={usage} />;
}
