import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { IncidentManager } from "@/components/admin/incident-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";

export const metadata: Metadata = { title: "Incidenti" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Incidenti" subtitle="L'elenco del pannello «Incidente» della chat: gravità, dadi del danno e difficoltà." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("combattimento.gestire");
  return <IncidentManager />;
}
