import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { BusinessManager } from "@/components/admin/business-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";

export const metadata: Metadata = { title: "Attività" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Attività" subtitle="I locali nelle chat, le attività in vendita e quelle dei personaggi." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("attivita.gestire");
  return <BusinessManager />;
}
