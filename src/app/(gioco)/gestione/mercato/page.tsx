import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { MarketManager } from "@/components/admin/market-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";

export const metadata: Metadata = { title: "Mercato" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Mercato" subtitle="Oggetti in vendita, mercato nero, cariche e alterazioni di alcol e droghe; regali ai personaggi." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("mercato.gestire");
  return <MarketManager />;
}
