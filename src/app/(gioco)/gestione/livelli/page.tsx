import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { LevelsManager } from "@/components/admin/levels-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { getLevels, getSettings, getUsers } from "@/lib/admin-data";

export const metadata: Metadata = { title: "Livelli e permessi" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Livelli e permessi" />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const player = await requirePermission("livelli.gestire");
  const [levels, users, settings] = await Promise.all([getLevels(), getUsers(), getSettings()]);
  const userCounts: Record<string, number> = {};
  for (const u of users) userCounts[u.level_id] = (userCounts[u.level_id] ?? 0) + 1;
  return (
    <LevelsManager
      levels={levels}
      userCounts={userCounts}
      myRank={player.level.rank}
      isAdmin={player.level.is_admin}
      defaultLevelSetting={settings.find((s) => s.key === "livello_predefinito") ?? null}
    />
  );
}
