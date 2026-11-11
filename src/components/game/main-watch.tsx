"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isModalPath } from "@/components/game/page-modal";

/** Id del contenitore della pagina nell'area centrale */
export const MAIN_ID = "gdr-main";

// C'è qualcosa di visibile nell'area centrale? (le pagine tenute in memoria da Next.js sono nascoste con display: none)
function mainIsEmpty() {
  const el = document.getElementById(MAIN_ID);
  if (!el) return false;
  return !Array.from(el.children).some((c) => c.getClientRects().length > 0);
}

/**
 * A volte Next.js lascia nascosta la pagina di sotto (es. la mappa) dopo la
 * chiusura di una finestra: l'indirizzo è giusto ma l'area centrale è vuota.
 * Se succede si richiede la pagina; se resta vuota si ricarica (una volta).
 */
export function MainWatch() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isModalPath(pathname)) return;
    const key = `gdr_rimostra:${pathname}`;
    const t1 = setTimeout(() => {
      if (!mainIsEmpty()) return;
      router.replace(pathname + window.location.search, { scroll: false });
    }, 1500);
    const t2 = setTimeout(() => {
      if (!mainIsEmpty() || isModalPath(window.location.pathname)) return;
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch {
        return;
      }
      window.location.replace(window.location.href);
    }, 6000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname, router]);

  // pagina tornata visibile: si può riprovare in futuro
  useEffect(() => {
    if (isModalPath(pathname)) return;
    const t = setTimeout(() => {
      if (mainIsEmpty()) return;
      try {
        sessionStorage.removeItem(`gdr_rimostra:${pathname}`);
      } catch {
        // niente
      }
    }, 8000);
    return () => clearTimeout(t);
  }, [pathname]);

  return null;
}
