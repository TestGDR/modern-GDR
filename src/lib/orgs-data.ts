import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ORG_TABLES, isJobArea, type JobKind, type Org, type OrgKind, type OrgRole, type GroupCategory } from "@/lib/orgs";

type OrgRow = { id: string; name: string; description: string; kind?: string; icon_url?: string | null; tags?: string[]; category_id?: string | null; hidden?: boolean; area?: string; sort_order: number; active: boolean };
type RoleRow = Omit<OrgRole, "self_select" | "salary_full" | "salary_part"> & {
  self_select?: boolean;
  salary_full?: number | null;
  salary_part?: number | null;
  job_id?: string;
  group_id?: string;
};
type MemberRow = {
  role_id: string;
  mode?: JobKind | null;
  job_id?: string;
  group_id?: string;
  character: { id: string; name: string; avatar_url: string | null } | null;
};

/** Ambiti dei gruppi, in ordine */
export async function loadGroupCategories(): Promise<GroupCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("group_categories").select("id, name, for_sport, max_per_character, sort_order").order("sort_order").order("name").overrideTypes<GroupCategory[], { merge: false }>();
  return data ?? [];
}

/** Lavori o gruppi con ruoli e membri, in ordine */
export async function loadOrgs(kind: OrgKind): Promise<Org[]> {
  const t = ORG_TABLES[kind];
  const supabase = await createClient();
  const [{ data: orgs }, { data: roles }, { data: members }, { data: captains }] = await Promise.all([
    supabase.from(t.org).select("*").order("sort_order").order("name").overrideTypes<OrgRow[], { merge: false }>(),
    supabase.from(t.role).select("*").order("sort_order").order("name").overrideTypes<RoleRow[], { merge: false }>(),
    supabase
      .from(t.member)
      .select(`role_id, ${t.fk}, ${kind === "job" ? "mode, " : ""}character:characters(id, name, avatar_url)`)
      .overrideTypes<MemberRow[], { merge: false }>(),
    // capitani delle squadre: nel gruppo hanno il loro ruolo sportivo, con la scritta «Capitano»
    kind === "group" ? supabase.rpc("sport_captains") : Promise.resolve({ data: [] }),
  ]);
  const captainOf = new Set(((captains ?? []) as { character_id: string; group_id: string }[]).map((c) => `${c.group_id}:${c.character_id}`));
  return (orgs ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    description: o.description,
    sport: kind === "group" && o.kind === "sport",
    icon_url: o.icon_url ?? null,
    tags: o.tags ?? [],
    category_id: o.category_id ?? null,
    hidden: o.hidden ?? false,
    area: isJobArea(o.area) ? o.area : "attivita",
    sort_order: o.sort_order,
    active: o.active,
    roles: (roles ?? [])
      .filter((r) => (r.job_id ?? r.group_id) === o.id)
      .map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        salary: r.salary,
        salary_full: r.salary_full ?? null,
        salary_part: r.salary_part ?? null,
        max_members: r.max_members ?? null,
        self_select: r.self_select ?? false,
        sort_order: r.sort_order,
      })),
    members: (members ?? [])
      .filter((m) => (m.job_id ?? m.group_id) === o.id && m.character)
      .map((m) => ({
        character_id: m.character!.id,
        name: m.character!.name,
        avatar_url: m.character!.avatar_url,
        role_id: m.role_id,
        mode: m.mode ?? null,
        captain: captainOf.has(`${o.id}:${m.character!.id}`),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "it")),
  }));
}
