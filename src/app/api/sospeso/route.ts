import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Utente sospeso con una sessione ancora aperta: esce e vede perché (dal Westeros)
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const url = new URL("/sospeso", request.url);
  const { data } = await supabase.rpc("my_ban");
  const ban = ((data ?? []) as { banned_until: string; ban_reason: string }[])[0];
  if (ban) {
    url.searchParams.set("fino", ban.banned_until);
    if (ban.ban_reason) url.searchParams.set("motivo", ban.ban_reason);
  }
  await supabase.rpc("leave_online");
  await supabase.auth.signOut();
  return NextResponse.redirect(url);
}
