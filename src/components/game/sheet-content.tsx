import { notFound } from "next/navigation";
import { CreationWizard } from "@/components/creation/creation-wizard";
import { CharacterSheetWindow, NewCharacterSheet, NoCharacterSheet, type SheetVariant } from "@/components/game/character-sheet-window";
import { can, requirePlayer } from "@/lib/auth";
import { getAccountName, getCharacter, getCharacterAffiliations, getCharacterBuild, getDistricts, getRulesData } from "@/lib/data";
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

  const [districts, now, affiliations] = await Promise.all([getDistricts(), requestTime(), getCharacterAffiliations(character.id)]);
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
      affiliations={affiliations}
      canSeePrivate
      canReview={can(player, "personaggi.approvare")}
      canManageHealth={can(player, "combattimento.gestire")}
      isAdmin={player.level.is_admin}
    />
  );
}

/** La scheda di un altro personaggio (chi può, la approva o la rifiuta) */
export async function OtherSheet({ id, variant }: { id: string; variant: SheetVariant }) {
  const player = await requirePlayer();
  // la propria scheda (es. dagli online): si mostra qui, senza redirect, che dentro
  // la finestra caricata a pezzi (Suspense) manderebbe in errore il server
  if (id === player.character?.id || id === player.userId) return <OwnSheet variant={variant} />;
  const character = await getCharacter(id);
  if (!character) {
    // l'id di un account senza personaggio (online, anagrafe): scheda vuota con il nome
    const name = await getAccountName(id);
    if (!name) notFound();
    return <NoCharacterSheet name={name} variant={variant} />;
  }
  const isAdmin = player.level.is_admin;
  // Caratteristiche, abilità, tratti, storia ed equipaggiamento: solo proprietario e staff
  const canSeePrivate = can(player, "personaggi.vedere_tutti");
  const [build, rules, now, districts, affiliations] = await Promise.all([
    getCharacterBuild(id),
    getRulesData(),
    requestTime(),
    isAdmin ? getDistricts() : Promise.resolve([]),
    getCharacterAffiliations(id),
  ]);

  const visible = canSeePrivate ? character : { ...character, traits: null, bio: null, equipment: null };
  return (
    <CharacterSheetWindow
      character={visible}
      isOwner={false}
      online={isOnline(character.last_seen_at, now)}
      since={formatDateTime(character.created_at)}
      districts={districts}
      variant={variant}
      build={canSeePrivate ? build : { attributes: {}, skills: {}, optionIds: [], optionDetails: {} }}
      rules={rules}
      affiliations={affiliations}
      canSeePrivate={canSeePrivate}
      canReview={can(player, "personaggi.approvare")}
      canManageHealth={can(player, "combattimento.gestire")}
      isAdmin={isAdmin}
    />
  );
}
