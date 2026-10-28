import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

type LogoProps = {
  href?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizes = {
  sm: { name: "text-2xl", tag: "text-[0.6rem]" },
  md: { name: "text-3xl", tag: "text-xs" },
  lg: { name: "text-5xl sm:text-7xl", tag: "text-sm sm:text-lg" },
};

export function Logo({ href = "/", size = "md", className }: LogoProps) {
  const s = sizes[size];
  return (
    <Link href={href} className={cn("inline-flex flex-col gap-1 leading-none", className)}>
      <span className={cn("font-script text-sunset pr-2 pb-1 drop-shadow-[0_2px_12px_rgb(255_121_176/0.35)]", s.name)}>
        {siteConfig.name}
      </span>
      <span className={cn("font-heading tracking-[0.35em] text-lavender", s.tag)}>
        {siteConfig.tagline}
      </span>
    </Link>
  );
}
