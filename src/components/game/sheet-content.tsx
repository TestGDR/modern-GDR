import { notFound, redirect } from "next/navigation";
import { CreationWizard } from "@/components/creation/creation-wizard";
import { CharacterSheetWindow, NewCharacterSheet, type SheetVariant } from "@/components/game/character-sheet-window";
import { can, requirePlayer } from "@/lib/auth";
import { getCharacter, getCharacterBuild, getDistricts, getRulesData } from "@/lib/data";
import { formatDateTime, isOnline } from "@/lib/format";
import { parseSettings } from "@/lib/interlock";
import { requestTime } from "@/lib/request-time";

// Contenuto della scheda, uguale nella pagina /scheda e nella finestra.

/**
 * La propria scheda:
 * - nessun personaggio → pulsante "Crea personaggio"
 * - bozza o rifiutata → creazione in 6 passaggi (riprende da dove si era rimasti)
 * - in attesa o approvata → scheda
 */
export async function OwnSheet({ variant }: { variant: SheetVariant }) {
  const player = await requirePlayer();
  const { character: mine, profile } = player;
  if (!mine) return <NewCharacterSheet name={profile.username} variant={variant} />;

  const [character, build, rules] = await Promise.all([getCharacter(mine.id), getCharacterBuild(mine.id), getRulesData()]);
  if (!character) notFound();

  if (character.status === "bozza" || character.status === "rifiutata") {
    return (
      <CreationWizard
        character={character}
        build={build}
        rules={rules}
        settings={parseSettings(rules.settings)}
        variant={variant}
      />
    );
  }

  const [districts, now] = await Promise.all([getDistricts(), requestTime()]);
  return (
    <CharacterSheetWindow
      character={character}
      isOwner
      online={isOnline(character.last_seen_at, now)}
      since={formatDateTime(character.created_at)}
      districts={districts}
      variant={variant}
      build={build}
      rules={rules}
      canReview={can(player, "personaggi.approvare")}
    />
  );
}

/** La scheda di un altro personaggio (chi può, la approva o la rifiuta) */
export async function OtherSheet({ id, variant }: { id: string; variant: SheetVariant }) {
  const player = await requirePlayer();
  if (id === player.character?.id) redirect("/scheda");
  const character = await getCharacter(id);
  if (!character) notFound();
  const [build, rules, now] = await Promise.all([getCharacterBuild(id), getRulesData(), requestTime()]);

  return (
    <CharacterSheetWindow
      character={character}
      isOwner={false}
      online={isOnline(character.last_seen_at, now)}
      since={formatDateTime(character.created_at)}
      variant={variant}
      build={build}
      rules={rules}
      canReview={can(player, "personaggi.approvare")}
    />
  );
}
