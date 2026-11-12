import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

type LogoProps = {
  /** Destinazione del link; null = logo senza link */
  href?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  /** Da caricare subito (es. al centro della homepage) */
  priority?: boolean;
  /** Nell'area di gioco: con la skin Tramonto si vede il logo del tramonto */
  skinAware?: boolean;
};

// Larghezza del logo (l'immagine è 1200x490)
const sizes = {
  xs: "w-40",
  sm: "w-52",
  md: "w-64",
  lg: "w-[min(88vw,640px)]",
};

/** Logo "Neon Campus" (public/images/logo-neon-campus.webp) */
export function Logo({ href = "/", size = "md", className, priority, skinAware = false }: LogoProps) {
  const classes = cn("inline-flex", className);
  const content = (
    <Image
      src="/images/logo-neon-campus.webp"
      alt={siteConfig.name}
      width={1200}
      height={490}
      loading={priority ? "eager" : undefined}
      fetchPriority={priority ? "high" : undefined}
      sizes={size === "lg" ? "(max-width: 728px) 88vw, 640px" : size === "md" ? "256px" : size === "xs" ? "160px" : "208px"}
      className={cn("h-auto drop-shadow-[0_4px_24px_rgb(91_75_181/0.45)]", sizes[size], skinAware && "skin-classic")}
    />
  );
  // skin Tramonto (user_prefs.skin): logo del tramonto (public/images/logo-neon-campus-tramonto.webp, 1200x561)
  const sunset = skinAware ? (
    <Image
      src="/images/logo-neon-campus-tramonto.webp"
      alt={siteConfig.name}
      width={1200}
      height={561}
      sizes={size === "lg" ? "(max-width: 728px) 88vw, 640px" : size === "md" ? "256px" : size === "xs" ? "160px" : "208px"}
      className={cn("skin-sunset h-auto drop-shadow-[0_4px_20px_rgb(255_120_90/0.45)]", sizes[size])}
    />
  ) : null;

  if (href === null)
    return (
      <span className={classes}>
        {content}
        {sunset}
      </span>
    );
  return (
    <Link href={href} className={classes} aria-label={siteConfig.name}>
      {content}
      {sunset}
    </Link>
  );
}
