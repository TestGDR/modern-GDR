import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { BackToUtility, BankApp, type UtilityPerson } from "@/components/game/utility";
import { activeCharacter, requirePlayer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { BankOverview, BankTransaction } from "@/lib/types";

export const metadata: Metadata = { title: "Servizi bancari" };

export default function Page() {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Servizi bancari" subtitle="Il conto del tuo personaggio, lo stipendio e i soldi agli altri." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const player = await requirePlayer();
  const character = activeCharacter(player);
  if (!character) return <BankApp character={null} overview={null} transactions={[]} recipients={[]} />;
  const supabase = await createClient();
  // accrediti dovuti (di solito li ha già fatti il lavoro automatico ogni ora)
  await supabase.rpc("bank_settle", { p_character: character.id });
  const [{ data: overview }, { data: transactions }, { data: recipients }] = await Promise.all([
    supabase.rpc("bank_overview", { p_character: character.id }),
    supabase
      .from("bank_transactions")
      .select("*")
      .eq("character_id", character.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .overrideTypes<BankTransaction[], { merge: false }>(),
    // Si mandano soldi solo ai personaggi degli altri giocatori
    supabase
      .from("characters")
      .select("id, name, avatar_url")
      .eq("status", "approvata")
      .neq("owner_id", player.userId)
      .order("name")
      .overrideTypes<Pick<UtilityPerson, "id" | "name" | "avatar_url">[], { merge: false }>(),
  ]);
  return (
    <BankApp
      character={{ id: character.id, name: character.name }}
      overview={(overview as BankOverview | null) ?? null}
      transactions={transactions ?? []}
      recipients={recipients ?? []}
    />
  );
}
