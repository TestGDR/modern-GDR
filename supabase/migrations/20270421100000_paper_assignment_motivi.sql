-- =====================================================================
-- PAPER E ASSIGNMENT: IL RIQUADRO DICE PERCHÉ NON C'È NIENTE DA REGISTRARE
-- academic_work_options restituisce anche il motivo (nessun semestre in
-- corso, nessun corso) e l'elenco dei corsi con caratteristica e abilità
-- da usare nei tiri.
-- =====================================================================

-- Lettura (uscendo dalla chat o dalla pagina Università): conti, registrati e tiri utilizzabili
create or replace function public.academic_work_options(p_character uuid, p_room uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_term public.academic_terms;
begin
  if not public.owns_character(p_character) then
    raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501';
  end if;
  select * into v_term from public.academic_terms where status = 'in_progress' order by created_at desc limit 1;
  if v_term.id is null then
    return jsonb_build_object('open', false, 'reason', 'no_term');
  end if;
  if not exists (
    select 1 from public.enrollments where character_id = p_character and term_id = v_term.id and status = 'enrolled'
  ) then
    return jsonb_build_object('open', false, 'reason', 'not_enrolled');
  end if;
  return jsonb_build_object(
    'open', true,
    'term', public.uni_term_label(v_term.academic_year, v_term.semester),
    'max', coalesce(public.uni_n('uni_lavori_max'), 2)::int,
    'cap', coalesce(public.uni_n('uni_lavori_tetto_corso'), 2)::int,
    'hours', coalesce(public.uni_n('uni_lavori_ore'), 24)::int,
    -- i corsi con caratteristica e abilità da usare nei tiri
    'courses', (select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'attribute', a.code, 'skill', s.name) order by c.code), '[]'::jsonb)
                from public.enrollments en join public.courses c on c.id = en.course_id
                join public.attributes a on a.id = c.attribute_id left join public.skills s on s.id = c.skill_id
                where en.character_id = p_character and en.term_id = v_term.id and en.status = 'enrolled'),
    'assignment', (select count(*) from public.academic_works w where w.character_id = p_character and w.term_id = v_term.id and w.kind = 'assignment'),
    'paper', (select count(*) from public.academic_works w where w.character_id = p_character and w.term_id = v_term.id and w.kind = 'paper'),
    'works', (select coalesce(jsonb_agg(jsonb_build_object('kind', w.kind, 'code', c.code, 'bonus', w.bonus, 'total', w.roll_total, 'cd', w.cd, 'at', w.created_at)
                order by w.created_at), '[]'::jsonb)
              from public.academic_works w join public.enrollments en on en.id = w.enrollment_id join public.courses c on c.id = en.course_id
              where w.character_id = p_character and w.term_id = v_term.id),
    'rolls', (select coalesce(jsonb_agg(jsonb_build_object(
                 'message_id', m.id, 'total', (m.roll_data ->> 'total')::int, 'attribute', m.roll_data ->> 'attribute',
                 'skill', m.roll_data ->> 'skill', 'at', m.created_at, 'room', r.name,
                 'choices', public.academic_work_choices(p_character, v_term.id, m.roll_data)) order by m.created_at desc), '[]'::jsonb)
              from public.messages m join public.rooms r on r.id = m.room_id
              where m.character_id = p_character and m.kind = 'dado' and m.roll_data is not null
                and m.created_at > now() - make_interval(hours => coalesce(public.uni_n('uni_lavori_ore'), 24)::int)
                and m.created_at > coalesce(v_term.started_at, v_term.created_at)
                and (p_room is null or m.room_id = p_room)
                and not exists (select 1 from public.academic_works w where w.message_id = m.id)
                -- solo i tiri con caratteristica e abilità di un corso del semestre
                and exists (
                  select 1 from public.enrollments en join public.courses c on c.id = en.course_id
                  join public.attributes a on a.id = c.attribute_id left join public.skills s on s.id = c.skill_id
                  where en.character_id = p_character and en.term_id = v_term.id and en.status = 'enrolled'
                    and a.code = m.roll_data ->> 'attribute' and coalesce(s.name, '') = coalesce(m.roll_data ->> 'skill', '')))
  );
end;
$$;
revoke execute on function public.academic_work_options(uuid, uuid) from public, anon;
grant execute on function public.academic_work_options(uuid, uuid) to authenticated;

