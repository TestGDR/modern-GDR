import { cn } from "@/lib/utils";

/** Icona di uno sport: l'immagine se c'è il link, altrimenti l'emoji */
export function SportIcon({ sport, className }: { sport: { icon: string; icon_url: string | null }; className?: string }) {
  if (sport.icon_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={sport.icon_url} alt="" className={cn("inline-block size-5 rounded object-contain align-[-0.2em]", className)} />;
  }
  return <span aria-hidden>{sport.icon}</span>;
}
