import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { SkillsManager } from "@/components/admin/skills-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { getAllRules, getRulesUsage } from "@/lib/admin-data";

export const metadata: Metadata = { title: "Abilità" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Abilità" />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("regole.gestire");
  const [{ attributes, skills }, usage] = await Promise.all([getAllRules(), getRulesUsage()]);
  // Ordinate per caratteristica, poi per ordine
  const order = new Map(attributes.map((a, i) => [a.id, i]));
  const sorted = [...skills].sort(
    (a, b) => (order.get(a.attribute_id) ?? 0) - (order.get(b.attribute_id) ?? 0) || a.sort_order - b.sort_order,
  );
  return <SkillsManager skills={sorted} attributes={attributes} usage={usage} />;
}
