import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { OrgsManager } from "@/components/admin/orgs-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { loadOrgs } from "@/lib/orgs-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Gruppi" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Gruppi" subtitle="Crea i gruppi, i loro ruoli e stipendi, e assegnali ai personaggi." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("gruppi.gestire");
  const supabase = await createClient();
  const [orgs, { data: characters }] = await Promise.all([
    loadOrgs("group"),
    supabase.from("characters").select("id, name").eq("status", "approvata").order("name").overrideTypes<{ id: string; name: string }[], { merge: false }>(),
  ]);
  return <OrgsManager kind="group" orgs={orgs} characters={characters ?? []} />;
}
