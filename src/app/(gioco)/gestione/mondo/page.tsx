import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { WorldManager } from "@/components/admin/world-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { getWorld } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mondo" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Mondo" subtitle="Mappe, quartieri e chat di Miami." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("mondo.gestire");
  const world = await getWorld();
  // Nomi dei proprietari delle chat su invito
  const ownerIds = [...new Set(world.rooms.flatMap((r) => (r.owner_character_id ? [r.owner_character_id] : [])))];
  let ownerNames: Record<string, string> = {};
  if (ownerIds.length) {
    const supabase = await createClient();
    const { data } = await supabase.from("characters").select("id, name").in("id", ownerIds).overrideTypes<{ id: string; name: string }[], { merge: false }>();
    ownerNames = Object.fromEntries((data ?? []).map((c) => [c.id, c.name]));
  }
  return <WorldManager world={world} ownerNames={ownerNames} />;
}
