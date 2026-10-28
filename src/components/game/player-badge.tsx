import Link from "next/link";
import { LogOut } from "lucide-react";
import { CharacterAvatar } from "@/components/game/character-avatar";
import { Button } from "@/components/ui/button";
import { requirePlayer } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { initials } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const TOUCH_EVERY_MS = 2 * 60 * 1000;

/** Segna il personaggio come online (al massimo ogni 2 minuti) */
async function touchLastSeen(characterId: string, lastSeenAt: string | null) {
  if (lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < TOUCH_EVERY_MS) return;
  const supabase = await createClient();
  await supabase.from("characters").update({ last_seen_at: new Date().toISOString() }).eq("id", characterId);
}

/** Riquadro del giocatore in fondo alla sidebar */
export async function PlayerBadge() {
  const { character, profile } = await requirePlayer();
  if (character) await touchLastSeen(character.id, character.last_seen_at);
  const name = character?.name ?? "Nessun personaggio";

  return (
    <div className="m-3 flex items-center gap-3 rounded-2xl bg-white/5 p-3">
      <Link href="/scheda" className="flex min-w-0 flex-1 items-center gap-3">
        <CharacterAvatar initials={character ? initials(character.name) : "?"} online={!!character} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted-foreground">@{profile.username}</p>
        </div>
      </Link>
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="icon" className="text-muted-foreground" aria-label="Esci">
          <LogOut />
        </Button>
      </form>
    </div>
  );
}

/** Versione mobile: solo il pulsante per uscire */
export function MobileSignOut() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="icon" aria-label="Esci">
        <LogOut className="size-5" />
      </Button>
    </form>
  );
}
