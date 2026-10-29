-- =====================================================================
-- LAVORI E GRUPPI
--
-- - Lavori: full time o part time, con descrizione e ruoli. Ogni ruolo
--   può dare uno stipendio (0 = nessuno). Un personaggio ha al massimo due
--   lavori e mai due full time: un FT, un PT, FT + PT, oppure due PT.
--   Il giocatore sceglie da solo i ruoli "a scelta del giocatore"; lo
--   staff ("lavori.gestire") crea i lavori e assegna qualsiasi ruolo.
-- - Gruppi: descrizione e ruoli con stipendio; un personaggio ne ha al
--   massimo "max_gruppi" (3). Li assegna solo lo staff ("gruppi.gestire"):
--   i giocatori li vedono e basta.
-- - Lo stipendio della banca somma tenore, lavori e gruppi.
-- =====================================================================

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('max_gruppi', '3', 'number', 'Gruppi per personaggio',
   'Di quanti gruppi può far parte al massimo un personaggio.', 32)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 1. LAVORI
-- ---------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  kind text not null check (kind in ('full_time', 'part_time')),
  description text not null default '' check (char_length(description) <= 4000),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index jobs_name_key on public.jobs (lower(name));

create table public.job_roles (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 2000),
  salary int not null default 0 check (salary between 0 and 1000000),
  -- il giocatore può sceglierlo da solo (altrimenti lo assegna lo staff)
  self_select boolean not null default true,
  sort_order int not null default 0
);
create index job_roles_job_idx on public.job_roles (job_id);
create unique index job_roles_name_key on public.job_roles (job_id, lower(name));

create table public.character_jobs (
  character_id uuid not null references public.characters (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  role_id uuid not null references public.job_roles (id) on delete cascade,
  assigned_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (character_id, job_id)
);
create index character_jobs_job_idx on public.character_jobs (job_id);
create index character_jobs_role_idx on public.character_jobs (role_id);
create index character_jobs_assigned_by_idx on public.character_jobs (assigned_by);

-- ---------------------------------------------------------------------
-- 2. GRUPPI
-- ---------------------------------------------------------------------
create table public.game_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 4000),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index game_groups_name_key on public.game_groups (lower(name));

create table public.group_roles (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.game_groups (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 2000),
  salary int not null default 0 check (salary between 0 and 1000000),
  sort_order int not null default 0
);
create index group_roles_group_idx on public.group_roles (group_id);
create unique index group_roles_name_key on public.group_roles (group_id, lower(name));

create table public.character_groups (
  character_id uuid not null references public.characters (id) on delete cascade,
  group_id uuid not null references public.game_groups (id) on delete cascade,
  role_id uuid not null references public.group_roles (id) on delete cascade,
  assigned_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (character_id, group_id)
);
create index character_groups_group_idx on public.character_groups (group_id);
create index character_groups_role_idx on public.character_groups (role_id);
create index character_groups_assigned_by_idx on public.character_groups (assigned_by);

-- ---------------------------------------------------------------------
-- 3. SICUREZZA: tutti leggono, scrive solo lo staff (i giocatori
--    scelgono i lavori con join_job / leave_job)
-- ---------------------------------------------------------------------
alter table public.jobs enable row level security;
alter table public.job_roles enable row level security;
alter table public.character_jobs enable row level security;
alter table public.game_groups enable row level security;
alter table public.group_roles enable row level security;
alter table public.character_groups enable row level security;

revoke all on public.jobs, public.job_roles, public.character_jobs,
  public.game_groups, public.group_roles, public.character_groups from anon;

create policy "Lavori: lettura" on public.jobs for select to authenticated using (true);
create policy "Lavori: lo staff li crea" on public.jobs for insert to authenticated with check ((select public.has_permission('lavori.gestire')));
create policy "Lavori: lo staff li modifica" on public.jobs for update to authenticated
  using ((select public.has_permission('lavori.gestire'))) with check ((select public.has_permission('lavori.gestire')));
create policy "Lavori: lo staff li elimina" on public.jobs for delete to authenticated using ((select public.has_permission('lavori.gestire')));

create policy "Ruoli dei lavori: lettura" on public.job_roles for select to authenticated using (true);
create policy "Ruoli dei lavori: lo staff li crea" on public.job_roles for insert to authenticated with check ((select public.has_permission('lavori.gestire')));
create policy "Ruoli dei lavori: lo staff li modifica" on public.job_roles for update to authenticated
  using ((select public.has_permission('lavori.gestire'))) with check ((select public.has_permission('lavori.gestire')));
create policy "Ruoli dei lavori: lo staff li elimina" on public.job_roles for delete to authenticated using ((select public.has_permission('lavori.gestire')));

create policy "Impieghi: lettura" on public.character_jobs for select to authenticated using (true);
create policy "Impieghi: lo staff assegna" on public.character_jobs for insert to authenticated with check ((select public.has_permission('lavori.gestire')));
create policy "Impieghi: lo staff cambia ruolo" on public.character_jobs for update to authenticated
  using ((select public.has_permission('lavori.gestire'))) with check ((select public.has_permission('lavori.gestire')));
