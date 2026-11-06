-- =====================================================================
-- PNG DEI GIOCATORI ANCHE DELLA CITTÀ
-- - npcs.in_city: un PNG di un giocatore può essere anche della città
--   (compare in «Della città» e altri personaggi possono legarsi a lui).
--   Lo sceglie il giocatore proponendolo (torna in approvazione) o lo staff.
-- - I legami (npc_links) valgono per i PNG della città e per quelli dei
--   giocatori segnati «anche della città».
-- =====================================================================

alter table public.npcs add column if not exists in_city boolean not null default false;

drop policy if exists "PNG: legami proposti dal giocatore" on public.npc_links;
create policy "PNG: legami proposti dal giocatore" on public.npc_links for insert to authenticated
  with check (
    (select public.has_permission('png.gestire'))
    or (status = 'proposto' and public.owns_character(character_id)
        and exists (select 1 from public.npcs n
                    where n.id = npc_id and (n.kind = 'ambiente' or n.in_city) and n.status = 'approvato' and n.active
                      and n.owner_character_id is distinct from character_id))
  );
