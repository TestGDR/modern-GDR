-- =====================================================================
-- BORSE DI STUDIO DI MERITO: ACCADEMICA E SPORTIVA
-- - "Borsa di studio accademica" (la vecchia Borsa di studio): si perde
--   per sempre con un semestre pubblicato sotto il GPA minimo
--   (uni_borsa_gpa_min, 2.5) o in Academic Probation (o peggio).
-- - "Borsa di studio sportiva" (nuova): vale finché sei in una squadra;
--   si perde per sempre se la media delle pagelle di una stagione chiusa
--   è sotto il minimo (sport_borsa_media_min, 6).
-- - Pell Grant (bisogno economico): non dipende dai voti.
-- - Le tre sono alternative (40 PX ciascuna) e valgono solo finché il
--   personaggio va all'università. La borsa atletica data dallo staff nel
--   roster segue le regole della sportiva.
-- - Via "Borsa a rischio" e "Recruited". Chi li aveva li perde; i PX già
--   ricevuti o spesi restano come sono nelle schede approvate.
-- - Avvisi di SISTEMA quando una borsa si perde.
-- =====================================================================

-- 1. MINIMI (modificabili: Università → Impostazioni, Impostazioni del sistema)
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('uni_borsa_gpa_min', '2.5', 'number', 'Borsa di studio accademica · GPA minimo',
   'Con un semestre pubblicato sotto questo GPA (o in Academic Probation) la borsa accademica si perde per sempre.', 260),
  ('sport_borsa_media_min', '6', 'number', 'Sport · Media minima per la borsa sportiva',
   'Se la media delle pagelle di una stagione chiusa è sotto questo voto, la borsa sportiva si perde per sempre.', 310)
on conflict (key) do nothing;

-- 2. VIA "BORSA A RISCHIO" E "RECRUITED"
-- chi aveva Recruited perde anche la borsa atletica del roster
update public.sport_roster ro set scholarship = false
from public.character_options co join public.creation_options o on o.id = co.option_id
where co.character_id = ro.character_id and o.kind = 'vantaggio' and o.name = 'Recruited' and ro.scholarship;

update public.creation_options
set active = false, available = false, effects = '[]'::jsonb
where (kind = 'svantaggio' and name = 'Borsa a rischio') or (kind = 'vantaggio' and name = 'Recruited');
delete from public.character_options co
using public.creation_options o
where o.id = co.option_id and ((o.kind = 'svantaggio' and o.name = 'Borsa a rischio') or (o.kind = 'vantaggio' and o.name = 'Recruited'));

-- 3. I DUE VANTAGGI
update public.creation_options
set name = 'Borsa di studio accademica',
    description = 'Borsa di merito per i risultati scolastici: niente retta del college e camera doppia pagata (per la singola paghi solo la differenza) finché vai all''università. Si perde per sempre con un semestre sotto 2.5 di GPA o in Academic Probation. Non per le fasce Agiato, Ricco ed Élite; alternativa alla Borsa sportiva e al Pell Grant.'
where kind = 'vantaggio' and name = 'Borsa di studio';

insert into public.creation_options (kind, scope, subgroup, name, cost_px, max_level, choice_hint, secret_default, is_origin, available, description, effects, sort_order)
values ('vantaggio', 'sportiva', 'risorse', 'Borsa di studio sportiva', coalesce(public.setting_int('voci_px_per_punto'), 40), 1, '', false, false, true,
  'Borsa di merito per il talento sportivo: niente retta del college e camera doppia pagata (per la singola paghi solo la differenza) finché vai all''università e sei in una squadra. Si perde per sempre se la media delle pagelle di una stagione è sotto 6. Non per le fasce Agiato, Ricco ed Élite; alternativa alla Borsa accademica e al Pell Grant.',
  '[{"type":"rule_flag","flag":"athletic_scholarship"}]', 52)
on conflict (kind, name) do nothing;

-- la sportiva ha le stesse incompatibilità dell'accademica, e le due si escludono (in tutti e due i sensi)
do $$
declare
  v_acc uuid := (select id from public.creation_options where kind = 'vantaggio' and name = 'Borsa di studio accademica');
  v_sport uuid := (select id from public.creation_options where kind = 'vantaggio' and name = 'Borsa di studio sportiva');
  v_others uuid[];
begin
  if v_acc is null or v_sport is null then return; end if;
  v_others := (select incompatible_ids from public.creation_options where id = v_acc) || array[v_acc];
  update public.creation_options set incompatible_ids = array(select distinct unnest(incompatible_ids || v_others) except select v_sport) where id = v_sport;
  update public.creation_options set incompatible_ids = array(select distinct unnest(incompatible_ids || array[v_sport])) where id = any (v_others);
end;
$$;

update public.creation_options
set description = 'Hai compilato la FAFSA e ricevi il Pell Grant federale, un aiuto a fondo perduto per chi ha poche risorse: niente retta del college e camera doppia pagata (per la singola paghi solo la differenza) finché vai all''università. Non dipende dai voti. Solo per le fasce Al verde e Tirare avanti; alternativa alle borse di studio.'
where kind = 'vantaggio' and name = 'Pell Grant';

-- 4. QUANDO SI PERDONO
-- accademica: un semestre pubblicato sotto il minimo o in probation (o peggio)
create or replace function public.merit_scholarship_lost(p_character uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.term_reports tr join public.academic_terms t on t.id = tr.term_id
    where tr.character_id = p_character and t.status = 'published'
      and (tr.standing_after in ('probation', 'suspended', 'dismissed')
           or (tr.credits_attempted > 0 and tr.term_gpa < coalesce(public.uni_n('uni_borsa_gpa_min'), 2.5)))
  )
