import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { can, getPlayer } from "@/lib/auth";

// Voce "Gestione": compare solo a chi può accedere al pannello.

export async function AdminSidebarLink() {
  const player = await getPlayer();
  if (!player || !can(player, "admin.accedere")) return null;
  return (
    <Link
      href="/gestione"
      className="group mx-3 mt-2 flex items-center gap-3 rounded-xl border border-peach/25 px-3 py-2.5 text-sm font-medium text-peach transition-colors hover:bg-peach/10"
    >
      <ShieldCheck className="size-5" />
      Gestione
    </Link>
  );
}

export async function AdminMobileLink() {
  const player = await getPlayer();
  if (!player || !can(player, "admin.accedere")) return null;
  return (
    <Link href="/gestione" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Gestione">
      <ShieldCheck className="size-5 text-peach" />
    </Link>
  );
}
