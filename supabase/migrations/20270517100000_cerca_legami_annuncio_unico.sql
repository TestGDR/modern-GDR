-- =====================================================================
-- CERCA LEGAMI: UN ANNUNCIO PER PERSONAGGIO CON PIÙ RUOLI
-- bond_ads = l'annuncio (uno per personaggio: titolo e presentazione);
-- bond_searches diventano i ruoli cercati dentro l'annuncio (nome,
-- descrizione, tag), legati con bond_searches_ad_fk. «Trova» e i match
-- restano sui ruoli. Gli annunci già pubblicati ricevono il loro
-- annuncio «Cerco legami». legami_max = ruoli per annuncio (10).
-- =====================================================================

create table if not exists public.bond_ads (
  character_id uuid primary key references public.characters (id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null default 'Cerco legami' check (char_length(btrim(title)) between 3 and 100),
  description text not null default '' check (char_length(description) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bond_ads_owner_idx on public.bond_ads (owner_id);

create or replace function public.bond_ads_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.characters where id = new.character_id and status = 'approvata') then
      raise exception 'Cerca legami è per i personaggi approvati.' using errcode = 'P0001';
    end if;
  else
    new.character_id := old.character_id;
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
drop trigger if exists bond_ads_check on public.bond_ads;
create trigger bond_ads_check before insert or update on public.bond_ads
  for each row execute function public.bond_ads_check();

alter table public.bond_ads enable row level security;
revoke all on public.bond_ads from anon, authenticated;
grant select, delete on public.bond_ads to authenticated;
grant insert (character_id, title, description) on public.bond_ads to authenticated;
grant update (title, description) on public.bond_ads to authenticated;
drop policy if exists "Annunci dei legami: li vedono tutti" on public.bond_ads;
create policy "Annunci dei legami: li vedono tutti" on public.bond_ads for select to authenticated using (true);
drop policy if exists "Annunci dei legami: col proprio personaggio" on public.bond_ads;
create policy "Annunci dei legami: col proprio personaggio" on public.bond_ads for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.owns_character(character_id)));
drop policy if exists "Annunci dei legami: si modifica il proprio" on public.bond_ads;
create policy "Annunci dei legami: si modifica il proprio" on public.bond_ads for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "Annunci dei legami: lo toglie chi l'ha scritto o lo staff" on public.bond_ads;
create policy "Annunci dei legami: lo toglie chi l'ha scritto o lo staff" on public.bond_ads for delete to authenticated
  using (owner_id = (select auth.uid()) or (select public.has_permission('ricerca.moderare')));

-- gli annunci di chi aveva già ruoli (i ruoli di schede non più approvate si tolgono)
delete from public.bond_searches s
where not exists (select 1 from public.characters c where c.id = s.character_id and c.status = 'approvata');
insert into public.bond_ads (character_id, owner_id, title, created_at)
select s.character_id, min(s.owner_id::text)::uuid, 'Cerco legami', min(s.created_at)
from public.bond_searches s
group by s.character_id
on conflict (character_id) do nothing;

-- i ruoli appartengono all'annuncio (togliendo l'annuncio si tolgono i ruoli)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bond_searches_ad_fk') then
    alter table public.bond_searches add constraint bond_searches_ad_fk
      foreign key (character_id) references public.bond_ads (character_id) on delete cascade;
  end if;
end $$;

-- 10 ruoli per annuncio
update public.game_settings set value = '10', label = 'Cerca legami · Ruoli per annuncio',
  description = 'Quanti ruoli (legami cercati) può avere l''annuncio di un personaggio.'
where key = 'legami_max' and value = '5';

-- ruolo nuovo: l'annuncio si crea da solo se non c'è
create or replace function public.bond_searches_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  t text;
  v_tags text[] := '{}';
begin
  foreach t in array coalesce(new.tags, '{}') loop
    t := lower(btrim(regexp_replace(t, '\s+', ' ', 'g')));
    continue when t = '' or t = any (v_tags);
    if char_length(t) < 2 or char_length(t) > 30 then raise exception 'Ogni tag va da 2 a 30 caratteri.' using errcode = 'P0001'; end if;
    v_tags := v_tags || t;
  end loop;
  if cardinality(v_tags) = 0 then raise exception 'Scegli almeno un tag.' using errcode = 'P0001'; end if;
  if cardinality(v_tags) > 8 then raise exception 'Al massimo 8 tag per ruolo.' using errcode = 'P0001'; end if;
  new.tags := v_tags;
  new.title := btrim(new.title);
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.characters where id = new.character_id and status = 'approvata') then
      raise exception 'Cerca legami è per i personaggi approvati.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.bond_searches where character_id = new.character_id) >= coalesce(public.setting_int('legami_max'), 10) then
      raise exception 'L''annuncio ha già il numero massimo di ruoli: togline uno per aggiungerne un altro.' using errcode = 'P0001';
    end if;
    insert into public.bond_ads (character_id) values (new.character_id) on conflict (character_id) do nothing;
  else
    new.character_id := old.character_id;
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

-- «Trova»: anche il titolo dell'annuncio
create or replace function public.bond_discover(p_pg uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_pg) then raise exception 'Personaggio non valido.'; end if;
  return coalesce((
    select jsonb_agg(x order by x.shared_count desc, x.created_at desc)
    from (
      select s.id, s.title, s.description, s.tags, s.created_at, s.character_id, s.owner_id,
        c.name, c.avatar_url, a.title as ad_title,
        (select array_agg(distinct t order by t) from unnest(s.tags) t
          where t in (select unnest(m.tags) from public.bond_searches m where m.character_id = p_pg)) as shared,
        cardinality((select array_agg(distinct t) from unnest(s.tags) t
          where t in (select unnest(m.tags) from public.bond_searches m where m.character_id = p_pg))) as shared_count,
        (select array_agg(m.title order by m.created_at) from public.bond_searches m
          where m.character_id = p_pg and m.tags && s.tags) as my_titles
      from public.bond_searches s
      join public.characters c on c.id = s.character_id and c.status = 'approvata'
      left join public.bond_ads a on a.character_id = s.character_id
      where s.owner_id <> auth.uid()
        and s.tags && (select coalesce(array_agg(t), '{}') from public.bond_searches m, unnest(m.tags) t where m.character_id = p_pg)
        and not exists (select 1 from public.bond_votes v where v.character_id = p_pg and v.search_id = s.id)
      limit 100
    ) x
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.bond_discover(uuid) from public, anon;
grant execute on function public.bond_discover(uuid) to authenticated;

-- il reset della scheda toglie anche l'annuncio
create or replace function public.characters_reset_bonds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'bozza' and old.status = 'approvata' and new.creation_step = 1 then
    delete from public.bond_ads where character_id = new.id;
    delete from public.bond_searches where character_id = new.id;
    delete from public.bond_votes where character_id = new.id;
    delete from public.bond_matches where new.id in (character_a, character_b);
  end if;
  return null;
end;
$$;
revoke execute on function public.characters_reset_bonds() from public, anon, authenticated;
