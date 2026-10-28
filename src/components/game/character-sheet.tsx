import { Badge } from "@/components/ui/badge";
import { CharacterAvatar } from "@/components/game/character-avatar";
import { STATS } from "@/lib/character-stats";
import { formatDateTime, initials, isOnline } from "@/lib/format";
import type { Character } from "@/lib/types";

type CharacterSheetProps = {
  character: Character & { district: { name: string } | null };
  now: Date;
  /** Contenuto extra (es. modulo di modifica o pulsante "scrivi") */
  children?: React.ReactNode;
};

/** Scheda del personaggio, usata sia per la propria sia per quelle altrui */
export function CharacterSheet({ character, now, children }: CharacterSheetProps) {
  const online = isOnline(character.last_seen_at, now);
  const info = [
    { label: "Età", value: character.age ? `${character.age} anni` : "—" },
    { label: "Quartiere", value: character.district?.name ?? "—" },
    { label: "Lavoro", value: character.occupation ?? "—" },
    { label: "A Miami dal", value: formatDateTime(character.created_at) },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <section className="glass flex h-fit flex-col items-center rounded-2xl p-6 text-center">
        <CharacterAvatar initials={initials(character.name)} online={online} className="size-28 [&_[data-slot=avatar-fallback]]:text-4xl" />
        <h2 className="mt-4 font-heading text-4xl tracking-wide">{character.name}</h2>
        {character.quote && <p className="text-sm text-muted-foreground">«{character.quote}»</p>}
        <div className="mt-3">
          <Badge className={online ? "bg-mint/20 text-mint" : "bg-white/10 text-muted-foreground"}>
            {online ? "Online" : "Offline"}
          </Badge>
        </div>
        <dl className="mt-6 grid w-full grid-cols-2 gap-3 text-left">
          {info.map((i) => (
            <div key={i.label} className="rounded-xl bg-white/5 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{i.label}</dt>
              <dd className="truncate text-sm font-medium">{i.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="flex flex-col gap-6">
        <section className="glass rounded-2xl p-6">
          <h3 className="mb-4 font-heading text-2xl tracking-wide text-peach">Caratteristiche</h3>
          <ul className="flex flex-col gap-3">
            {STATS.map(({ key, label }) => (
              <li key={key}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="text-muted-foreground">{character[key]}/10</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet via-flamingo to-peach"
                    style={{ width: `${character[key] * 10}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass rounded-2xl p-6">
          <h3 className="mb-3 font-heading text-2xl tracking-wide text-peach">Storia</h3>
          <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
            {character.bio || "Nessuna storia scritta, per ora."}
          </p>
        </section>

        {children}
      </div>
    </div>
  );
}
