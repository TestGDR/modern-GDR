-- =====================================================================
-- MASSIMO DI GRUPPI PER AMBITO
-- Ogni ambito ha un massimo di gruppi per personaggio (vuoto = senza
-- limite): un gruppo fuori campus, uno del college, un club o
-- fratellanza. Le squadre sportive seguono le regole dello sport
-- (una squadra, due solo con il vantaggio "Doppio sport").
-- Resta anche il massimo complessivo "max_gruppi".
-- =====================================================================

alter table public.group_categories
  add column if not exists max_per_character int check (max_per_character is null or max_per_character >= 1);

update public.group_categories set max_per_character = 1
where not for_sport and max_per_character is null;

create or replace function public.character_groups_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int := greatest(1, coalesce(public.setting_int('max_gruppi'), 3));
  r public.group_roles;
  g public.game_groups;
  cat public.group_categories;
begin
  select * into r from public.group_roles where id = new.role_id and group_id = new.group_id;
  if r.id is null then
    raise exception 'Il ruolo non appartiene a questo gruppo.' using errcode = 'P0001';
  end if;
  perform 1 from public.characters where id = new.character_id for update;
  if not exists (select 1 from public.characters where id = new.character_id and status = 'approvata') then
    raise exception 'I gruppi si danno solo ai personaggi approvati.' using errcode = 'P0001';
  end if;
  if r.max_members is not null and (tg_op = 'INSERT' or old.role_id is distinct from new.role_id)
     and (select count(*) from public.character_groups where role_id = r.id and character_id <> new.character_id) >= r.max_members then
    raise exception 'Il ruolo «%» è al completo.', r.name using errcode = 'P0001';
  end if;
  select * into g from public.game_groups where id = new.group_id;
  -- le squadre sportive seguono le regole dello sport
  if g.kind = 'normale' then
    if (
      select count(*) from public.character_groups cg join public.game_groups g2 on g2.id = cg.group_id
      where cg.character_id = new.character_id and cg.group_id <> new.group_id and g2.kind = 'normale'
    ) >= v_max then
      raise exception 'Un personaggio può far parte al massimo di % gruppi.', v_max using errcode = 'P0001';
    end if;
    -- massimo dell'ambito
    select * into cat from public.group_categories where id = g.category_id;
    if cat.max_per_character is not null and (
      select count(*) from public.character_groups cg join public.game_groups g2 on g2.id = cg.group_id
      where cg.character_id = new.character_id and cg.group_id <> new.group_id and g2.kind = 'normale' and g2.category_id = cat.id
    ) >= cat.max_per_character then
      raise exception 'Nell''ambito «%» si può far parte di % gruppo/i al massimo.', cat.name, cat.max_per_character using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.character_groups_check() from public, anon, authenticated;
