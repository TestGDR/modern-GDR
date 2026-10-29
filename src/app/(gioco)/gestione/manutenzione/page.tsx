import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { MaintenancePanel } from "@/components/admin/site-managers";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";

export const metadata: Metadata = { title: "Manutenzione" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Manutenzione" subtitle="Pulizia del database, sempre con l'anteprima prima di eliminare." />
      <Suspense fallback={<LoadingBlocks count={1} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("manutenzione.sito");
  return <MaintenancePanel />;
}
