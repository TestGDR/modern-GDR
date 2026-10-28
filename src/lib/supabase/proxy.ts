import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Aggiorna (refresh) la sessione Supabase a ogni richiesta e riscrive i cookie.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Non inserire codice tra createServerClient e getClaims():
  // può causare logout casuali difficili da diagnosticare.
  // getClaims() valida il JWT e, se serve, rinnova la sessione.
  await supabase.auth.getClaims();

  // Restituisci sempre supabaseResponse così com'è, per non perdere i cookie aggiornati.
  return supabaseResponse;
}
