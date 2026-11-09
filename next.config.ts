import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Versione di questa pubblicazione: il banner "Aggiorna" la confronta con /api/versione
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Tornando su una pagina vista da meno di 30 secondi (indietro, mappa ↔ chat)
    // il browser riusa quella che ha: niente chiamata al server.
    // Le azioni che salvano dati svuotano comunque questa cache (refresh).
    staleTimes: { dynamic: 30 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
