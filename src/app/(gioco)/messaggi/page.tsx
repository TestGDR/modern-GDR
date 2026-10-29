import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { MessagesApp, type Contact } from "@/components/game/messages-app";
import { redirect } from "next/navigation";
import { can, requirePlayer } from "@/lib/auth";
import { isUuid } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messaggi" };

// /messaggi?a=<utente>: i messaggi OFF (tra giocatori), eventualmente con la
// conversazione con quell'utente già aperta. I messaggi ON ora sono il Telefono.
export default function MessaggiPage({ searchParams }: PageProps<"/messaggi">) {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/messaggi">["searchParams"] }) {
  const params = await searchParams;
  if (params.canale === "on") redirect("/telefono");
  const to = typeof params.a === "string" && isUuid(params.a) ? params.a : null;
  const player = await requirePlayer();

  // Il proprio nome e quello di chi si apre subito (nome del personaggio se approvato)
  const supabase = await createClient();
  const ids = to && to !== player.userId ? [player.userId, to] : [player.userId];
  const { data } = await supabase.rpc("player_cards", { p_users: ids });
  const cards = ((data ?? []) as { user_id: string; name: string; avatar_url: string | null }[]).map(
    (r): Contact => ({ id: r.user_id, name: r.name, avatar: r.avatar_url }),
  );
  const me = cards.find((c) => c.id === player.userId) ?? { id: player.userId, name: player.profile.username, avatar: null };
  const initialTo = to ? (cards.find((c) => c.id === to && c.id !== player.userId) ?? null) : null;

  return (
    // occupa tutta la finestra: scorrono solo l'elenco delle chat e la conversazione
    <div className="flex h-full min-h-[420px] flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <h1 className="mr-2 font-heading text-3xl tracking-wide">Messaggi OFF</h1>
        <span className="text-sm text-muted-foreground">Tra giocatori, fuori gioco. Per i messaggi tra personaggi usa il Telefono.</span>
      </div>
      <MessagesApp
        key={to ?? ""}
        channel="off"
        me={me}
        initialTo={initialTo}
        canBroadcast={can(player, "annunci.globali") || can(player, "messaggi.tutti")}
      />
    </div>
  );
}
