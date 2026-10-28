import Link from "next/link";
import { UserRoundPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Invito a creare il personaggio, mostrato dove serve per partecipare */
export function NeedsCharacter({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 p-4 text-center sm:flex-row sm:text-left", className)}>
      <UserRoundPlus className="size-8 shrink-0 text-flamingo" />
      <p className="flex-1 text-sm text-muted-foreground">{text}</p>
      <Link href="/scheda" className={cn(buttonVariants(), "rounded-full px-5")}>
        Crea il personaggio
      </Link>
    </div>
  );
}
