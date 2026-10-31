-- =====================================================================
-- LAVORI: FULL TIME E PART TIME PER RUOLO, POSTI DEI RUOLI
-- - Ogni ruolo di un lavoro ha una paga full time, una part time o
--   entrambe; il giocatore sceglie ruolo e orario (character_jobs.mode).
--   Il lavoro non è più tutto full time o tutto part time.
-- - Regole invariate: al massimo due lavori, mai due full time.
-- - Ruoli di lavori e gruppi con un numero massimo di posti
--   (max_members, vuoto = senza limite): pieno = non si sceglie.
-- =====================================================================

-- 1. RUOLI: PAGHE E POSTI
alter table public.job_roles
  add column if not exists salary_full int check (salary_full is null or salary_full between 0 and 1000000),
  add column if not exists salary_part int check (salary_part is null or salary_part between 0 and 1000000),
  add column if not exists max_members int check (max_members is null or max_members >= 1);
alter table public.group_roles
  add column if not exists max_members int check (max_members is null or max_members >= 1);

-- la paga di oggi va all'orario del lavoro
update public.job_roles r set
  salary_full = case when j.kind = 'full_time' then r.salary end,
  salary_part = case when j.kind = 'part_time' then r.salary end
from public.jobs j
where j.id = r.job_id and r.salary_full is null and r.salary_part is null;
alter table public.job_roles add constraint job_roles_pay_check check (salary_full is not null or salary_part is not null);

-- 2. ORARIO SCELTO DAL PERSONAGGIO
alter table public.character_jobs add column if not exists mode text check (mode in ('full_time', 'part_time'));
update public.character_jobs cj set mode = j.kind from public.jobs j where j.id = cj.job_id and cj.mode is null;
alter table public.character_jobs alter column mode set not null;
grant insert (mode), update (mode) on public.character_jobs to authenticated;

-- il tipo non è più del lavoro
drop trigger if exists jobs_kind_check on public.jobs;
drop function if exists public.jobs_kind_check();
alter table public.jobs drop column if exists kind;

-- 3. REGOLE
create or replace function public.character_jobs_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.job_roles;
  v_count int;
  v_full int;
  v_taken int;
begin
  select * into r from public.job_roles where id = new.role_id and job_id = new.job_id;
  if r.id is null then
    raise exception 'Il ruolo non appartiene a questo lavoro.' using errcode = 'P0001';
  end if;
  if new.mode = 'full_time' and r.salary_full is null then
    raise exception 'Il ruolo «%» non è full time.', r.name using errcode = 'P0001';
  end if;
  if new.mode = 'part_time' and r.salary_part is null then
    raise exception 'Il ruolo «%» non è part time.', r.name using errcode = 'P0001';
  end if;
  -- un'assegnazione alla volta per personaggio
  perform 1 from public.characters where id = new.character_id for update;
  if not exists (select 1 from public.characters where id = new.character_id and status = 'approvata') then
    raise exception 'I lavori si danno solo ai personaggi approvati.' using errcode = 'P0001';
  end if;
  -- posti del ruolo
  if r.max_members is not null and (tg_op = 'INSERT' or old.role_id is distinct from new.role_id) then
    perform 1 from public.job_roles where id = r.id for update;
    select count(*) into v_taken from public.character_jobs where role_id = r.id and character_id <> new.character_id;
    if v_taken >= r.max_members then
      raise exception 'Il ruolo «%» è al completo.', r.name using errcode = 'P0001';
    end if;
  end if;
  select count(*), count(*) filter (where cj.mode = 'full_time')
  into v_count, v_full
  from public.character_jobs cj
  where cj.character_id = new.character_id and cj.job_id <> new.job_id;
  if v_count >= 2 then
    raise exception 'Al massimo due lavori: un full time e un part time, oppure due part time.' using errcode = 'P0001';
  end if;
  if new.mode = 'full_time' and v_full >= 1 then
    raise exception 'Non si possono avere due lavori full time.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.character_jobs_check() from public, anon, authenticated;

create or replace function public.character_groups_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int := greatest(1, coalesce(public.setting_int('max_gruppi'), 3));
  r public.group_roles;
  v_kind text;
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
  -- le squadre sportive non contano nel massimo dei gruppi
  select kind into v_kind from public.game_groups where id = new.group_id;
  if v_kind = 'normale' and (
    select count(*) from public.character_groups cg join public.game_groups g on g.id = cg.group_id
    where cg.character_id = new.character_id and cg.group_id <> new.group_id and g.kind = 'normale'
  ) >= v_max then
    raise exception 'Un personaggio può far parte al massimo di % gruppi.', v_max using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.character_groups_check() from public, anon, authenticated;

-- 4. IL GIOCATORE SCEGLIE RUOLO E ORARIO
drop function if exists public.join_job(uuid, uuid);
create or replace function public.join_job(p_character uuid, p_role uuid, p_mode text)
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
  if p_mode not in ('full_time', 'part_time') then
    raise exception 'Scegli full time o part time.' using errcode = 'P0001';
  end if;
  select jr.* into r from public.job_roles jr join public.jobs j on j.id = jr.job_id
  where jr.id = p_role and j.active;
  if r.id is null then
    raise exception 'Questo lavoro non esiste o non è attivo.' using errcode = 'P0001';
  end if;
  if not r.self_select then
    raise exception 'Questo ruolo lo assegna lo staff: chiedilo con un ticket.' using errcode = 'P0001';
  end if;
  insert into public.character_jobs (character_id, job_id, role_id, mode, assigned_by)
  values (p_character, r.job_id, r.id, p_mode, auth.uid())
  on conflict (character_id, job_id) do update set role_id = excluded.role_id, mode = excluded.mode,
    assigned_by = excluded.assigned_by, created_at = now();
end;
$$;
revoke execute on function public.join_job(uuid, uuid, text) from public, anon;
grant execute on function public.join_job(uuid, uuid, text) to authenticated;

-- 5. STIPENDIO: la paga dell'orario scelto
create or replace function public.character_salary_parts(p_character uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'amount', amount) order by ord, label), '[]'::jsonb)
  from (
    select 1 as ord, 'Patrimonio: ' || o.name as label, o.salary as amount
    from public.character_options co join public.creation_options o on o.id = co.option_id
    where co.character_id = p_character and o.kind = 'tenore' and o.salary > 0
    union all
    select 2, 'Lavoro: ' || r.name || ' (' || j.name || ', ' || case cj.mode when 'full_time' then 'full time' else 'part time' end || ')',
      case cj.mode when 'full_time' then coalesce(r.salary_full, 0) else coalesce(r.salary_part, 0) end
    from public.character_jobs cj join public.job_roles r on r.id = cj.role_id join public.jobs j on j.id = cj.job_id
    where cj.character_id = p_character and j.active
      and case cj.mode when 'full_time' then coalesce(r.salary_full, 0) else coalesce(r.salary_part, 0) end > 0
    union all
    select 3, 'Gruppo: ' || r.name || ' (' || g.name || ')', r.salary
    from public.character_groups cg join public.group_roles r on r.id = cg.role_id join public.game_groups g on g.id = cg.group_id
    where cg.character_id = p_character and g.active and g.kind = 'normale' and r.salary > 0
  ) parts
$$;
revoke execute on function public.character_salary_parts(uuid) from public, anon, authenticated;
