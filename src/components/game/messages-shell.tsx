import Link from "next/link";
import { CharacterAvatar } from "@/components/game/character-avatar";
import type { ConversationSummary } from "@/lib/data";
import { formatDateTime, initials, isOnline } from "@/lib/format";
import { cn } from "@/lib/utils";

type MessagesShellProps = {
  conversations: ConversationSummary[];
  myCharacterId: string;
  activeId?: string;
  now: Date;
  children: React.ReactNode;
};

/**
 * Due colonne su desktop (elenco + conversazione).
 * Su mobile si vede l'elenco oppure la conversazione aperta.
 */
export function MessagesShell({ conversations, myCharacterId, activeId, now, children }: MessagesShellProps) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:h-[calc(100dvh-5rem)] lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className={cn("glass flex-col overflow-hidden rounded-2xl", activeId ? "hidden lg:flex" : "flex")}>
        <h1 className="border-b border-border px-5 py-4 font-heading text-3xl tracking-wide text-sunset">Messaggi</h1>
        {conversations.length === 0 && (
          <p className="px-5 py-6 text-sm text-muted-foreground">Nessuna conversazione. Scegli un personaggio a cui scrivere.</p>
        )}
        <ul className="flex-1 overflow-y-auto">
          {conversations.map(({ other, last, unread }) => (
            <li key={other.id}>
              <Link
                href={`/messaggi/${other.id}`}
                className={cn(
                  "flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/5",
                  other.id === activeId && "bg-sidebar-accent",
                )}
              >
                <CharacterAvatar initials={initials(other.name)} online={isOnline(other.last_seen_at, now)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-medium">{other.name}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(last.created_at)}</span>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {last.sender_id === myCharacterId && "Tu: "}
                    {last.body}
                  </p>
                </div>
                {unread > 0 && (
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-flamingo text-[0.7rem] font-bold text-primary-foreground">
                    {unread}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <section className={cn("min-h-0 flex-col", activeId ? "flex" : "hidden lg:flex")}>{children}</section>
    </div>
  );
}
