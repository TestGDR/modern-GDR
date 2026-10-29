import { ForumSidebar } from "@/components/game/forum-sidebar";
import { can, requirePlayer } from "@/lib/auth";
import { getForumNav, getForumUnread } from "@/lib/data";

/**
 * Struttura del forum: a sinistra categorie e sezioni (solo quelle leggibili),
 * al centro la pagina. Su schermi stretti la colonna si apre con un pulsante.
 */
export async function ForumShell({ children }: { children: React.ReactNode }) {
  const player = await requirePlayer();
  const [nav, unread] = await Promise.all([getForumNav(), getForumUnread()]);
  const unreadByBoard: Record<string, number> = {};
  for (const u of unread) unreadByBoard[u.board_id] = (unreadByBoard[u.board_id] ?? 0) + 1;

  return (
    <div className="@container">
      <div className="grid gap-4 @3xl:grid-cols-[15rem_minmax(0,1fr)] @3xl:gap-6">
        <ForumSidebar
          sections={nav.map((s) => ({
            id: s.id,
            title: s.title,
            boards: s.forum_boards.map((b) => ({ id: b.id, slug: b.slug, name: b.name, locked: b.access !== "pubblica" })),
          }))}
          unreadByBoard={unreadByBoard}
          unreadTotal={unread.length}
          canManage={can(player, "forum.sezioni")}
        />
        <div className="min-w-0 @3xl:border-l @3xl:border-white/10 @3xl:pl-6">{children}</div>
      </div>
    </div>
  );
}
