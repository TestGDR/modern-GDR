import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { OptionRequestsManager } from "@/components/admin/option-requests-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";

export const metadata: Metadata = { title: "Voci nuove dei personaggi" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Voci nuove dei personaggi" subtitle="I personaggi già approvati possono aggiungere una volta voci del catalogo nuovo, pagandole con i PX rimasti." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("personaggi.approvare");
  return <OptionRequestsManager />;
}
