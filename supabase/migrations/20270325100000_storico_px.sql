-- =====================================================================
-- STORICO DEI PX
-- Scheda → Abilità → linguetta «PX»: tutti i guadagni e le spese dei PX
-- del personaggio, letti dai registri che ci sono già (pacchetti
-- settimanali, PX assegnati dallo staff, conversione dei Punti Fama,
-- crescita delle abilità, voci aggiunte dopo l'approvazione) più px_moves
-- per gli altri movimenti (da ora: la scelta del rendimento universitario).
-- La creazione della scheda è una riga sola: PX iniziali e quanto è stato
-- speso per arrivare ai PX di oggi (comprese eventuali correzioni a mano
-- dell'Amministratore, che non hanno un registro).
-- =====================================================================

create table if not exists public.px_moves (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  amount int not null check (amount <> 0),
  reason text not null check (char_length(reason) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists px_moves_character on public.px_moves (character_id, created_at desc);
alter table public.px_moves enable row level security;
revoke all on public.px_moves from anon, authenticated;
grant select on public.px_moves to authenticated;
drop policy if exists "Movimenti PX: proprietario e staff" on public.px_moves;
create policy "Movimenti PX: proprietario e staff" on public.px_moves for select to authenticated
  using ((select public.owns_character(character_id)) or (select public.has_permission('personaggi.vedere_tutti'))
         or (select public.has_permission('personaggi.assegnare_px')));
drop policy if exists "Movimenti PX: solo dalle funzioni" on public.px_moves;
create policy "Movimenti PX: solo dalle funzioni" on public.px_moves for insert to authenticated with check (false);
drop policy if exists "Movimenti PX: non si modificano" on public.px_moves;
create policy "Movimenti PX: non si modificano" on public.px_moves for update to authenticated using (false);
drop policy if exists "Movimenti PX: non si eliminano" on public.px_moves;
create policy "Movimenti PX: non si eliminano" on public.px_moves for delete to authenticated using (false);

-- scelte del rendimento già fatte (data approssimata: ultimo aggiornamento della carriera)
insert into public.px_moves (character_id, amount, reason, created_at)
select co.character_id, -o.cost_px, 'Rendimento degli anni passati: ' || o.name, coalesce(sr.updated_at, now())
from public.character_options co
join public.creation_options o on o.id = co.option_id
left join public.student_records sr on sr.character_id = co.character_id
where co.note = 'Scelto dalla pagina Università.' and o.cost_px <> 0
  and not exists (select 1 from public.px_moves m where m.character_id = co.character_id and m.reason = 'Rendimento degli anni passati: ' || o.name);

-- Tutti i movimenti dei PX di un personaggio, dal più recente
create or replace function public.px_history(p_character uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
  v_moves jsonb;
  v_sum int;
  v_start int := coalesce(public.setting_int('px_iniziali'), 0);
  v_left int;
begin
  if not (public.owns_character(p_character) or public.has_permission('personaggi.vedere_tutti')
          or public.has_permission('personaggi.assegnare_px')) then
    raise exception 'Non hai i permessi necessari.' using errcode = '42501';
  end if;
  select id, px, created_at, status into c from public.characters where id = p_character;
  if c.id is null then return null; end if;

  with m as (
    select a.created_at as at, a.px as amount, 'Pacchetto settimanale' as source,
      a.points || ' azioni nella settimana del ' || to_char(a.week_start, 'DD/MM/YYYY') as label
    from public.xp_awards a where a.character_id = p_character and a.px <> 0
    union all
    select g.created_at, g.amount, case when g.amount > 0 then 'Dallo staff' else 'Tolti dallo staff' end, g.reason
    from public.xp_grants g where g.character_id = p_character
    union all
    select f.converted_at, f.px_from_conversion, 'Punti Fama', 'Punti Fama non spesi convertiti in PX'
    from public.character_fame f where f.character_id = p_character and f.converted and f.px_from_conversion <> 0
    union all
    select u.created_at, -u.cost, 'Abilità', s.name || ' da ' || u.from_level || ' a ' || u.to_level
    from public.skill_upgrades u join public.skills s on s.id = u.skill_id where u.character_id = p_character
    union all
    select r.reviewed_at, -r.px_cost, 'Voci aggiunte',
      coalesce((select string_agg(o.name, ', ') from jsonb_array_elements(r.items) it
                join public.creation_options o on o.id = (it ->> 'option_id')::uuid), 'Vantaggi, svantaggi e tratti')
    from public.option_requests r where r.character_id = p_character and r.status = 'approvata' and r.px_cost <> 0
    union all
    select x.created_at, x.amount, 'Altro', x.reason
    from public.px_moves x where x.character_id = p_character
  )
  select coalesce(jsonb_agg(jsonb_build_object('at', at, 'amount', amount, 'source', source, 'label', label) order by at desc nulls last), '[]'::jsonb),
         coalesce(sum(amount), 0)
    into v_moves, v_sum
  from m;

  -- creazione: i PX iniziali e quanto è servito per arrivare ai PX rimasti dopo la creazione
  v_left := c.px - v_sum;
  v_moves := v_moves || jsonb_build_array(jsonb_build_object('at', c.created_at, 'amount', v_left - v_start, 'source', 'Creazione',
    'label', 'Caratteristiche, abilità, vantaggi e svantaggi della scheda (comprese le correzioni dell''Amministratore)'));
  v_moves := v_moves || jsonb_build_array(jsonb_build_object('at', c.created_at, 'amount', v_start, 'source', 'Creazione', 'label', 'PX iniziali'));

  return jsonb_build_object(
    'px', c.px,
    'earned', (select coalesce(sum((e ->> 'amount')::int), 0) from jsonb_array_elements(v_moves) e where (e ->> 'amount')::int > 0),
    'spent', (select coalesce(-sum((e ->> 'amount')::int), 0) from jsonb_array_elements(v_moves) e where (e ->> 'amount')::int < 0),
    'moves', coalesce((select jsonb_agg(e) from jsonb_array_elements(v_moves) e where (e ->> 'amount')::int <> 0), '[]'::jsonb));
end;
$$;
revoke execute on function public.px_history(uuid) from public, anon;
grant execute on function public.px_history(uuid) to authenticated;

-- la scelta del rendimento universitario finisce nello storico dei PX
create or replace function public.academic_choose_profile(p_character uuid, p_option uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.student_records;
  o public.creation_options;
  v_px int;
  v_cost int := 0;
  v_neg int;
  v_cap int := coalesce(public.setting_int('voci_svantaggi_px_max'), 160);
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into r from public.student_records where character_id = p_character for update;
  if r.character_id is null then raise exception 'La tua carriera non è ancora iniziata.' using errcode = 'P0001'; end if;
  if r.profile_chosen then raise exception 'Il rendimento degli anni passati l''hai già scelto.' using errcode = 'P0001'; end if;
  if coalesce(r.start_gpa_credits, 0) <= 0 then raise exception 'Non hai anni già frequentati da valutare.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.character_options co join public.creation_options x on x.id = co.option_id
             where co.character_id = p_character and x.effects @> '[{"type":"academic_profile"}]') then
    raise exception 'Hai già una voce di rendimento in scheda.' using errcode = 'P0001';
  end if;

  if p_option is not null then
    select * into o from public.creation_options where id = p_option and active and effects @> '[{"type":"academic_profile"}]';
    if o.id is null then raise exception 'Scelta non valida.' using errcode = 'P0001'; end if;
    select px into v_px from public.characters where id = p_character;
    if o.cost_px > 0 then
      if o.cost_px > v_px then
        raise exception '«%» costa % PX e te ne restano %.', o.name, o.cost_px, v_px using errcode = 'P0001';
      end if;
      v_cost := o.cost_px;
    else
      -- uno svantaggio restituisce PX solo fino al tetto degli svantaggi
      select coalesce(-sum(x.cost_px * co.level), 0) into v_neg
      from public.character_options co join public.creation_options x on x.id = co.option_id
      where co.character_id = p_character and x.cost_px < 0 and co.source = 'creazione';
      v_cost := -least(-o.cost_px, greatest(0, v_cap - v_neg));
    end if;
    insert into public.character_options (character_id, option_id, level, choice_value, note)
    values (p_character, o.id, 1, '', 'Scelto dalla pagina Università.');
    if v_cost <> 0 then
      perform set_config('app.invio_scheda', 'on', true);
      update public.characters set px = px - v_cost where id = p_character;
      perform set_config('app.invio_scheda', 'off', true);
      insert into public.px_moves (character_id, amount, reason) values (p_character, -v_cost, 'Rendimento degli anni passati: ' || o.name);
    end if;
  end if;

  update public.student_records set profile_chosen = true where character_id = p_character;
  perform public.uni_grade_start(p_character);
  return jsonb_build_object('px', -v_cost, 'start_gpa', (select start_gpa from public.student_records where character_id = p_character));
end;
$$;
