// Stile delle icone della barra laterale (condiviso da server e browser)
// solo icona: il nome compare nel fumetto (HoverTip) ed è letto dagli screen reader
export const sidebarIconClass =
  "relative grid size-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground [&_svg]:size-[1.15rem] [&_svg]:text-lavender";

// Pulsanti della barra in alto (icona con etichetta sotto)
export const barButtonClass =
  "relative flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:bg-white/10 hover:text-foreground [&_svg]:size-5 sm:px-3";
