import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { SocialApp } from "@/components/social/social-app";
import type { SocialView } from "@/components/social/social-ui";
import { activeCharacter, can, requirePlayer } from "@/lib/auth";
import { isUuid } from "@/lib/data";

export const metadata: Metadata = { title: "Social" };

// Social stile Instagram (tutto nel browser, regole nel database)
export default function SocialPage({ searchParams }: PageProps<"/social">) {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/social">["searchParams"] }) {
  const [player, params] = await Promise.all([requirePlayer(), searchParams]);
  const character = activeCharacter(player);
  const profilo = typeof params.profilo === "string" && isUuid(params.profilo) ? params.profilo : null;
  const dm = typeof params.dm === "string" && isUuid(params.dm) ? params.dm : null;
  const initialView: SocialView | null = dm && character ? { kind: "dm", id: dm } : profilo ? { kind: "profile", id: profilo } : null;
  return (
    <SocialApp
      me={character ? { id: character.id, name: character.name, avatar_url: character.avatar_url } : null}
      canModerate={can(player, "contenuti.moderare")}
      initialView={initialView}
    />
  );
}
