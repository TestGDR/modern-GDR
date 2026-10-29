import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Versione di questa pubblicazione: il banner "Aggiorna" la confronta con /api/versione
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
  cacheComponents: true,
  partialPrefetching: true,
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
