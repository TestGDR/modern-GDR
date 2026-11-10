import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { AssignPanel, GroupCategoriesEditor, OrgsManager, PanelTabs, TeamsDescriptions } from "@/components/admin/orgs-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { loadGroupCategories, loadOrgs } from "@/lib/orgs-data";
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
  const [orgs, categories, { data: characters }] = await Promise.all([
    loadOrgs("group"),
    loadGroupCategories(),
    supabase.from("characters").select("id, name").eq("status", "approvata").order("name").overrideTypes<{ id: string; name: string }[], { merge: false }>(),
  ]);
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">Le squadre sportive le crea e le gestisce Gestione → Sport, dove nel Roster si inseriscono e si tolgono gli atleti; qui, nella linguetta Squadre, se ne scrive la descrizione.</p>
      <PanelTabs
        initial={1}
        tabs={[
          { label: "Ambiti", content: <GroupCategoriesEditor categories={categories} /> },
          { label: "Gruppi", content: <OrgsManager kind="group" orgs={orgs.filter((o) => !o.sport)} characters={characters ?? []} categories={categories} /> },
          { label: "Assegna ruolo", content: <AssignPanel kind="group" orgs={orgs.filter((o) => !o.sport)} characters={characters ?? []} /> },
          { label: "Squadre", content: <TeamsDescriptions teams={orgs.filter((o) => o.sport)} /> },
        ]}
      />
    </>
  );
}
