import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { UsersManager } from "@/components/admin/users-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { getLevels, getSettings, getUsers } from "@/lib/admin-data";
import { can } from "@/lib/auth";
import { requestTime } from "@/lib/request-time";

export const metadata: Metadata = { title: "Utenti" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Utenti" />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const player = await requirePermission("livelli.assegnare", "utenti.vedere_modificare", "utenti.bandire");
  const [users, levels, settings, now] = await Promise.all([getUsers(), getLevels(), getSettings(), requestTime()]);
  const inactiveDays = Number(settings.find((s) => s.key === "giorni_inattivita")?.value ?? 30) || 30;
  return (
    <UsersManager
      users={users}
      levels={levels}
      myId={player.userId}
      myRank={player.level.rank}
      isAdmin={player.level.is_admin}
      canAssign={can(player, "livelli.assegnare")}
      canBan={can(player, "utenti.bandire")}
      inactiveDays={inactiveDays}
      now={now.getTime()}
    />
  );
}
