import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { ForumManager } from "@/components/admin/forum-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { getLevels } from "@/lib/admin-data";
import { createClient } from "@/lib/supabase/server";
import { getForumSections } from "@/lib/data";

export const metadata: Metadata = { title: "Forum: sezioni e bacheche" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Forum" subtitle="Categorie e sezioni del forum, pubbliche o riservate." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("forum.sezioni");
  const supabase = await createClient();
  const [sections, levels, { data: groups }] = await Promise.all([
    getForumSections(),
    getLevels(),
    supabase.from("game_groups").select("id, name, kind").order("kind").order("sort_order").overrideTypes<{ id: string; name: string; kind: string }[], { merge: false }>(),
  ]);
  return <ForumManager sections={sections} levels={levels.map((l) => ({ id: l.id, name: l.name }))} groups={(groups ?? []).map((g) => ({ id: g.id, name: g.kind === "sport" ? `${g.name} (squadra)` : g.name }))} />;
}
