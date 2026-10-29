import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { OrgsManager } from "@/components/admin/orgs-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { loadOrgs } from "@/lib/orgs-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lavori" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Lavori" subtitle="Crea lavori full time e part time, i loro ruoli e stipendi, e assegnali ai personaggi." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("lavori.gestire");
  const supabase = await createClient();
  const [orgs, { data: characters }] = await Promise.all([
    loadOrgs("job"),
    supabase.from("characters").select("id, name").eq("status", "approvata").order("name").overrideTypes<{ id: string; name: string }[], { merge: false }>(),
  ]);
  return <OrgsManager kind="job" orgs={orgs} characters={characters ?? []} />;
}
