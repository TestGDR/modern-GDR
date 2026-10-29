import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { BackToUtility, Registry, type RegistryEntry } from "@/components/game/utility";
import { requirePlayer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Anagrafe" };

export default function Page() {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Anagrafe" subtitle="Tutti gli iscritti della land." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePlayer();
  const supabase = await createClient();
  // Tutti gli iscritti: i dati del personaggio solo se la scheda è approvata
  const { data } = await supabase.rpc("registry");
  return <Registry people={(data as RegistryEntry[] | null) ?? []} />;
}
