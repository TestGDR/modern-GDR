import { notFound, redirect } from "next/navigation";
import { CharacterSheetWindow, NewCharacterSheet, type SheetVariant } from "@/components/game/character-sheet-window";
import { requirePlayer } from "@/lib/auth";
import { getCharacter, getDistricts } from "@/lib/data";
import { formatDateTime, isOnline } from "@/lib/format";
import { requestTime } from "@/lib/request-time";

// Contenuto della scheda, uguale nella pagina /scheda e nella finestra.

/** La propria scheda (o il pulsante "Crea personaggio" se non c'è ancora) */
export async function OwnSheet({ variant }: { variant: SheetVariant }) {
  const { character: mine, profile } = await requirePlayer();
  const districts = await getDistricts();

  if (!mine) return <NewCharacterSheet name={profile.username} districts={districts} variant={variant} />;

  const character = await getCharacter(mine.id);
  if (!character) notFound();
  const now = await requestTime();

  return (
    <CharacterSheetWindow
      character={character}
      isOwner
      online={isOnline(character.last_seen_at, now)}
      since={formatDateTime(character.created_at)}
      districts={districts}
      variant={variant}
    />
  );
}

/** La scheda di un altro personaggio */
export async function OtherSheet({ id, variant }: { id: string; variant: SheetVariant }) {
  const { character: mine } = await requirePlayer();
  if (id === mine?.id) redirect("/scheda");
  const character = await getCharacter(id);
  if (!character) notFound();
  const now = await requestTime();

  return (
    <CharacterSheetWindow
      character={character}
      isOwner={false}
      online={isOnline(character.last_seen_at, now)}
      since={formatDateTime(character.created_at)}
      variant={variant}
    />
  );
}