create policy "Impieghi: lo staff toglie" on public.character_jobs for delete to authenticated using ((select public.has_permission('lavori.gestire')));

create policy "Gruppi: lettura" on public.game_groups for select to authenticated using (true);
create policy "Gruppi: lo staff li crea" on public.game_groups for insert to authenticated with check ((select public.has_permission('gruppi.gestire')));
create policy "Gruppi: lo staff li modifica" on public.game_groups for update to authenticated
  using ((select public.has_permission('gruppi.gestire'))) with check ((select public.has_permission('gruppi.gestire')));
create policy "Gruppi: lo staff li elimina" on public.game_groups for delete to authenticated using ((select public.has_permission('gruppi.gestire')));

create policy "Ruoli dei gruppi: lettura" on public.group_roles for select to authenticated using (true);
create policy "Ruoli dei gruppi: lo staff li crea" on public.group_roles for insert to authenticated with check ((select public.has_permission('gruppi.gestire')));
create policy "Ruoli dei gruppi: lo staff li modifica" on public.group_roles for update to authenticated
  using ((select public.has_permission('gruppi.gestire'))) with check ((select public.has_permission('gruppi.gestire')));
create policy "Ruoli dei gruppi: lo staff li elimina" on public.group_roles for delete to authenticated using ((select public.has_permission('gruppi.gestire')));

create policy "Membri dei gruppi: lettura" on public.character_groups for select to authenticated using (true);
create policy "Membri dei gruppi: lo staff assegna" on public.character_groups for insert to authenticated with check ((select public.has_permission('gruppi.gestire')));
create policy "Membri dei gruppi: lo staff cambia ruolo" on public.character_groups for update to authenticated
  using ((select public.has_permission('gruppi.gestire'))) with check ((select public.has_permission('gruppi.gestire')));
create policy "Membri dei gruppi: lo staff toglie" on public.character_groups for delete to authenticated using ((select public.has_permission('gruppi.gestire')));

-- chi ha assegnato non si falsifica
revoke insert, update on public.character_jobs, public.character_groups from authenticated;
grant insert (character_id, job_id, role_id), update (role_id) on public.character_jobs to authenticated;
grant insert (character_id, group_id, role_id), update (role_id) on public.character_groups to authenticated;

-- ---------------------------------------------------------------------
-- 4. REGOLE: ruolo dello stesso lavoro/gruppo, scheda approvata, limiti
-- ---------------------------------------------------------------------
create or replace function public.character_jobs_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_count int;
  v_full int;
begin
  if not exists (select 1 from public.job_roles where id = new.role_id and job_id = new.job_id) then
    raise exception 'Il ruolo non appartiene a questo lavoro.' using errcode = 'P0001';
  end if;
  -- un'assegnazione alla volta per personaggio
  perform 1 from public.characters where id = new.character_id for update;
  if not exists (select 1 from public.characters where id = new.character_id and status = 'approvata') then
    raise exception 'I lavori si danno solo ai personaggi approvati.' using errcode = 'P0001';
  end if;
  select kind into v_kind from public.jobs where id = new.job_id;
  select count(*), count(*) filter (where j.kind = 'full_time')
  into v_count, v_full
  from public.character_jobs cj join public.jobs j on j.id = cj.job_id
  where cj.character_id = new.character_id and cj.job_id <> new.job_id;
  if v_count >= 2 then
    raise exception 'Al massimo due lavori: un full time e un part time, oppure due part time.' using errcode = 'P0001';
  end if;
  if v_kind = 'full_time' and v_full >= 1 then
    raise exception 'Non si possono avere due lavori full time.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.character_jobs_check() from public, anon, authenticated;
create trigger character_jobs_check before insert or update on public.character_jobs
  for each row execute function public.character_jobs_check();

create or replace function public.character_groups_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int := greatest(1, coalesce(public.setting_int('max_gruppi'), 3));
begin
  if not exists (select 1 from public.group_roles where id = new.role_id and group_id = new.group_id) then
    raise exception 'Il ruolo non appartiene a questo gruppo.' using errcode = 'P0001';
  end if;
  perform 1 from public.characters where id = new.character_id for update;
  if not exists (select 1 from public.characters where id = new.character_id and status = 'approvata') then
    raise exception 'I gruppi si danno solo ai personaggi approvati.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.character_groups where character_id = new.character_id and group_id <> new.group_id) >= v_max then
    raise exception 'Un personaggio può far parte al massimo di % gruppi.', v_max using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.character_groups_check() from public, anon, authenticated;
create trigger character_groups_check before insert or update on public.character_groups
  for each row execute function public.character_groups_check();

-- Un lavoro non diventa full time se qualcuno ne avrebbe due
create or replace function public.jobs_kind_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'full_time' and old.kind <> 'full_time' and exists (
    select 1 from public.character_jobs cj
    join public.character_jobs other on other.character_id = cj.character_id and other.job_id <> cj.job_id
    join public.jobs j on j.id = other.job_id and j.kind = 'full_time'
    where cj.job_id = new.id
  ) then
    raise exception 'Qualcuno con questo lavoro ha già un full time: non può diventare full time.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.jobs_kind_check() from public, anon, authenticated;
