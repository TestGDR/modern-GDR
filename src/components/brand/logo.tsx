import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

type LogoProps = {
  /** Destinazione del link; null = logo senza link */
  href?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Da caricare subito (es. al centro della homepage) */
  priority?: boolean;
};

// Larghezza del logo (l'immagine è 1200x490)
const sizes = {
  sm: "w-52",
  md: "w-64",
  lg: "w-[min(88vw,640px)]",
};

/** Logo "Neon Campus" (public/images/logo-neon-campus.webp) */
export function Logo({ href = "/", size = "md", className, priority }: LogoProps) {
  const classes = cn("inline-flex", className);
  const content = (
    <Image
      src="/images/logo-neon-campus.webp"
      alt={siteConfig.name}
      width={1200}
      height={490}
      loading={priority ? "eager" : undefined}
      fetchPriority={priority ? "high" : undefined}
      sizes={size === "lg" ? "(max-width: 728px) 88vw, 640px" : size === "md" ? "256px" : "208px"}
      className={cn("h-auto drop-shadow-[0_4px_24px_rgb(91_75_181/0.45)]", sizes[size])}
    />
  );

  if (href === null) return <span className={classes}>{content}</span>;
  return (
    <Link href={href} className={classes} aria-label={siteConfig.name}>
      {content}
    </Link>
  );
}
