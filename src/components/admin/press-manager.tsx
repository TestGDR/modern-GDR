"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Gestione → Giornale e podcast (permesso giornale.gestire): i gruppi i cui
// membri scrivono sul Campus Wire e, dentro, i ruoli che pubblicano.

type Role = { id: string; name: string; press_editor: boolean };
type Group = { id: string; name: string; press_access: boolean; roles: Role[] };

export function PressManager() {
  const supabase = useMemo(() => createClient(), []);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("press_staff_groups");
    if (e) setError("Elenco non caricato.");
    setGroups((data as Group[] | null) ?? []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    void load();
  }, [load]);

  async function setGroup(id: string, value: boolean) {
    setError(null);
    const { error: e } = await supabase.rpc("press_set_group", { p_group: id, p_access: value });
    if (e) setError("Modifica non salvata.");
    await load();
  }
  async function setRole(id: string, value: boolean) {
    setError(null);
    const { error: e } = await supabase.rpc("press_set_role", { p_role: id, p_editor: value });
    if (e) setError("Modifica non salvata.");
    await load();
  }

  if (groups === null) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="glass rounded-2xl p-4 text-sm text-muted-foreground">
        I membri dei gruppi spuntati scrivono articoli e podcast e li mandano in redazione. Li pubblicano i membri con un ruolo spuntato in «Pubblica»
        (all&apos;inizio Direttore e Caporedattore del Club Giornalistico) e chi ha il permesso «Gestire il giornale». La fama data dai pezzi più apprezzati si regola
        in Impostazioni del sistema (voci «Giornale»).
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ul className="flex flex-col gap-2">
        {groups.map((g) => (
          <li key={g.id} className={cn("rounded-xl border p-3", g.press_access ? "border-peach/40 bg-peach/10" : "border-white/10 bg-white/5")}>
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" checked={g.press_access} onChange={(e) => setGroup(g.id, e.target.checked)} />
              {g.name}
              <span className="text-xs font-normal text-muted-foreground">{g.press_access ? "scrive sul giornale" : "non scrive"}</span>
            </label>
            {g.press_access && g.roles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-6 text-sm">
                <span className="text-xs text-muted-foreground">Pubblica:</span>
                {g.roles.map((r) => (
                  <label key={r.id} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={r.press_editor} onChange={(e) => setRole(r.id, e.target.checked)} />
                    {r.name}
                  </label>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
