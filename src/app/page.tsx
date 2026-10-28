import Link from "next/link";
import { Suspense } from "react";
import { RegisteredBanner } from "@/components/auth/auth-forms";
import { Logo } from "@/components/brand/logo";
import { SunsetScene } from "@/components/scenery/sunset-sky";
import { buttonVariants } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Hero a tutto schermo */}
      <section className="relative isolate flex flex-1 flex-col overflow-hidden">
        <SunsetScene className="-z-10" />
        <nav className="flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-10">
          <Logo size="sm" />
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }), "text-white hover:bg-white/15")}>
            Accedi
          </Link>
        </nav>

        <div className="flex flex-1 flex-col items-center px-5 pt-[12vh] pb-16 text-center sm:pt-[14vh]">
          <p className="mb-3 font-heading text-lg tracking-[0.4em] text-sand/90 sm:text-xl">Play by chat</p>
          <h1 className="font-script text-6xl leading-tight text-white drop-shadow-[0_4px_24px_rgb(91_75_181/0.6)] sm:text-8xl">
            {siteConfig.name}
          </h1>
          <p className="mt-4 font-heading text-2xl tracking-[0.3em] text-white/90 sm:text-3xl">{siteConfig.tagline}</p>
          <p className="mt-6 max-w-md text-balance text-white/85">
            Sole, palme e affari sporchi. Crea il tuo personaggio e vivi la tua storia a Miami.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/registrati"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-12 rounded-full px-8 text-base shadow-[0_8px_30px_rgb(255_121_176/0.45)]",
              )}
            >
              Registrati
            </Link>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 rounded-full border-white/40 bg-white/10 px-8 text-base text-white backdrop-blur hover:bg-white/20",
              )}
            >
              Accedi
            </Link>
          </div>
          {/* Compare solo dopo la registrazione (?registrato=1) */}
          <Suspense>
            <RegisteredBanner />
          </Suspense>
        </div>
      </section>

      <footer className="border-t border-border bg-night px-5 py-4 text-center text-xs text-muted-foreground">
        {siteConfig.name} · Un gioco di ruolo amatoriale ambientato in una Miami immaginaria.
      </footer>
    </div>
  );
}
