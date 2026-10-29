import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Search, ShieldAlert } from "lucide-react";
import { BackToPanel, inputClass } from "@/components/admin/admin-ui";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Accessi" };

type Access = {
  id: number;
  user_id: string | null;
  event: "iscrizione" | "login" | "accesso";
  ip: string;
  user_agent: string | null;
  country: string | null;
  is_vpn: boolean | null;
  vpn_type: string | null;
  provider: string | null;
  risk: number | null;
  created_at: string;
};

const EVENT_LABEL = { iscrizione: "Iscrizione", login: "Accesso con password", accesso: "Visita da un IP nuovo" };

export default function Page({ searchParams }: PageProps<"/gestione/accessi">) {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Accessi" subtitle="Gli ultimi accessi, con IP, paese e controllo VPN/proxy. Si cancellano da soli dopo 6 mesi." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/gestione/accessi">["searchParams"] }) {
  await requirePermission("gestione.accessi");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const supabase = await createClient();

  // Filtro per nome (utente) o per IP
  let userFilter: string | null = null;
  if (query && !/^[0-9a-f.:]+$/i.test(query)) {
    const { data } = await supabase.rpc("find_player", { p_name: query });
    userFilter = ((data ?? []) as { user_id: string }[])[0]?.user_id ?? "00000000-0000-0000-0000-000000000000";
  }
  let req = supabase.from("access_logs").select("*").order("created_at", { ascending: false }).limit(300);
  if (userFilter) req = req.eq("user_id", userFilter);
  else if (query) req = req.eq("ip", query);
  const { data } = await req.overrideTypes<Access[], { merge: false }>();
  const rows = data ?? [];

  const ids = [...new Set(rows.flatMap((r) => (r.user_id ? [r.user_id] : [])))];
  const { data: names } = ids.length ? await supabase.rpc("log_names", { p_users: ids }) : { data: [] };
  const nameOf = Object.fromEntries(((names ?? []) as { user_id: string; name: string }[]).map((n) => [n.user_id, n.name]));

  // Stesso IP usato da più utenti (possibili account multipli)
  const usersByIp = new Map<string, Set<string>>();
  for (const r of rows) if (r.user_id) usersByIp.set(r.ip, (usersByIp.get(r.ip) ?? new Set()).add(r.user_id));

  return (
    <div className="flex flex-col gap-4">
      <form className="flex gap-2">
        <label className="relative flex-1">
          <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
          <input name="q" defaultValue={query} placeholder="Nome del personaggio o indirizzo IP" className={cn(inputClass, "pl-9")} />
        </label>
        <Button type="submit" className="h-10 rounded-full">
          Cerca
        </Button>
        {query && (
          <Link href="/gestione/accessi" className="grid h-10 place-items-center rounded-full px-3 text-sm text-muted-foreground hover:text-foreground">
            Tutti
          </Link>
        )}
      </form>
      {!process.env.SUPABASE_SECRET_KEY && <p className="text-sm text-peach">Il registro degli accessi è spento: manca la chiave segreta di Supabase sul server.</p>}
      {rows.length === 0 && <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">Nessun accesso registrato.</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const shared = [...(usersByIp.get(r.ip) ?? [])].filter((u) => u !== r.user_id);
          return (
            <li key={r.id} className={cn("glass flex flex-col gap-1 rounded-2xl px-4 py-3 text-sm", r.is_vpn && "border-peach/50")}>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{r.user_id ? (nameOf[r.user_id] ?? "utente eliminato") : "—"}</span>
                <span className="text-muted-foreground">{EVENT_LABEL[r.event]}</span>
                <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
              </p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <Link href={`/gestione/accessi?q=${encodeURIComponent(r.ip)}`} className="font-mono text-foreground hover:underline">
                  {r.ip}
                </Link>
                {r.country && <span>{r.country}</span>}
                {r.provider && <span>{r.provider}</span>}
                {r.is_vpn === null && <span>non verificato</span>}
                {r.is_vpn && (
                  <span className="flex items-center gap-1 rounded-full bg-peach/20 px-2 py-0.5 text-peach">
                    <ShieldAlert className="size-3.5" /> {r.vpn_type ?? "VPN"}
                    {r.risk !== null ? ` · rischio ${r.risk}` : ""}
                  </span>
                )}
                {shared.length > 0 && (
                  <span className="rounded-full bg-flamingo/20 px-2 py-0.5 text-flamingo">Stesso IP di: {shared.map((u) => nameOf[u] ?? "…").join(", ")}</span>
                )}
              </p>
              {r.user_agent && <p className="truncate text-[0.7rem] text-muted-foreground/70">{r.user_agent}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
