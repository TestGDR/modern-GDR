"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { ActiveToggle, ErrorText, MoveButtons, inputClass, useAdminAction } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { moveItem, saveSheetOption } from "@/lib/actions/admin";
import type { SheetOption } from "@/lib/types";
import { cn } from "@/lib/utils";

const LISTS: { kind: "indirizzo" | "anno" | "club"; title: string }[] = [
  { kind: "indirizzo", title: "Indirizzi di studio" },
  { kind: "anno", title: "Anni di corso" },
  { kind: "club", title: "Squadre e club" },
];

/** Elenchi della scheda: aggiungi, rinomina, disattiva, riordina */
export function SheetListsManager({ options }: { options: SheetOption[] }) {
  const [kind, setKind] = useState<"indirizzo" | "anno" | "club">("indirizzo");
  const list = options.filter((o) => o.kind === kind);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 overflow-x-auto" role="tablist">
        {LISTS.map((l) => (
          <button
            key={l.kind}
            type="button"
            role="tab"
            aria-selected={kind === l.kind}
            onClick={() => setKind(l.kind)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm",
              kind === l.kind ? "bg-flamingo/20 text-white shadow-[inset_0_0_0_1px_var(--flamingo)]" : "text-muted-foreground hover:bg-white/5",
            )}
          >
            {l.title} <span className="text-xs opacity-70">({options.filter((o) => o.kind === l.kind).length})</span>
          </button>
        ))}
      </div>
      <NewItem key={kind} kind={kind} />
      <ul className="flex flex-col gap-2">
        {list.map((o, i) => (
          <ItemRow key={o.id} option={o} first={i === 0} last={i === list.length - 1} />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Le voci disattivate non compaiono più nella creazione, ma restano sulle schede che le hanno già.</p>
    </div>
  );
}

function NewItem({ kind }: { kind: "indirizzo" | "anno" | "club" }) {
  const [name, setName] = useState("");
  const { pending, error, execute } = useAdminAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(() => saveSheetOption({ kind, name, active: true }), () => setName(""));
      }}
      className="flex flex-col gap-2"
    >
      <ErrorText error={error} />
      <div className="flex gap-2">
        <input className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Nuova voce…" required />
        <Button type="submit" disabled={pending} className="h-10 shrink-0 rounded-full">
          <Plus /> Aggiungi
        </Button>
      </div>
    </form>
  );
}

function ItemRow({ option, first, last }: { option: SheetOption; first: boolean; last: boolean }) {
  const [name, setName] = useState(option.name);
  const { pending, error, execute } = useAdminAction();
  const changed = name.trim() !== option.name;
  return (
    <li className={cn("glass flex flex-col gap-2 rounded-2xl p-2.5", !option.active && "opacity-60")}>
      <div className="flex items-center gap-2">
        <MoveButtons first={first} last={last} disabled={pending} onMove={(d) => execute(() => moveItem("sheet_options", option.id, d))} />
        <input className={cn(inputClass, "h-9")} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Nome" />
        {changed && (
          <Button type="button" size="icon" disabled={pending} onClick={() => execute(() => saveSheetOption({ id: option.id, kind: option.kind as "anno", name, active: option.active }))} aria-label="Salva il nome">
            <Check />
          </Button>
        )}
        <ActiveToggle
          checked={option.active}
          label=""
          onChange={(active) => execute(() => saveSheetOption({ id: option.id, kind: option.kind as "anno", name: option.name, active }))}
        />
      </div>
      <ErrorText error={error} />
    </li>
  );
}
