import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// In Next.js 16 il "middleware" si chiama "proxy".
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    {
      // Ogni richiesta che passa da qui è una chiamata alle funzioni di Vercel.
      // Esclusi: file statici (immagini, suoni, icone, manifest), il controllo della
      // versione e i prefetch dei link (la sessione si rinnova alla navigazione vera).
      source:
        "/((?!_next/static|_next/image|api/versione|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp3|mp4|webm|ogg|wav|woff|woff2|ttf|txt|xml|json|webmanifest)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
