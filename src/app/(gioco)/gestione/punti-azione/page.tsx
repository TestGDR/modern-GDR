import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { ActionPointsManager } from "@/components/admin/action-points-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";

export const metadata: Metadata = { title: "Azioni in chat" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Azioni in chat" subtitle="L'attività in chat della settimana e i pacchetti di PX del lunedì." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("personaggi.assegnare_px");
  return <ActionPointsManager />;
}
