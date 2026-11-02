-- =====================================================================
-- GRUPPI NASCOSTI
-- Un gruppo nascosto (game_groups.hidden) non si vede: niente icona nella
-- scheda né nell'elenco degli online, niente pagina in Utility → Gruppi.
-- Lo vedono solo i suoi membri (il proprio gruppo e i compagni) e lo
-- staff con gruppi.gestire (Gestione → Gruppi, con tutti i membri).
-- Le regole del gioco che usano i gruppi (mercato nero, forum riservati,
-- stipendi) continuano a funzionare.
-- =====================================================================

alter table public.game_groups add column if not exists hidden boolean not null default false;

-- il giocatore collegato ha un personaggio in questo gruppo?
create or replace function public.in_my_group(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.character_groups cg join public.characters c on c.id = cg.character_id
    where cg.group_id = p_group and c.owner_id = auth.uid())
$$;
revoke execute on function public.in_my_group(uuid) from public, anon;
grant execute on function public.in_my_group(uuid) to authenticated;

-- il gruppo si può vedere?
create or replace function public.can_see_group(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not coalesce((select hidden from public.game_groups where id = p_group), false)
    or public.has_permission('gruppi.gestire')
    or public.in_my_group(p_group)
$$;
revoke execute on function public.can_see_group(uuid) from public, anon;
grant execute on function public.can_see_group(uuid) to authenticated;

drop policy if exists "Gruppi: lettura" on public.game_groups;
create policy "Gruppi: lettura" on public.game_groups for select to authenticated
  using (not hidden or (select public.has_permission('gruppi.gestire')) or (select public.in_my_group(id)));

drop policy if exists "Ruoli dei gruppi: lettura" on public.group_roles;
create policy "Ruoli dei gruppi: lettura" on public.group_roles for select to authenticated
  using ((select public.can_see_group(group_id)));

drop policy if exists "Membri dei gruppi: lettura" on public.character_groups;
create policy "Membri dei gruppi: lettura" on public.character_groups for select to authenticated
  using ((select public.can_see_group(group_id)));

-- le squadre sportive non si nascondono
create or replace function public.game_groups_hidden_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.hidden and new.kind = 'sport' then
    raise exception 'Le squadre sportive non si possono nascondere.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.game_groups_hidden_check() from public, anon, authenticated;
drop trigger if exists game_groups_hidden_check on public.game_groups;
create trigger game_groups_hidden_check before insert or update of hidden on public.game_groups
  for each row execute function public.game_groups_hidden_check();
