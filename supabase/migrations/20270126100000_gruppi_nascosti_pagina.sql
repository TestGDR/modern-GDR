-- =====================================================================
-- GRUPPI NASCOSTI: LA PAGINA SI VEDE, I MEMBRI NO
-- Il gruppo nascosto torna visibile in Utility → Gruppi (nome,
-- descrizione, ruoli); restano riservati solo i membri, che vedono i
-- membri stessi e lo staff con gruppi.gestire. Icone mai in scheda
-- (tranne al proprietario) né negli online.
-- =====================================================================
drop policy if exists "Gruppi: lettura" on public.game_groups;
create policy "Gruppi: lettura" on public.game_groups for select to authenticated using (true);

drop policy if exists "Ruoli dei gruppi: lettura" on public.group_roles;
create policy "Ruoli dei gruppi: lettura" on public.group_roles for select to authenticated using (true);

-- i membri restano visibili solo a membri e staff (can_see_group)
drop policy if exists "Membri dei gruppi: lettura" on public.character_groups;
create policy "Membri dei gruppi: lettura" on public.character_groups for select to authenticated
  using ((select public.can_see_group(group_id)));
