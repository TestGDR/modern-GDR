"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CreationOption } from "@/lib/types";
import { cn } from "@/lib/utils";

// Dipartimenti dei corsi (letti una volta sola per pagina)
let departmentsCache: Promise<string[]> | null = null;
function loadDepartments() {
  departmentsCache ??= Promise.resolve(createClient().from("courses").select("department").eq("active", true)).then(({ data }) =>
    [...new Set(((data ?? []) as { department: string }[]).map((c) => c.department).filter(Boolean))].sort(),
  );
  return departmentsCache;
}

/** Campo della scelta richiesta da una voce: dipartimento dall'elenco dei corsi, altrimenti testo libero */
export function OptionChoice({ option, value, onChange }: { option: CreationOption; value: string; onChange: (v: string) => void }) {
  const [departments, setDepartments] = useState<string[]>([]);
  const isDept = option.requires_choice === "dipartimento";
  useEffect(() => {
    if (!isDept) return;
    let alive = true;
    loadDepartments().then((d) => alive && setDepartments(d));
    return () => {
      alive = false;
    };
  }, [isDept]);

  const className = cn("h-8 min-w-0 flex-1 rounded-lg border bg-night/40 px-2 outline-none", value.trim() ? "border-input" : "border-peach/60");
  if (isDept) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={`Dipartimento per ${option.name}`} className={className}>
        <option value="">Scegli il dipartimento</option>
        {departments.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      value={value}
      maxLength={80}
      onChange={(e) => onChange(e.target.value)}
      placeholder={option.choice_hint ? `Indica ${option.choice_hint}` : "La tua scelta"}
      aria-label={`Scelta per ${option.name}`}
      className={className}
    />
  );
}
