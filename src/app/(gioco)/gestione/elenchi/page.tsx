import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { SheetListsManager } from "@/components/admin/sheet-lists-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { getAllRules } from "@/lib/admin-data";

export const metadata: Metadata = { title: "Elenchi della scheda" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Elenchi della scheda" subtitle="Indirizzi di studio, anni di corso, squadre e club." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("elenchi.gestire");
  const { sheetOptions } = await getAllRules();
  return <SheetListsManager options={sheetOptions} />;
}