create trigger jobs_kind_check before update of kind on public.jobs
  for each row execute function public.jobs_kind_check();

-- Registro del pannello
create trigger jobs_log after insert or update or delete on public.jobs
  for each row execute function public.log_admin_change();
create trigger job_roles_log after insert or update or delete on public.job_roles
  for each row execute function public.log_admin_change();
create trigger game_groups_log after insert or update or delete on public.game_groups
  for each row execute function public.log_admin_change();
create trigger group_roles_log after insert or update or delete on public.group_roles
  for each row execute function public.log_admin_change();

-- ---------------------------------------------------------------------
-- 5. IL GIOCATORE SCEGLIE O LASCIA UN LAVORO
-- ---------------------------------------------------------------------
create or replace function public.join_job(p_character uuid, p_role uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.job_roles;
begin
  if not public.owns_character(p_character) then
    raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501';
  end if;
  select jr.* into r from public.job_roles jr join public.jobs j on j.id = jr.job_id
  where jr.id = p_role and j.active;
  if r.id is null then
    raise exception 'Questo lavoro non esiste o non è attivo.' using errcode = 'P0001';
  end if;
  if not r.self_select then
    raise exception 'Questo ruolo lo assegna lo staff: chiedilo con un ticket.' using errcode = 'P0001';
  end if;
  insert into public.character_jobs (character_id, job_id, role_id, assigned_by)
  values (p_character, r.job_id, r.id, auth.uid())
  on conflict (character_id, job_id) do update set role_id = excluded.role_id, assigned_by = excluded.assigned_by, created_at = now();
end;
$$;
revoke execute on function public.join_job(uuid, uuid) from public, anon;
grant execute on function public.join_job(uuid, uuid) to authenticated;

create or replace function public.leave_job(p_character uuid, p_job uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_character) then
    raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501';
  end if;
  delete from public.character_jobs where character_id = p_character and job_id = p_job;
end;
$$;
revoke execute on function public.leave_job(uuid, uuid) from public, anon;
grant execute on function public.leave_job(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. STIPENDIO: tenore + lavori + gruppi (solo quelli attivi)
-- ---------------------------------------------------------------------
create or replace function public.character_salary_parts(p_character uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'amount', amount) order by ord, label), '[]'::jsonb)
  from (
    select 1 as ord, 'Tenore di vita: ' || o.name as label, o.salary as amount
    from public.character_options co join public.creation_options o on o.id = co.option_id
    where co.character_id = p_character and o.kind = 'tenore' and o.salary > 0
    union all
    select 2, 'Lavoro: ' || r.name || ' (' || j.name || ')', r.salary
    from public.character_jobs cj join public.job_roles r on r.id = cj.role_id join public.jobs j on j.id = cj.job_id
    where cj.character_id = p_character and j.active and r.salary > 0
    union all
    select 3, 'Gruppo: ' || r.name || ' (' || g.name || ')', r.salary
    from public.character_groups cg join public.group_roles r on r.id = cg.role_id join public.game_groups g on g.id = cg.group_id
    where cg.character_id = p_character and g.active and r.salary > 0
  ) parts
$$;
revoke execute on function public.character_salary_parts(uuid) from public, anon, authenticated;

create or replace function public.character_salary(p_character uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((p ->> 'amount')::int), 0)::int
  from jsonb_array_elements(public.character_salary_parts(p_character)) p
$$;
revoke execute on function public.character_salary(uuid) from public, anon, authenticated;

-- La banca mostra anche da dove viene lo stipendio
create or replace function public.bank_overview(p_character uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.bank_accounts;
  v_days int := public.salary_days();
  v_max int := greatest(0, coalesce(public.setting_int('stipendio_max_quote'), 0));
  v_today date := public.bank_today();
  v_elapsed int;
  v_quotas int;
  v_salary int;
begin
  if not exists (
    select 1 from public.characters c
    where c.id = p_character and (c.owner_id = auth.uid() or public.has_permission('banca.gestire'))
  ) then
    raise exception 'Conto non trovato.' using errcode = '42501';
  end if;
  select * into a from public.bank_accounts where character_id = p_character;
  if not found then return null; end if;
  v_salary := public.character_salary(p_character);
  v_elapsed := greatest(0, (v_today - a.salary_paid_until) / v_days);
  v_quotas := case when v_max > 0 then least(v_elapsed, v_max) else v_elapsed end;
  return jsonb_build_object(
    'balance', a.balance,
    'salary', v_salary,
    'salary_parts', public.character_salary_parts(p_character),
    'period_days', v_days,
    'quotas', v_quotas,
    'max_quotas', v_max,
    'accrued', v_quotas * v_salary,
    'next_on', a.salary_paid_until + (v_elapsed + 1) * v_days
  );
end;
$$;
revoke execute on function public.bank_overview(uuid) from public, anon;
grant execute on function public.bank_overview(uuid) to authenticated;
