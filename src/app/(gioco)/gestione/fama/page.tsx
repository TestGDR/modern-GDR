import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { FameManager } from "@/components/fame/fame-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { getSettings } from "@/lib/admin-data";

export const metadata: Metadata = { title: "Fama" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Fama" subtitle="Voci, badge, background, livelli e impostazioni della fama dei personaggi, e la crescita del social." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("fama.gestire");
  const settings = (await getSettings()).filter((s) => s.key.startsWith("fama_") || s.key.startsWith("social_"));
  return <FameManager settings={settings} />;
}
