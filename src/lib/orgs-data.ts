import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ORG_TABLES, type JobKind, type Org, type OrgKind, type OrgRole } from "@/lib/orgs";

type OrgRow = { id: string; name: string; description: string; kind?: JobKind; icon_url?: string | null; sort_order: number; active: boolean };
type RoleRow = Omit<OrgRole, "self_select"> & { self_select?: boolean; job_id?: string; group_id?: string };
type MemberRow = {
  role_id: string;
  job_id?: string;
  group_id?: string;
  character: { id: string; name: string; avatar_url: string | null } | null;
};

/** Lavori o gruppi con ruoli e membri, in ordine */
export async function loadOrgs(kind: OrgKind): Promise<Org[]> {
  const t = ORG_TABLES[kind];
  const supabase = await createClient();
  const [{ data: orgs }, { data: roles }, { data: members }] = await Promise.all([
    supabase.from(t.org).select("*").order("sort_order").order("name").overrideTypes<OrgRow[], { merge: false }>(),
    supabase.from(t.role).select("*").order("sort_order").order("name").overrideTypes<RoleRow[], { merge: false }>(),
    supabase
      .from(t.member)
      .select(`role_id, ${t.fk}, character:characters(id, name, avatar_url)`)
      .overrideTypes<MemberRow[], { merge: false }>(),
  ]);
  return (orgs ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    description: o.description,
    kind: o.kind ?? null,
    icon_url: o.icon_url ?? null,
    sort_order: o.sort_order,
    active: o.active,
    roles: (roles ?? [])
      .filter((r) => (r.job_id ?? r.group_id) === o.id)
      .map((r) => ({ id: r.id, name: r.name, description: r.description, salary: r.salary, self_select: r.self_select ?? false, sort_order: r.sort_order })),
    members: (members ?? [])
      .filter((m) => (m.job_id ?? m.group_id) === o.id && m.character)
      .map((m) => ({ character_id: m.character!.id, name: m.character!.name, avatar_url: m.character!.avatar_url, role_id: m.role_id }))
      .sort((a, b) => a.name.localeCompare(b.name, "it")),
  }));
}
