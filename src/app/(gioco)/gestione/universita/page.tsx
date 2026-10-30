import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { UniversityManager } from "@/components/university/uni-manager";
import { requirePermission } from "@/lib/admin";
import { getSettings } from "@/lib/admin-data";

export const metadata: Metadata = { title: "Università" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Università" subtitle="Semestri, esami, corsi e indirizzi del college." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("universita.gestire");
  const settings = (await getSettings()).filter((s) => s.key.startsWith("uni_"));
  return <UniversityManager settings={settings} />;
}
