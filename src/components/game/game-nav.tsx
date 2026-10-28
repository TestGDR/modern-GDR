"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { gameNav } from "@/config/site";
import { cn } from "@/lib/utils";

type IsActive = (href: string) => boolean;
const never: IsActive = () => false;

function useIsActive(): IsActive {
  const pathname = usePathname();
  return (href) => pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarList({ isActive }: { isActive: IsActive }) {
  return (
    <nav className="flex flex-col gap-1">
      {gameNav.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--flamingo)]"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            )}
          >
            <Icon className={cn("size-5", active ? "text-flamingo" : "group-hover:text-peach")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileList({ isActive }: { isActive: IsActive }) {
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
        {gameNav
          .filter((item) => item.mobile)
          .map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-1 text-[0.7rem] font-medium transition-colors",
                    active ? "text-flamingo" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" />
                  {label}
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}

/** Menu verticale per desktop (sidebar). */
export function SidebarNav() {
  return <SidebarList isActive={useIsActive()} />;
}

/** Barra fissa in basso per mobile. */
export function MobileNav() {
  return <MobileList isActive={useIsActive()} />;
}

// Versioni senza evidenziazione, mostrate mentre il percorso non è ancora noto
export function SidebarNavFallback() {
  return <SidebarList isActive={never} />;
}
export function MobileNavFallback() {
  return <MobileList isActive={never} />;
}
