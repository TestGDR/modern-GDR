import { isImageIcon } from "@/lib/fame";
import { cn } from "@/lib/utils";

/** Icona di un livello o di un badge: emoji oppure immagine (link https) */
export function FameIcon({ icon, label, className }: { icon: string; label: string; className?: string }) {
  if (!icon) return null;
  if (isImageIcon(icon)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt={label} className={cn("inline-block size-5 shrink-0 rounded object-contain", className)} />;
  }
  return (
    <span role="img" aria-label={label} className={cn("inline-block leading-none", className)}>
      {icon}
    </span>
  );
}
