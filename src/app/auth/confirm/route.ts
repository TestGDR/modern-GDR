import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Link di conferma dell'email (registrazione, recupero password).
// Supporta sia il link con "code" (predefinito) sia quello con "token_hash".
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/mappa";
  // Solo percorsi interni, per evitare redirect verso altri siti
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/mappa";

  const supabase = await createClient();
  let ok = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  }

  if (ok) return NextResponse.redirect(`${origin}${next}`);
  return NextResponse.redirect(`${origin}/login?errore=conferma`);
}
