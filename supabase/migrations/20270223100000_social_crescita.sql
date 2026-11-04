-- =====================================================================
-- SOCIAL: PUBBLICO PNG, LIKE AUTOMATICI, FOLLOWER E CAMPAGNE A PAGAMENTO
-- Ogni profilo ha, oltre ai follower veri (i giocatori), un pubblico PNG
-- (npc_followers) che cresce ogni giorno secondo il livello di fama
-- (fame_levels.social_followers_day) e cala se non si pubblica
-- (social_inattivo_giorni, social_calo_inattivo_pct). I follower comprati
-- (bought_followers) calano ogni giorno (social_comprati_calo_pct) e a ogni
-- acquisto c'è il rischio (social_comprati_rischio_pct) che si scopra:
-- voce di infamia (social_comprati_infamia). Le campagne sponsorizzate
-- moltiplicano crescita e like per qualche giorno. I post ricevono like
-- PNG nei primi giorni (social_like_pct del pubblico in social_like_giorni).
-- Superate le soglie di follower (social_soglie_follower) arriva da sola
-- una voce di fama (social_soglie_fama). Tutto in Gestione → Fama → Social.
-- Crescita una volta al giorno (pg_cron «social-crescita», social_grow_all).
-- =====================================================================

-- 1. IMPOSTAZIONI
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('social_like_pct', '4', 'number', 'Social · Like PNG per post (% del pubblico)', 'Quanti like PNG riceve in tutto un post, in percentuale dei follower (veri + PNG + comprati).', 420),
  ('social_like_giorni', '3', 'number', 'Social · Giorni in cui un post riceve like PNG', 'I like PNG arrivano un po'' al giorno nei primi giorni dopo la pubblicazione.', 421),
  ('social_inattivo_giorni', '7', 'number', 'Social · Giorni senza post prima di perdere pubblico', 'Chi non pubblica da più di questi giorni non cresce e perde un po'' di pubblico PNG ogni giorno.', 422),
  ('social_calo_inattivo_pct', '1', 'number', 'Social · Calo del pubblico di chi non pubblica (% al giorno)', 'Quanto pubblico PNG si perde ogni giorno senza post.', 423),
  ('social_comprati_calo_pct', '3', 'number', 'Social · Calo dei follower comprati (% al giorno)', 'I follower comprati se ne vanno un po'' ogni giorno. 0 = restano per sempre.', 424),
  ('social_comprati_rischio_pct', '10', 'number', 'Social · Rischio che si scopra l''acquisto (%)', 'A ogni pacchetto di follower comprato, probabilità che qualcuno se ne accorga. 0 = mai.', 425),
  ('social_comprati_infamia', '5', 'number', 'Social · Infamia se si scopre l''acquisto', 'Punti di infamia della voce «Follower comprati» quando si scopre.', 426),
  ('social_soglie_follower', '[10000, 50000, 100000, 500000]', 'numbers', 'Social · Soglie di follower', 'Superata una soglia arriva da sola una voce di fama (una volta per soglia).', 427),
  ('social_soglie_fama', '[5, 10, 20, 40]', 'numbers', 'Social · Fama per ogni soglia', 'Punti di fama della voce per ogni soglia, nello stesso ordine.', 428)
on conflict (key) do nothing;

-- 2. CRESCITA PER LIVELLO DI FAMA (pubblico PNG in più al giorno)
alter table public.fame_levels add column if not exists social_followers_day int not null default 0 check (social_followers_day between 0 and 1000000);
update public.fame_levels l set social_followers_day = v.n
from (values ('Sconosciuto', 3), ('Noto nel campus', 20), ('Popolare', 80), ('Celebre', 300), ('Leggenda di San Diego', 1200)) as v (name, n)
where l.kind = 'fama' and l.name = v.name and l.social_followers_day = 0;

-- 3. PROFILI E POST
alter table public.social_profiles
  add column if not exists npc_followers int not null default 0 check (npc_followers >= 0),
  add column if not exists bought_followers int not null default 0 check (bought_followers >= 0),
  add column if not exists boost_until timestamptz,
  add column if not exists boost_mult numeric(4, 1) not null default 1,
  add column if not exists grown_on date;
