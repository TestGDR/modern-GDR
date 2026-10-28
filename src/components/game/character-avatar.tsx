import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type CharacterAvatarProps = {
  initials: string;
  online?: boolean;
  className?: string;
};

/** Avatar del personaggio con iniziali su sfondo "tramonto" e pallino online. */
export function CharacterAvatar({ initials, online, className }: CharacterAvatarProps) {
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar className={cn("size-10 ring-2 ring-white/10", className)}>
        <AvatarFallback className="bg-gradient-to-br from-violet via-orchid to-peach font-heading text-base tracking-wider text-white">
          {initials}
        </AvatarFallback>
      </Avatar>
      {online !== undefined && (
        <span
          className={cn(
            "absolute right-0 bottom-0 size-3 rounded-full ring-2 ring-night",
            online ? "bg-mint" : "bg-muted-foreground/50",
          )}
          aria-label={online ? "Online" : "Offline"}
        />
      )}
    </span>
  );
}
