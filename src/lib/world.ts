// Costanti del mondo di gioco condivise da server e browser.

/** Sfumature disponibili per i quartieri (token del tema) */
export const GRADIENTS = [
  "from-violet via-flamingo to-sand",
  "from-dusk via-violet to-orchid",
  "from-violet via-orchid to-peach",
  "from-orchid via-flamingo to-peach",
  "from-flamingo via-peach to-sand",
  "from-dusk via-violet to-mint",
  "from-violet via-lavender to-mint",
  "from-orchid via-lavender to-sand",
  "from-dusk via-lavender to-mint",
];

/** Immagini di mappe e chat: archivio "mondo", massimo 5 MB */
export const WORLD_BUCKET = "mondo";
export const WORLD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const WORLD_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
