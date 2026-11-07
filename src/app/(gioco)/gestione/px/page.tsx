import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { XpGrantManager } from "@/components/admin/xp-grant-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";

export const metadata: Metadata = { title: "Assegna PX" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Assegna PX" subtitle="PX dati o tolti ai personaggi, con il motivo. Il giocatore riceve un messaggio di SISTEMA." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("personaggi.assegnare_px");
  return <XpGrantManager />;
}
