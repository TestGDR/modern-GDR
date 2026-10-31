import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { SportManager } from "@/components/sport/sport-manager";
import { requirePermission } from "@/lib/admin";

export const metadata: Metadata = { title: "Sport" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Sport" subtitle="Athletic Department: stagioni e calendari, simulazione e pubblicazione dei risultati, roster, sport e università rivali, premi." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("sport.gestire");
  return <SportManager />;
}
