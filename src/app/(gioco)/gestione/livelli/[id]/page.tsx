import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LevelEditor } from "@/components/admin/level-editor";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { getLevels } from "@/lib/admin-data";
import { isUuid } from "@/lib/data";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Modifica livello" };

export default function Page({ params }: PageProps<"/gestione/livelli/[id]">) {
  return (
    <>
      <Link href="/gestione/livelli" className="mb-3 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Livelli e permessi
      </Link>
      <Suspense fallback={<LoadingBlocks />}>
        <Content params={params} />
      </Suspense>
    </>
  );
}

async function Content({ params }: { params: PageProps<"/gestione/livelli/[id]">["params"] }) {
  const { id } = await params;
  const player = await requirePermission("livelli.gestire");
  if (!isUuid(id)) notFound();
  const levels = await getLevels();
  const level = levels.find((l) => l.id === id);
  if (!level) notFound();
  const isAdmin = player.level.is_admin;

  // L'Amministratore e i livelli di rango non inferiore al proprio non si modificano
  if (level.is_admin || (!isAdmin && level.rank >= player.level.rank)) {
    return (
      <>
        <PageHeader title={level.name} />
        <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">
          {level.is_admin
            ? "Il livello Amministratore ha sempre tutti i permessi e non si modifica."
            : "Non puoi modificare un livello di rango uguale o superiore al tuo."}
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader title={`Livello · ${level.name}`} />
      <LevelEditor
        level={level}
        myRank={player.level.rank}
        isAdmin={isAdmin}
        grantable={isAdmin ? ALL_PERMISSION_KEYS : player.level.permissions}
      />
    </>
  );
}