alter table public.social_posts add column if not exists npc_likes int not null default 0 check (npc_likes >= 0);
-- i giocatori non toccano questi numeri (sui profili le colonne nuove non sono scrivibili;
-- sui post un post nuovo parte sempre da 0 like PNG)
create or replace function public.social_posts_npc_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then new.npc_likes := 0;
  elsif (select auth.uid()) is not null and current_user <> 'postgres' then new.npc_likes := old.npc_likes;
  end if;
  return new;
end;
$$;
drop trigger if exists social_posts_npc_guard on public.social_posts;
create trigger social_posts_npc_guard before insert or update on public.social_posts
  for each row execute function public.social_posts_npc_guard();

-- 4. PACCHETTI IN VENDITA
create table if not exists public.social_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text not null default '' check (char_length(description) <= 300),
  kind text not null default 'follower' check (kind in ('follower', 'campagna')),
  amount int not null default 0 check (amount between 0 and 10000000),
  days int not null default 0 check (days between 0 and 365),
  multiplier numeric(4, 1) not null default 1 check (multiplier between 1 and 20),
  price int not null default 0 check (price between 0 and 100000000),
  active boolean not null default true,
  sort_order int not null default 0
);
alter table public.social_packages enable row level security;
revoke all on public.social_packages from anon;
drop policy if exists "Social: pacchetti letti da tutti" on public.social_packages;
create policy "Social: pacchetti letti da tutti" on public.social_packages for select to authenticated using (true);
drop policy if exists "Social: pacchetti dello staff" on public.social_packages;
create policy "Social: pacchetti dello staff" on public.social_packages for insert to authenticated with check ((select public.has_permission('fama.gestire')));
drop policy if exists "Social: pacchetti modificati dallo staff" on public.social_packages;
create policy "Social: pacchetti modificati dallo staff" on public.social_packages for update to authenticated
  using ((select public.has_permission('fama.gestire'))) with check ((select public.has_permission('fama.gestire')));
drop policy if exists "Social: pacchetti tolti dallo staff" on public.social_packages;
create policy "Social: pacchetti tolti dallo staff" on public.social_packages for delete to authenticated using ((select public.has_permission('fama.gestire')));
drop trigger if exists social_packages_log on public.social_packages;
create trigger social_packages_log after insert or update or delete on public.social_packages
  for each row execute function public.log_admin_change();

insert into public.social_packages (name, description, kind, amount, days, multiplier, price, sort_order)
select v.* from (values
  ('1.000 follower', 'Un pacchetto di follower da un sito poco raccomandabile.', 'follower', 1000, 0, 1.0, 150, 1),
  ('10.000 follower', 'Diecimila account nuovi che ti seguono in un giorno.', 'follower', 10000, 0, 1.0, 1200, 2),
  ('50.000 follower', 'Un salto da influencer: costa caro e si nota.', 'follower', 50000, 0, 1.0, 5000, 3),
  ('Campagna sponsorizzata (3 giorni)', 'Per tre giorni il profilo cresce il doppio e i post nuovi prendono il doppio dei like.', 'campagna', 0, 3, 2.0, 300, 4),
  ('Campagna sponsorizzata (7 giorni)', 'Una settimana di visibilità: crescita e like triplicati.', 'campagna', 0, 7, 3.0, 1000, 5)
) as v (name, description, kind, amount, days, multiplier, price, sort_order)
where not exists (select 1 from public.social_packages);

