import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

// App installabile (PWA): dal telefono «Installa app» / «Aggiungi alla schermata Home».
// Niente parti offline: il gioco si apre sempre dal sito, quindi è sempre aggiornato.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.description,
    // all'apertura si va alla mappa (chi non ha fatto l'accesso finisce al login)
    start_url: "/mappa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#2a2150",
    theme_color: "#2a2150",
    lang: "it",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
