import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, getClientIp, logAccess } from "@/lib/access-log";

// Pagine riservate a chi ha fatto l'accesso
const PROTECTED = ["/bacheca", "/mappa", "/chat", "/messaggi", "/social", "/forum", "/scheda", "/gestione", "/ticket", "/utility", "/nuova-password"];

function matches(pathname: string, paths: string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

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
  const { data } = await supabase.auth.getClaims();
  const loggedIn = !!data?.claims?.sub;
  const { pathname } = request.nextUrl;

  // Controllo "ottimistico": la verifica vera avviene comunque
  // sul server (requirePlayer) e nel database (RLS).
  if (!loggedIn && matches(pathname, PROTECTED)) {
    return redirectKeepingCookies(request, supabaseResponse, "/login");
  }

  // Registro degli accessi: un accesso nuovo quando cambia l'IP (o l'utente)
  if (loggedIn && !pathname.startsWith("/api/")) {
    const ip = getClientIp(request.headers);
    const mark = `${data.claims.sub}|${ip ?? ""}`;
    if (ip && request.cookies.get(ACCESS_COOKIE)?.value !== mark) {
      await logAccess({ userId: data.claims.sub, event: "accesso", ip, userAgent: request.headers.get("user-agent") });
      supabaseResponse.cookies.set(ACCESS_COOKIE, mark, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 30 });
    }
  }

  // Restituisci sempre supabaseResponse così com'è, per non perdere i cookie aggiornati.
  return supabaseResponse;
}

// Un redirect deve portarsi dietro i cookie di sessione appena aggiornati
function redirectKeepingCookies(request: NextRequest, from: NextResponse, path: string) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  const response = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}