-- 5. ACQUISTI
create table if not exists public.social_purchases (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  package_id uuid references public.social_packages (id) on delete set null,
  name text not null,
  price int not null,
  caught boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists social_purchases_character_idx on public.social_purchases (character_id, created_at desc);
create index if not exists social_purchases_package_idx on public.social_purchases (package_id);
alter table public.social_purchases enable row level security;
revoke all on public.social_purchases from anon;
drop policy if exists "Social: acquisti propri e dello staff" on public.social_purchases;
create policy "Social: acquisti propri e dello staff" on public.social_purchases for select to authenticated
  using ((select public.owns_character(character_id)) or (select public.has_permission('fama.gestire')));
drop policy if exists "Social: acquisti dalle funzioni" on public.social_purchases;
create policy "Social: acquisti dalle funzioni" on public.social_purchases for insert to authenticated with check (false);
drop policy if exists "Social: acquisti non si modificano" on public.social_purchases;
create policy "Social: acquisti non si modificano" on public.social_purchases for update to authenticated using (false);
drop policy if exists "Social: acquisti non si cancellano" on public.social_purchases;
create policy "Social: acquisti non si cancellano" on public.social_purchases for delete to authenticated using (false);

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
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if not exists (select 1 from public.social_profiles where character_id = p_character) then
    raise exception 'Prima crea il tuo profilo social.' using errcode = 'P0001';
  end if;
  select * into k from public.social_packages where id = p_package and active;
  if k.id is null then raise exception 'Pacchetto non disponibile.' using errcode = 'P0001'; end if;
  select * into c from public.characters where id = p_character;
  perform public.bank_move(p_character, -k.price, 'servizio', 'Social: ' || k.name, true);
  if k.kind = 'follower' then
    update public.social_profiles set bought_followers = bought_followers + k.amount where character_id = p_character;
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

-- 6. CRESCITA DI OGNI GIORNO (una volta al giorno per profilo, idempotente)
create or replace function public.social_grow_all()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.rome_today();
  v_like_pct numeric := coalesce(public.setting_int('social_like_pct'), 4);
  v_like_days int := greatest(1, coalesce(public.setting_int('social_like_giorni'), 3));
  v_idle int := coalesce(public.setting_int('social_inattivo_giorni'), 7);
  v_idle_pct numeric := coalesce(public.setting_int('social_calo_inattivo_pct'), 1);
  v_bought_pct numeric := coalesce(public.setting_int('social_comprati_calo_pct'), 3);
  v_th numeric[] := public.uni_list('social_soglie_follower');
  v_pts numeric[] := public.uni_list('social_soglie_fama');
  p record;
  po record;
  v_base int;
  v_mult numeric;
  v_last timestamptz;
  v_npc int;
  v_bought int;
  v_total int;
  v_title text;
  v_n int := 0;
begin
  for p in
    select sp.*, c.status from public.social_profiles sp join public.characters c on c.id = sp.character_id
    where c.status = 'approvata' and sp.grown_on is distinct from v_today
  loop
    v_base := coalesce((select l.social_followers_day from public.fame_levels l
                        where l.id = ((public.character_fame_level(p.character_id, 'fama')) ->> 'id')::uuid), 0);
    v_mult := case when p.boost_until > now() then p.boost_mult else 1 end;
    select max(created_at) into v_last from public.social_posts where character_id = p.character_id;
    v_npc := p.npc_followers;
    if v_last is null or v_last < now() - make_interval(days => v_idle) then
      v_npc := greatest(0, v_npc - ceil(v_npc * v_idle_pct / 100.0)::int);
    else
      v_npc := v_npc + round(v_base * (0.7 + random() * 0.6) * v_mult)::int;
    end if;
    v_bought := greatest(0, p.bought_followers - ceil(p.bought_followers * v_bought_pct / 100.0)::int);
    update public.social_profiles set npc_followers = v_npc, bought_followers = v_bought, grown_on = v_today
    where character_id = p.character_id;
    v_total := v_npc + v_bought + (select count(*)::int from public.social_follows where followed_id = p.character_id);

    -- like PNG ai post dei primi giorni
    for po in
      select id, created_at from public.social_posts
      where character_id = p.character_id and created_at > now() - make_interval(days => v_like_days)
    loop
      update public.social_posts
      set npc_likes = npc_likes + greatest(0, round(v_total * v_like_pct / 100.0 / v_like_days * (0.7 + random() * 0.6)
                        * case when p.boost_until > po.created_at then p.boost_mult else 1 end)::int)
      where id = po.id;
    end loop;

    -- soglie di follower: una voce di fama per soglia
    for i in 1..coalesce(array_length(v_th, 1), 0) loop
      continue when v_total < v_th[i] or coalesce(v_pts[i], 0) <= 0;
      v_title := 'Ha superato ' || replace(to_char(v_th[i], 'FM999,999,999'), ',', '.') || ' follower';
      if not exists (select 1 from public.fame_entries where character_id = p.character_id and title = v_title) then
        insert into public.fame_entries (character_id, title, description, points, kind, is_public, author_id)
        values (p.character_id, v_title, 'Il profilo social è cresciuto fino a superare ' || replace(to_char(v_th[i], 'FM999,999,999'), ',', '.') || ' follower.',
                v_pts[i]::int, 'fama', true, null);
      end if;
    end loop;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.social_grow_all() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('social-crescita', '30 6 * * *', 'select public.social_grow_all()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;
