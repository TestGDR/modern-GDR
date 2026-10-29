import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { BackToUtility, FaceClaims, type UtilityPerson } from "@/components/game/utility";
import { can, requirePlayer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Anagrafe prestavolti" };

export default function Page() {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Prestavolti" subtitle="I volti scelti dai giocatori: ognuno è unico in città." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const player = await requirePlayer();
  const supabase = await createClient();
  // Approvati di tutti, più i propri (anche in bozza); lo staff vede anche le altre schede
  const { data } = await supabase
    .from("characters")
    .select("id, name, avatar_url, occupation, face_claim, status")
    .not("face_claim", "is", null)
    .order("face_claim")
    .overrideTypes<UtilityPerson[], { merge: false }>();
  const c = player.character;
  return (
    <FaceClaims
      people={data ?? []}
      mine={c ? { id: c.id, name: c.name, face_claim: c.face_claim } : null}
      canManage={can(player, "prestavolti.gestire")}
    />
  );
}
