import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { SettingsManager } from "@/components/admin/settings-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { getLevels, getSettings } from "@/lib/admin-data";

export const metadata: Metadata = { title: "Impostazioni del sistema" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Impostazioni del sistema" subtitle="Valori di gioco modificabili senza toccare il codice." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("impostazioni.gestire");
  const [settings, levels] = await Promise.all([getSettings(), getLevels()]);
  // quelle dell'università stanno in Gestione → Università
  return <SettingsManager settings={settings.filter((s) => !s.key.startsWith("uni_"))} levels={levels} />;
}
