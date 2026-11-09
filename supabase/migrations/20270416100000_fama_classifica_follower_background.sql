-- =====================================================================
-- FAMA: CLASSIFICA PER LIVELLO E ATTESA PER CHI HA I FOLLOWER DAL BACKGROUND
-- - La classifica della fama è ordinata per livello (che può venire anche
--   dai follower), poi per punti.
-- - Chi ha follower dalla voce di background (es. Influencer 50.000) non
--   compra pacchetti di follower per social_bg_attesa_mesi (6) mesi
--   dall'approvazione della scheda. Le campagne restano libere.
-- - characters.approved_at: data dell'ultima approvazione (per i personaggi
--   già approvati: il primo movimento del conto, cioè la quota iniziale).
-- =====================================================================

-- 1. DATA DI APPROVAZIONE
alter table public.characters add column if not exists approved_at timestamptz;

update public.characters c
set approved_at = coalesce(
  (select min(t.created_at) from public.bank_transactions t where t.character_id = c.id),
  (select sp.created_at from public.social_profiles sp where sp.character_id = c.id),
  c.updated_at)
where c.status = 'approvata' and c.approved_at is null;

create or replace function public.characters_approved_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approvata' and old.status is distinct from 'approvata' then
    new.approved_at := now();
  elsif auth.uid() is not null then
    -- la data la scrive solo l'approvazione (dall'SQL Editor si può correggere)
    new.approved_at := old.approved_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.characters_approved_at() from public, anon, authenticated;
drop trigger if exists characters_approved_at on public.characters;
create trigger characters_approved_at before update on public.characters
  for each row execute function public.characters_approved_at();

-- 2. ATTESA PER I PACCHETTI DI FOLLOWER
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('social_bg_attesa_mesi', '6', 'number', 'Social · Attesa per chi ha follower dal background (mesi)',
   'Chi ha follower da una voce di background (es. Influencer) non compra pacchetti di follower per questi mesi dall''approvazione della scheda (0 = nessuna attesa).', 90)
on conflict (key) do nothing;

create or replace function public.social_buy(p_character uuid, p_package uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.social_packages;
  c public.characters;
  v_caught boolean := false;
  v_infamy int := coalesce(public.setting_int('social_comprati_infamia'), 5);
  v_wait int := coalesce(public.setting_int('social_bg_attesa_mesi'), 6);
  v_until timestamptz;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if not exists (select 1 from public.social_profiles where character_id = p_character) then
    raise exception 'Prima crea il tuo profilo social.' using errcode = 'P0001';
  end if;
  select * into k from public.social_packages where id = p_package and active;
  if k.id is null then raise exception 'Pacchetto non disponibile.' using errcode = 'P0001'; end if;
  select * into c from public.characters where id = p_character;
  -- follower dal background: come tutti, prima si cresce con i tempi del social
  if k.kind = 'follower' and v_wait > 0
     and exists (select 1 from public.social_profiles where character_id = p_character and bg_followers > 0) then
    v_until := coalesce(c.approved_at, now()) + make_interval(months => v_wait);
    if v_until > now() then
      raise exception 'Hai già i follower del tuo background: potrai comprarne altri dal %.',
        to_char(v_until at time zone 'Europe/Rome', 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
  end if;
  perform public.bank_move(p_character, -k.price, 'servizio', 'Social: ' || k.name, true);
  if k.kind = 'follower' then
    update public.social_profiles set bought_followers = bought_followers + k.amount, bought_paid = bought_paid + k.amount where character_id = p_character;
    v_caught := random() * 100 < coalesce(public.setting_int('social_comprati_rischio_pct'), 10);
    if v_caught and v_infamy > 0 then
      insert into public.fame_entries (character_id, title, description, points, kind, is_public, author_id)
      values (p_character, 'Follower comprati', 'Qualcuno ha scoperto che ' || public.first_name(c.name) || ' ha comprato follower.', v_infamy, 'infamia', true, null);
    end if;
  else
    update public.social_profiles
    set boost_until = greatest(coalesce(boost_until, now()), now()) + make_interval(days => k.days),
        boost_mult = greatest(k.multiplier, case when boost_until > now() then boost_mult else 1 end)
    where character_id = p_character;
  end if;
  insert into public.social_purchases (character_id, package_id, name, price, caught) values (p_character, k.id, k.name, k.price, v_caught);
  return jsonb_build_object('kind', k.kind, 'amount', k.amount, 'days', k.days, 'caught', v_caught);
end;
$$;
revoke execute on function public.social_buy(uuid, uuid) from public, anon;
grant execute on function public.social_buy(uuid, uuid) to authenticated;

-- 3. CLASSIFICA PER LIVELLO, POI PER PUNTI
create or replace function public.fame_ranking()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(t.x order by t.lv desc, t.fame desc, t.name), '[]'::jsonb)
  from (
    select y.x, coalesce((y.x -> 'level' ->> 'min')::int, 0) as lv, y.fame, y.name
    from (
      select jsonb_build_object('id', c.id, 'name', c.name, 'avatar_url', c.avatar_url, 'fame', f.fame_cache,
        'infamy', case when coalesce(public.setting_int('fama_infamia_attiva'), 1) = 1 then f.infamy_cache end,
        'level', public.fame_level_info(f.fame_cache, 'fama', public.social_followers_total(c.id))) as x,
        f.fame_cache as fame, c.name
      from public.character_fame f join public.characters c on c.id = f.character_id
      where c.status = 'approvata' and auth.uid() is not null
    ) y
    order by lv desc, y.fame desc, y.name
    limit greatest(0, coalesce(public.setting_int('fama_classifica_n'), 20))
  ) t
$$;
