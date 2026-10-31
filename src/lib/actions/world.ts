"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/actions/admin";
import { requirePlayer } from "@/lib/auth";
import { CHAT_LIMITS } from "@/lib/chat";
import { isUuid } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { GRADIENTS, WORLD_BUCKET } from "@/lib/world";

// Pannello "Mondo" (dal Westeros: gestione/mondo/actions.ts) e impostazioni
// della chat. I permessi (mondo.gestire) li controllano le policy del database.
// Le immagini le carica il browser nell'archivio "mondo": qui arriva solo l'indirizzo.

type Supabase = Awaited<ReturnType<typeof createClient>>;
type DbError = { message: string; code?: string } | null;

const PUBLIC_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${WORLD_BUCKET}/`;

function friendly(error: NonNullable<DbError>) {
  if (error.code === "42501") return "Non hai il permesso di gestire il mondo di gioco.";
  if (error.code === "23514") return "Un valore non è valido: controlla i campi.";
  return error.message;
}

async function run(fn: (supabase: Supabase) => PromiseLike<{ error: DbError }>): Promise<ActionResult> {
  await requirePlayer();
  const supabase = await createClient();
  const { error } = await fn(supabase);
  if (error) return { ok: false, error: friendly(error) };
  refresh();
  return { ok: true };
}

const clean = (v: string | null | undefined, max: number) => (v ?? "").trim().slice(0, max);

/** Solo immagini del nostro archivio "mondo" */
function imageOk(url: string | null) {
  return url === null || (url.startsWith(PUBLIC_PREFIX) && !url.includes(".."));
}

/** Elimina dall'archivio un'immagine non più usata (se non riesce resta solo il file) */
async function removeImage(supabase: Supabase, url: string | null | undefined) {
  if (!url?.startsWith(PUBLIC_PREFIX)) return;
  await supabase.storage.from(WORLD_BUCKET).remove([url.slice(PUBLIC_PREFIX.length)]);
}

/* ------------------------------ Mappe ------------------------------ */

export type MapInput = { id?: string; name: string; description: string; imageUrl: string | null; active: boolean };

export async function saveMap(input: MapInput): Promise<ActionResult> {
  const name = clean(input.name, 80);
  if (name.length < 2) return { ok: false, error: "Dai un nome alla mappa." };
  if (!imageOk(input.imageUrl)) return { ok: false, error: "Immagine non valida." };
  const row = { name, description: clean(input.description, 2000), image_url: input.imageUrl, active: input.active };
  return run(async (supabase) => {
    let old: string | null = null;
    if (input.id) {
      const { data } = await supabase.from("maps").select("image_url").eq("id", input.id).maybeSingle<{ image_url: string | null }>();
      old = data?.image_url ?? null;
      const { error } = await supabase.from("maps").update(row).eq("id", input.id);
      if (error) return { error };
    } else {
      const { count } = await supabase.from("maps").select("id", { count: "exact", head: true });
      const { error } = await supabase.from("maps").insert({ ...row, sort_order: (count ?? 0) + 1 });
      if (error) return { error };
    }
    if (old && old !== row.image_url) await removeImage(supabase, old);
    return { error: null };
  });
}

export async function deleteMap(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Mappa non valida." };
  return run(async (supabase) => {
    const { data } = await supabase.from("maps").select("image_url").eq("id", id).maybeSingle<{ image_url: string | null }>();
    const { data: rooms } = await supabase
      .from("rooms")
      .select("image_url, district:locations!inner(map_id)")
      .eq("district.map_id", id)
      .overrideTypes<{ image_url: string | null }[], { merge: false }>();
    // quartieri, chat e messaggi si cancellano con la mappa
    const { error } = await supabase.from("maps").delete().eq("id", id);
    if (error) return { error };
    await removeImage(supabase, data?.image_url);
    for (const r of rooms ?? []) await removeImage(supabase, r.image_url);
    return { error: null };
  });
}

/* ------------------------------ Quartieri ------------------------------ */

export type DistrictInput = { id?: string; mapId: string; name: string; tagline: string; description: string; gradient: string };

export async function saveDistrict(input: DistrictInput): Promise<ActionResult> {
  const name = clean(input.name, 60);
  if (name.length < 2) return { ok: false, error: "Dai un nome al quartiere." };
  if (!isUuid(input.mapId)) return { ok: false, error: "Scegli la mappa." };
  const row = {
    map_id: input.mapId,
    name,
    tagline: clean(input.tagline, 120) || null,
    description: clean(input.description, 2000),
    gradient: GRADIENTS.includes(input.gradient) ? input.gradient : GRADIENTS[0],
  };
  return run(async (supabase) => {
    if (input.id) return supabase.from("locations").update(row).eq("id", input.id);
    const { count } = await supabase.from("locations").select("id", { count: "exact", head: true }).eq("map_id", input.mapId);
    // i nuovi compaiono al centro: poi si trascinano
    return supabase.from("locations").insert({ ...row, x: 50, y: 50, sort_order: (count ?? 0) + 1 });
  });
}

export async function deleteDistrict(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Quartiere non valido." };
  return run((supabase) => supabase.from("locations").delete().eq("id", id).then((r) => r));
}

/** Salva le posizioni dei punti trascinati sulla mappa */
export async function saveDistrictPositions(positions: { id: string; x: number; y: number }[]): Promise<ActionResult> {
  const valid = positions.filter((p) => isUuid(p.id) && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length === 0) return { ok: true };
  return run(async (supabase) => {
    for (const p of valid.slice(0, 200)) {
      const x = Math.round(Math.min(100, Math.max(0, p.x)) * 100) / 100;
      const y = Math.round(Math.min(100, Math.max(0, p.y)) * 100) / 100;
      const { error } = await supabase.from("locations").update({ x, y }).eq("id", p.id);
      if (error) return { error };
    }
    return { error: null };
  });
}

/* ------------------------------ Gruppi di chat ------------------------------ */

export async function saveRoomGroup(input: { id?: string; districtId: string; name: string }): Promise<ActionResult> {
  const name = clean(input.name, 80);
  if (!name) return { ok: false, error: "Dai un nome al gruppo." };
  if (!isUuid(input.districtId)) return { ok: false, error: "Quartiere non valido." };
  return run(async (supabase) => {
    if (input.id) return supabase.from("room_groups").update({ name }).eq("id", input.id);
    const { count } = await supabase.from("room_groups").select("id", { count: "exact", head: true }).eq("location_id", input.districtId);
    return supabase.from("room_groups").insert({ location_id: input.districtId, name, sort_order: (count ?? 0) + 1 });
  });
}

/** Eliminando un gruppo le sue chat restano, senza gruppo */
export async function deleteRoomGroup(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Gruppo non valido." };
  return run((supabase) => supabase.from("room_groups").delete().eq("id", id).then((r) => r));
}

/* ------------------------------ Chat ------------------------------ */

export type RoomInput = {
  id?: string;
  districtId: string;
  groupId: string | null;
  name: string;
  description: string;
  imageUrl: string | null;
  isOpen: boolean;
  access: "pubblica" | "su_invito";
  /** Nome del personaggio proprietario (chat su invito) */
  ownerName: string;
};

export async function saveRoom(input: RoomInput): Promise<ActionResult> {
  const name = clean(input.name, 80);
  if (name.length < 2) return { ok: false, error: "Dai un nome alla chat." };
  if (!isUuid(input.districtId)) return { ok: false, error: "Scegli il quartiere." };
  if (input.groupId !== null && !isUuid(input.groupId)) return { ok: false, error: "Gruppo non valido." };
  if (!["pubblica", "su_invito"].includes(input.access)) return { ok: false, error: "Accesso non valido." };
  if (!imageOk(input.imageUrl)) return { ok: false, error: "Immagine non valida." };

  await requirePlayer();
  const supabase = await createClient();
  let owner: string | null = null;
  const ownerName = clean(input.ownerName, 60);
  if (input.access === "su_invito" && ownerName) {
    const { data } = await supabase
      .from("characters")
      .select("id")
      .ilike("name", ownerName.replace(/[%_\\]/g, "\\$&"))
      .eq("status", "approvata")
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (!data) return { ok: false, error: `Nessun personaggio approvato si chiama «${ownerName}».` };
    owner = data.id;
  }

  const row = {
    location_id: input.districtId,
    group_id: input.groupId,
    name,
    description: clean(input.description, 2000),
    image_url: input.imageUrl,
    is_open: input.isOpen,
    access: input.access,
    owner_character_id: owner,
  };
  return run(async (db) => {
    let old: string | null = null;
    if (input.id) {
      const { data } = await db.from("rooms").select("image_url").eq("id", input.id).maybeSingle<{ image_url: string | null }>();
      old = data?.image_url ?? null;
      const { error } = await db.from("rooms").update(row).eq("id", input.id);
      if (error) return { error };
    } else {
      const { count } = await db.from("rooms").select("id", { count: "exact", head: true }).eq("location_id", input.districtId);
      const { error } = await db.from("rooms").insert({ ...row, sort_order: (count ?? 0) + 1 });
      if (error) return { error };
    }
    if (old && old !== row.image_url) await removeImage(db, old);
    return { error: null };
  });
}

/** Eliminando una chat si cancellano anche i suoi messaggi */
export async function deleteRoom(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Chat non valida." };
  return run(async (supabase) => {
    const { data } = await supabase.from("rooms").select("image_url").eq("id", id).maybeSingle<{ image_url: string | null }>();
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) return { error };
    await removeImage(supabase, data?.image_url);
    return { error: null };
  });
}

/** Sposta una voce su o giù tra le sorelle e rinumera l'ordine */
export async function moveWorldItem(table: "maps" | "locations" | "rooms" | "room_groups", id: string, direction: -1 | 1): Promise<ActionResult> {
  if (!isUuid(id) || !["maps", "locations", "rooms", "room_groups"].includes(table)) return { ok: false, error: "Voce non valida." };
  return run(async (supabase) => {
    const parent = { maps: null, locations: "map_id", rooms: "location_id", room_groups: "location_id" }[table];
    const { data: item } = await supabase.from(table).select("*").eq("id", id).maybeSingle<Record<string, string>>();
    if (!item) return { error: { message: "Voce non trovata." } };
    let query = supabase.from(table).select("id").order("sort_order").order("name");
    if (parent) query = query.eq(parent, item[parent]);
    const { data: siblings } = await query.overrideTypes<{ id: string }[], { merge: false }>();
    const ids = (siblings ?? []).map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= ids.length) return { error: null };
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (const [index, rowId] of ids.entries()) {
      const { error } = await supabase.from(table).update({ sort_order: index + 1 }).eq("id", rowId);
      if (error) return { error };
    }
    return { error: null };
  });
}

/* ------------------------------ Impostazioni della chat ------------------------------ */

export async function saveChatSettings(input: { maxLength: number; ttlMinutes: number; idleMinutes: number; sessionHours: number }): Promise<ActionResult> {
  const within = (v: number, l: { min: number; max: number }) => Number.isInteger(v) && v >= l.min && v <= l.max;
  if (!within(input.maxLength, CHAT_LIMITS.max_length)) return { ok: false, error: "La lunghezza massima va da 100 a 4000 caratteri." };
  if (!within(input.ttlMinutes, CHAT_LIMITS.ttl_minutes)) return { ok: false, error: "La durata dei messaggi va da 10 a 1440 minuti." };
  if (!within(input.idleMinutes, CHAT_LIMITS.idle_minutes)) return { ok: false, error: "L'uscita automatica va da 15 a 1440 minuti." };
  if (!within(input.sessionHours, CHAT_LIMITS.session_hours)) return { ok: false, error: "La durata della sessione va da 0 a 72 ore." };
  return run((supabase) =>
    supabase
      .from("chat_settings")
      .update({ max_length: input.maxLength, ttl_minutes: input.ttlMinutes, idle_minutes: input.idleMinutes, session_hours: input.sessionHours })
      .eq("id", true)
      .then((r) => r),
  );
}
