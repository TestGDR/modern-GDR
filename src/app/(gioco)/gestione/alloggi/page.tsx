import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { HousingManager } from "@/components/admin/housing-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";

export const metadata: Metadata = { title: "Alloggi" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Alloggi" subtitle="Dormitori del college con camere e residenti; catalogo delle case e case dei personaggi." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("alloggi.gestire");
  return <HousingManager />;
}
