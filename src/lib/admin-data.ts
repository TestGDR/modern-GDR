import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Attribute, CreationOption, GameSetting, SheetOption, Skill, UserLevel } from "@/lib/types";

// Letture del pannello di gestione: qui servono anche le voci disattivate.

export async function getAllRules() {
  const supabase = await createClient();
  const [attributes, skills, options, sheetOptions] = await Promise.all([
    supabase.from("attributes").select("*").order("sort_order").overrideTypes<Attribute[], { merge: false }>(),
    supabase.from("skills").select("*").order("sort_order").order("name").overrideTypes<Skill[], { merge: false }>(),
    supabase.from("creation_options").select("*").order("sort_order").order("name").overrideTypes<CreationOption[], { merge: false }>(),
    supabase.from("sheet_options").select("*").order("sort_order").order("name").overrideTypes<SheetOption[], { merge: false }>(),
  ]);
  return {
    attributes: attributes.data ?? [],
    skills: skills.data ?? [],
    options: options.data ?? [],
    sheetOptions: sheetOptions.data ?? [],
  };
}

/** Quanti personaggi usano ogni caratteristica, abilità e scelta */
export async function getRulesUsage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("rules_usage");
  const rows = (data ?? []) as { kind: string; id: string; n: number }[];
  const usage: Record<string, number> = {};
  for (const row of rows) usage[row.id] = row.n;
  return usage;
}

export async function getSettings() {
  const supabase = await createClient();
  const { data } = await supabase.from("game_settings").select("*").order("sort_order").overrideTypes<GameSetting[], { merge: false }>();
  return data ?? [];
}

export async function getLevels() {
  const supabase = await createClient();
  const { data } = await supabase.from("user_levels").select("*").order("rank", { ascending: false }).overrideTypes<UserLevel[], { merge: false }>();
  return data ?? [];
}

export type AdminUserRow = {
  id: string;
  username: string;
  level_id: string;
  created_at: string;
  last_login_at: string | null;
  last_played_at: string | null;
  banned_until: string | null;
  ban_reason: string;
  character_name: string | null;
  character_status: string | null;
};

/** Utenti con ultimo accesso, ultimo gioco e sospensione (solo per lo staff) */
export async function getUsers() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_users");
  return (data ?? []) as AdminUserRow[];
}

export type LogEntry = {
  id: number;
  action: string;
  entity: string;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  actor: { username: string } | null;
};

export async function getLog(limit = 150) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("admin_log")
    .select("id, action, entity, entity_label, details, created_at, actor:profiles(username)")
    .order("created_at", { ascending: false })
    .limit(limit)
    .overrideTypes<LogEntry[], { merge: false }>();
  return data ?? [];
}
