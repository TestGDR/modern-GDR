import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { MessagesApp, type Contact } from "@/components/game/messages-app";
import { NeedsCharacter } from "@/components/game/needs-character";
import { activeCharacter, can, requirePlayer } from "@/lib/auth";
import { isUuid } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { Channel } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Messaggi" };

// /messaggi?canale=on|off&a=<utente>: i messaggi del canale, eventualmente
// con la conversazione con quell'utente già aperta
export default function MessaggiPage({ searchParams }: PageProps<"/messaggi">) {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/messaggi">["searchParams"] }) {
  const params = await searchParams;
  const channel: Channel = params.canale === "off" ? "off" : "on";
  const to = typeof params.a === "string" && isUuid(params.a) ? params.a : null;
  const player = await requirePlayer();
  const character = activeCharacter(player);

  // Il proprio nome e quello di chi si apre subito (nome del personaggio se approvato)
  const supabase = await createClient();
  const ids = to && to !== player.userId ? [player.userId, to] : [player.userId];
  const { data } = await supabase.rpc("player_cards", { p_users: ids });
  const cards = ((data ?? []) as { user_id: string; name: string; avatar_url: string | null }[]).map(
    (r): Contact => ({ id: r.user_id, name: r.name, avatar: r.avatar_url }),
  );
  const me = cards.find((c) => c.id === player.userId) ?? { id: player.userId, name: player.profile.username, avatar: null };
  const initialTo = to ? (cards.find((c) => c.id === to && c.id !== player.userId) ?? null) : null;

  const tab = (c: Channel, label: string) => (
    <Link
      href={`/messaggi?canale=${c}`}
      aria-current={channel === c ? "page" : undefined}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-medium",
        channel === c ? "bg-flamingo/20 text-white shadow-[inset_0_0_0_1px_var(--flamingo)]" : "text-muted-foreground hover:bg-white/5",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 font-heading text-3xl tracking-wide">Messaggi</h1>
        {tab("on", "ON · tra personaggi")}
        {tab("off", "OFF · tra giocatori")}
      </div>
      {channel === "on" && !character ? (
        <NeedsCharacter
          className="glass rounded-2xl"
          text="I messaggi ON sono tra personaggi: servono una scheda approvata. Intanto puoi scrivere a giocatori e staff nei messaggi OFF."
        />
      ) : (
        <MessagesApp
          key={`${channel}:${to ?? ""}`}
          channel={channel}
          me={me}
          initialTo={initialTo}
          canBroadcast={can(player, "annunci.globali") || can(player, "messaggi.tutti")}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Nota: lo staff autorizzato può leggere i messaggi ON e OFF per far rispettare il regolamento.
      </p>
    </div>
  );
}
