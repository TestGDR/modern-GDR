import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { PressManager } from "@/components/admin/press-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";

export const metadata: Metadata = { title: "Giornale e podcast" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Giornale e podcast" subtitle="Campus Wire: chi scrive e chi pubblica." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("giornale.gestire");
  return <PressManager />;
}
