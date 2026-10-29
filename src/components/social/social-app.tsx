"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Heart, Home, PlusSquare, Search, SendHorizontal } from "lucide-react";
import { Composer } from "@/components/social/composer";
import { Avatar, SocialCtx, type Me, type SocialView } from "@/components/social/social-ui";
import {
  ActivityView,
  BackButton,
  DmList,
  DmThread,
  Feed,
  FollowsView,
  PostView,
  ProfileEditor,
  ProfileView,
  SearchView,
} from "@/components/social/social-views";
import { NeedsCharacter } from "@/components/game/needs-character";
import { SOCIAL_READ_EVENT } from "@/components/social/social-icon";
import { createClient } from "@/lib/supabase/client";
import { useResync } from "@/lib/use-resync";
import { cn } from "@/lib/utils";

type Props = {
  /** Personaggio approvato del giocatore (null = solo lettura) */
  me: Omit<Me, "handle"> | null;
  canModerate: boolean;
  /** Apertura diretta: /social?profilo=<id> o ?dm=<id> */
  initialView: SocialView | null;
};

/** Social stile Instagram: feed, cerca, nuovo post, attività, profilo e messaggi diretti */
export function SocialApp({ me: meProp, canModerate, initialView }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [handle, setHandle] = useState<string | null | undefined>(meProp ? undefined : null);
  const [view, setView] = useState<SocialView>(initialView ?? { kind: "feed" });
  const [history, setHistory] = useState<SocialView[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [unread, setUnread] = useState({ dms: 0, activity: 0 });

  const me: Me | null = meProp ? { ...meProp, handle: handle ?? null } : null;

  const loadMine = useCallback(async () => {
    if (!meProp) return;
    const [{ data: prof }, { data: f }] = await Promise.all([
      supabase.from("social_profiles").select("handle").eq("character_id", meProp.id).maybeSingle<{ handle: string }>(),
      supabase.from("social_follows").select("followed_id").eq("follower_id", meProp.id),
    ]);
    setHandle(prof?.handle ?? null);
    setFollowing(new Set(((f ?? []) as { followed_id: string }[]).map((x) => x.followed_id)));
  }, [supabase, meProp]);

  const loadUnread = useCallback(async () => {
    const { data } = await supabase.rpc("social_unread");
    if (data) setUnread(data as { dms: number; activity: number });
    window.dispatchEvent(new Event(SOCIAL_READ_EVENT));
  }, [supabase]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadMine();
      loadUnread();
    }, 0);
    const ch = supabase
      .channel("social:app")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "social_dms" }, () => loadUnread())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "social_notifications" }, () => loadUnread())
      .subscribe();
    return () => {
      clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, [supabase, loadMine, loadUnread]);
  useResync(() => {
    loadMine();
    loadUnread();
  });

  const go = useCallback(
    (v: SocialView) => {
      setHistory((h) => [...h.slice(-20), view]);
      setView(v);
    },
    [view],
  );
  const back = () => {
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setView(prev ?? { kind: "feed" });
  };

  const goHandle = useCallback(
    async (h: string) => {
      const { data } = await supabase.from("social_profiles").select("character_id").eq("handle", h.toLowerCase()).maybeSingle<{ character_id: string }>();
      if (data) go({ kind: "profile", id: data.character_id });
    },
    [supabase, go],
  );

  const toggleFollow = useCallback(
    async (id: string) => {
      if (!meProp) return;
      const on = following.has(id);
      const next = new Set(following);
      if (on) next.delete(id);
      else next.add(id);
      setFollowing(next);
      const { error } = on
        ? await supabase.from("social_follows").delete().eq("follower_id", meProp.id).eq("followed_id", id)
        : await supabase.from("social_follows").insert({ follower_id: meProp.id, followed_id: id });
      if (error) setFollowing(following);
    },
    [supabase, meProp, following],
  );

  const ctx = { supabase, me, canModerate, go, goHandle, following, toggleFollow };

  // prima volta: si sceglie il @nome
  const needsSetup = meProp && handle === null;

  const nav: { kind: SocialView["kind"]; label: string; icon: React.ReactNode; to: SocialView; badge?: number }[] = [
    { kind: "feed", label: "Home", icon: <Home />, to: { kind: "feed" } },
    { kind: "search", label: "Cerca", icon: <Search />, to: { kind: "search" } },
    ...(me ? [{ kind: "new" as const, label: "Nuovo post", icon: <PlusSquare />, to: { kind: "new" } as SocialView }] : []),
    ...(me ? [{ kind: "activity" as const, label: "Attività", icon: <Heart />, to: { kind: "activity" } as SocialView, badge: unread.activity }] : []),
  ];

  return (
    <SocialCtx.Provider value={ctx}>
      {/* occupa tutta la finestra: titolo in alto, barra sul bordo in basso, in mezzo si scorre */}
      <div className="-mx-6 -mb-6 flex h-[calc(100%+1.5rem)] min-h-[30rem] flex-col @container sm:-mx-8 sm:-mb-8 sm:h-[calc(100%+2rem)]">
        {/* intestazione */}
        <header className="mx-auto flex w-full max-w-xl shrink-0 items-center gap-2 border-b border-white/10 px-6 pb-2 sm:px-8">
          <button type="button" onClick={() => go({ kind: "feed" })} className="font-heading text-3xl tracking-wide text-sunset">
            Social
          </button>
          {me && (
            <button
              type="button"
              onClick={() => go({ kind: "dms" })}
              className={cn("relative ml-auto grid size-10 place-items-center rounded-full hover:bg-white/10", unread.dms > 0 && "blink-call")}
              aria-label={unread.dms ? `Messaggi: ${unread.dms} non letti` : "Messaggi"}
              title="Messaggi diretti"
            >
              <SendHorizontal className="size-6 -rotate-12" />
              {unread.dms > 0 && <span className="absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full bg-flamingo px-1 text-[0.6rem] leading-4 font-bold text-white">{unread.dms}</span>}
            </button>
          )}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className={cn("mx-auto w-full max-w-xl px-6 py-3 sm:px-8", view.kind === "dm" && "h-full")}>
          {!meProp && view.kind === "feed" && (
            <NeedsCharacter className="mb-4 rounded-2xl bg-white/5" text="Puoi guardare il social; per pubblicare, seguire, reagire e scrivere serve un personaggio approvato." />
          )}
          {needsSetup ? (
            <ProfileEditor first onDone={loadMine} />
          ) : view.kind === "feed" ? (
            <Feed />
          ) : view.kind === "search" ? (
            <SearchView />
          ) : view.kind === "new" ? (
            <Composer onPublished={(id) => setView({ kind: "post", id })} />
          ) : view.kind === "activity" ? (
            <ActivityView onRead={loadUnread} />
          ) : view.kind === "profile" ? (
            <>
              {history.length > 0 && <BackButton onClick={back} />}
              <ProfileView key={view.id} id={view.id} />
            </>
          ) : view.kind === "post" ? (
            <PostView key={view.id} id={view.id} onBack={back} />
          ) : view.kind === "follows" ? (
            <FollowsView key={`${view.id}-${view.which}`} id={view.id} which={view.which} />
          ) : view.kind === "dms" ? (
            <DmList />
          ) : view.kind === "dm" ? (
            <DmThread key={view.id} otherId={view.id} onRead={loadUnread} />
          ) : null}
          </div>
        </main>

        {/* barra in basso */}
        <nav className="shrink-0 border-t border-white/10 bg-night/60 px-6 pb-1 sm:px-8">
          <div className="mx-auto grid w-full max-w-xl auto-cols-fr grid-flow-col">
          {nav.map((n) => (
            <button
              key={n.kind}
              type="button"
              onClick={() => go(n.to)}
              aria-label={n.label}
              title={n.label}
              className={cn("relative grid place-items-center py-2.5 [&_svg]:size-6", view.kind === n.kind ? "text-white" : "text-muted-foreground hover:text-foreground")}
            >
              {n.icon}
              {!!n.badge && <span className="absolute top-1.5 left-1/2 ml-2 size-2 rounded-full bg-flamingo" />}
            </button>
          ))}
          {me && (
            <button
              type="button"
              onClick={() => go({ kind: "profile", id: me.id })}
              aria-label="Il mio profilo"
              title="Il mio profilo"
              className="grid place-items-center py-2"
            >
              <Avatar person={me} size="size-7" ring={view.kind === "profile" && view.id === me.id} />
            </button>
          )}
          </div>
        </nav>
      </div>
    </SocialCtx.Provider>
  );
}