$$;
revoke execute on function public.merit_scholarship_lost(uuid) from public, anon, authenticated;

-- sportiva: una stagione chiusa con la media delle pagelle sotto il minimo
create or replace function public.athletic_scholarship_lost(p_character uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sport_event_rolls er
    join public.sport_events e on e.id = er.event_id and e.status = 'published'
    join public.sport_seasons s on s.id = e.season_id and s.status = 'closed'
    where er.character_id = p_character
    group by s.id
    having avg(er.grade) < coalesce(public.uni_n('sport_borsa_media_min'), 6)
  )
$$;
revoke execute on function public.athletic_scholarship_lost(uuid) from public, anon, authenticated;

create or replace function public.character_scholarship(p_character uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.character_is_student(p_character) and (
    (public.trait_flag(p_character, 'scholarship') and not public.merit_scholarship_lost(p_character))
    or public.trait_flag(p_character, 'pell_grant')
    or ((public.trait_flag(p_character, 'athletic_scholarship')
         or exists (select 1 from public.sport_roster ro where ro.character_id = p_character and ro.scholarship and ro.left_at is null))
        and exists (select 1 from public.sport_roster ro where ro.character_id = p_character and ro.left_at is null)
        and not public.athletic_scholarship_lost(p_character))
  )
$$;
revoke execute on function public.character_scholarship(uuid) from public, anon, authenticated;

-- 5. AVVISI
-- borsa accademica persa con il semestre appena pubblicato
create or replace function public.academic_terms_scholarship_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_min numeric := coalesce(public.uni_n('uni_borsa_gpa_min'), 2.5);
begin
  if new.status <> 'published' or old.status = 'published' then
    return null;
  end if;
  for r in
    select c.id, c.owner_id, c.name, tr.standing_after
    from public.term_reports tr join public.characters c on c.id = tr.character_id
    where tr.term_id = new.id
      and public.trait_flag(c.id, 'scholarship')
      and (tr.standing_after in ('probation', 'suspended', 'dismissed') or (tr.credits_attempted > 0 and tr.term_gpa < v_min))
      -- la prima volta: nessun semestre pubblicato prima l'aveva già fatta perdere
      and not exists (
        select 1 from public.term_reports p join public.academic_terms t on t.id = p.term_id
        where p.character_id = c.id and p.term_id <> new.id and t.status = 'published'
          and (p.standing_after in ('probation', 'suspended', 'dismissed') or (p.credits_attempted > 0 and p.term_gpa < v_min)))
  loop
    perform public.send_system_message(r.owner_id,
      '🎓 ' || public.first_name(r.name) || ' ha perso la Borsa di studio accademica: '
      || case when r.standing_after in ('probation', 'suspended', 'dismissed') then 'il semestre l''ha portato in Academic Probation'
              else 'il GPA del semestre è sotto ' || to_char(v_min, 'FM0.0') end
      || '. Da ora retta del college e camera si pagano ogni mese (Utility → Servizi bancari).');
  end loop;
  return null;
end;
$$;
revoke execute on function public.academic_terms_scholarship_notice() from public, anon, authenticated;
drop trigger if exists academic_terms_scholarship_notice on public.academic_terms;
create trigger academic_terms_scholarship_notice after update of status on public.academic_terms
  for each row execute function public.academic_terms_scholarship_notice();

-- borsa sportiva persa con la stagione appena chiusa
create or replace function public.sport_seasons_scholarship_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_min numeric := coalesce(public.uni_n('sport_borsa_media_min'), 6);
begin
  if new.status <> 'closed' or old.status = 'closed' then
    return null;
  end if;
  for r in
    select c.id, c.owner_id, c.name, round(avg(er.grade), 1) as media
    from public.sport_event_rolls er
    join public.sport_events e on e.id = er.event_id and e.season_id = new.id and e.status = 'published'
    join public.characters c on c.id = er.character_id
    where (public.trait_flag(c.id, 'athletic_scholarship')
           or exists (select 1 from public.sport_roster ro where ro.character_id = c.id and ro.scholarship))
    group by c.id, c.owner_id, c.name
    having avg(er.grade) < v_min
      -- la prima volta: nessuna stagione chiusa prima l'aveva già fatta perdere
      and not exists (
        select 1 from public.sport_event_rolls er2
        join public.sport_events e2 on e2.id = er2.event_id and e2.status = 'published'
        join public.sport_seasons s2 on s2.id = e2.season_id and s2.status = 'closed' and s2.id <> new.id
        where er2.character_id = c.id
        group by s2.id
        having avg(er2.grade) < v_min)
  loop
    perform public.send_system_message(r.owner_id,
      '🏅 ' || public.first_name(r.name) || ' ha perso la Borsa di studio sportiva: la media delle pagelle della stagione è '
      || to_char(r.media, 'FM90.0') || ', sotto ' || to_char(v_min, 'FM90') || '. Da ora retta del college e camera si pagano ogni mese (Utility → Servizi bancari).');
  end loop;
  return null;
end;
$$;
revoke execute on function public.sport_seasons_scholarship_notice() from public, anon, authenticated;
drop trigger if exists sport_seasons_scholarship_notice on public.sport_seasons;
create trigger sport_seasons_scholarship_notice after update of status on public.sport_seasons
  for each row execute function public.sport_seasons_scholarship_notice();
