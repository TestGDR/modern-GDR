-- =====================================================================
-- 13 · CREAZIONE DEL PERSONAGGIO IN 6 PASSAGGI
-- Blocco 2 del documento "GDR College – Sistema Interlock".
--
-- - Campi anagrafici e di background sulla scheda; passaggio raggiunto.
-- - Nazionalità come testo libero (scritta dal giocatore).
-- - Invio in approvazione con controllo completo lato server.
-- - Approvazione o rifiuto (con motivo) da parte di chi ha il permesso.
-- - Solo i personaggi approvati giocano (chat, messaggi, forum, social).
-- - Via le 4 caratteristiche provvisorie (sostituite dal sistema Interlock).
-- =====================================================================

-- 1. La nazionalità è testo libero: nessun elenco
alter table public.characters drop column if exists nationality_id;
delete from public.sheet_options where kind = 'nazionalita';
alter table public.sheet_options drop constraint if exists sheet_options_kind_check;
alter table public.sheet_options
  add constraint sheet_options_kind_check check (kind in ('indirizzo', 'anno', 'club'));

-- 2. Nuovi campi della scheda
alter table public.characters
  add column if not exists sex text check (sex in ('M', 'F', 'X')),
  add column if not exists birth_date date,
  add column if not exists nationality text check (char_length(nationality) <= 60),
  add column if not exists study_track_id uuid references public.sheet_options (id) on delete set null,
  add column if not exists year_id uuid references public.sheet_options (id) on delete set null,
  add column if not exists club_id uuid references public.sheet_options (id) on delete set null,
  -- ultimo passaggio raggiunto nella creazione (per riprendere da lì)
  add column if not exists creation_step smallint not null default 1 check (creation_step between 1 and 6);

-- L'età segue i parametri del sistema, non più il vecchio limite fisso
alter table public.characters drop constraint if exists characters_age_check;
alter table public.characters add constraint characters_age_check check (age between 10 and 120);

-- 3. Via le caratteristiche provvisorie
drop trigger if exists characters_protect_stats on public.characters;
drop function if exists public.protect_character_stats();
alter table public.characters drop constraint if exists characters_stats_budget;
alter table public.characters
  drop column if exists physique,
  drop column if exists cunning,
  drop column if exists charisma,
  drop column if exists driving;

-- 4. Solo i personaggi approvati giocano
create or replace function public.owns_character(p_character_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.characters
    where id = p_character_id
      and owner_id = (select auth.uid())
      and status = 'approvata'
  );
$$;

-- 5. Un'abilità si controlla solo quando sale: se una caratteristica scende,
--    le abilità già comprate restano (il sito mostra un avviso)
create or replace function public.check_skill_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attr int;
begin
  if tg_op = 'UPDATE' and new.level <= old.level then
    return new;
  end if;
  if new.level > coalesce(public.setting_int('abilita_max'), 10) then
    raise exception 'Il livello supera il massimo assoluto delle abilità';
  end if;
  select ca.value into v_attr
  from public.skills s
  join public.character_attributes ca on ca.attribute_id = s.attribute_id and ca.character_id = new.character_id
  where s.id = new.skill_id;
  if new.level > coalesce(v_attr, 0) then
    raise exception 'Un''abilità non può superare il valore della caratteristica collegata';
  end if;
  return new;
end;
$$;

-- 6. L'invio può impostare i PX avanzati e lo stato "in attesa"
create or replace function public.protect_character_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- SQL Editor o chiave segreta (nessun utente collegato): contesto fidato, nessun controllo
  if (select auth.uid()) is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- invio della scheda da submit_character(), già controllato
  if current_setting('app.invio_scheda', true) = 'on' then
    return new;
  end if;
  if public.has_permission('personaggi.approvare') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status = 'bozza';
    new.rejection_reason = null;
    new.px = 0;
    return new;
  end if;
  if new.status is distinct from old.status then
    raise exception 'Lo stato della scheda cambia con l''invio o con l''approvazione';
  end if;
  if new.rejection_reason is distinct from old.rejection_reason then
    raise exception 'Il motivo del rifiuto lo scrive chi approva';
  end if;
  if new.px is distinct from old.px and not public.has_permission('personaggi.assegnare_px') then
    raise exception 'I PX li assegna il Master';
  end if;
  return new;
end;
$$;

-- 7. Invio in approvazione: controlla tutta la scheda
create or replace function public.submit_character(p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.characters;
  v_count int;
  v_total int;
  v_options int;
  v_skills int;
  v_left int;
  v_maxes jsonb := (select value from public.game_settings where key = 'massimali_creazione');
  v_last_max int;
begin
  select * into c from public.characters where id = p_character and owner_id = (select auth.uid());
  if c.id is null then
    raise exception 'Scheda non trovata';
  end if;
  if c.status not in ('bozza', 'rifiutata') then
    raise exception 'La scheda è già stata inviata';
  end if;

  -- Dati anagrafici
  if c.sex is null or c.age is null or c.birth_date is null or coalesce(trim(c.nationality), '') = '' then
    raise exception 'Completa i dati anagrafici';
  end if;
  if c.age < public.setting_int('eta_min') or c.age > public.setting_int('eta_max') then
    raise exception 'L''età non rientra in quella consentita';
  end if;

  -- Caratteristiche: tutte impostate, punti spesi tutti, minimi e massimali rispettati
  select count(*), coalesce(sum(ca.value), 0) into v_count, v_total
  from public.character_attributes ca join public.attributes a on a.id = ca.attribute_id and a.active
  where ca.character_id = p_character;
  if v_count <> (select count(*) from public.attributes where active) then
    raise exception 'Imposta tutte le caratteristiche';
  end if;
  if v_total <> public.setting_int('punti_caratteristiche') then
    raise exception 'Devi spendere esattamente % punti caratteristica (ne hai usati %)', public.setting_int('punti_caratteristiche'), v_total;
  end if;
  if exists (
    select 1 from public.character_attributes ca join public.attributes a on a.id = ca.attribute_id and a.active
    where ca.character_id = p_character
      and (ca.value < public.setting_int('caratteristica_min_creazione') or ca.value > public.setting_int('caratteristica_max'))
  ) then
    raise exception 'Una caratteristica è fuori dai valori consentiti';
  end if;
  v_last_max := coalesce((v_maxes ->> (jsonb_array_length(v_maxes) - 1))::int, public.setting_int('caratteristica_max'));
  if exists (
    select 1
    from (
      select ca.value, row_number() over (order by ca.value desc) as pos
      from public.character_attributes ca join public.attributes a on a.id = ca.attribute_id and a.active
      where ca.character_id = p_character
    ) v
    where v.value > coalesce((v_maxes ->> (v.pos::int - 1))::int, v_last_max)
  ) then
    raise exception 'Le caratteristiche superano i massimali consentiti';
  end if;

  -- Abilità mai sopra la caratteristica collegata
  if exists (
    select 1
    from public.character_skills cs
    join public.skills s on s.id = cs.skill_id
    left join public.character_attributes ca on ca.attribute_id = s.attribute_id and ca.character_id = cs.character_id
    where cs.character_id = p_character and cs.level > coalesce(ca.value, 0)
  ) then
    raise exception 'Un''abilità supera la caratteristica collegata';
  end if;

  -- Tenore di vita: una sola scelta; niente voci incompatibili
  if (
    select count(*) from public.character_options co join public.creation_options o on o.id = co.option_id
    where co.character_id = p_character and o.kind = 'tenore'
  ) <> 1 then
    raise exception 'Scegli un tenore di vita';
  end if;
  if exists (
    select 1
    from public.character_options co1
    join public.creation_options o1 on o1.id = co1.option_id
    join public.character_options co2 on co2.character_id = co1.character_id and co2.option_id = any (o1.incompatible_ids)
    where co1.character_id = p_character
  ) then
    raise exception 'Hai scelto voci incompatibili tra loro';
  end if;

  -- PX: iniziali − vantaggi/tratti/tenore + svantaggi − abilità
  select coalesce(sum(o.cost_px), 0) into v_options
  from public.character_options co join public.creation_options o on o.id = co.option_id
  where co.character_id = p_character;
  select coalesce(sum(public.setting_int('costo_px_livello') * cs.level * (cs.level + 1) / 2), 0) into v_skills
  from public.character_skills cs where cs.character_id = p_character;
  v_left := public.setting_int('px_iniziali') - v_options - v_skills;
  if v_left < 0 then
    raise exception 'Hai speso più PX di quelli disponibili (%)', v_left;
  end if;

  -- Background
  if c.study_track_id is null or c.year_id is null then
    raise exception 'Scegli indirizzo di studio e anno di corso';
  end if;

  perform set_config('app.invio_scheda', 'on', true);
  update public.characters
  set status = 'in_attesa', px = v_left, rejection_reason = null, creation_step = 6
  where id = p_character;
  perform set_config('app.invio_scheda', 'off', true);
end;
$$;

-- 8. Approvazione o rifiuto
create or replace function public.review_character(p_character uuid, p_approve boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('personaggi.approvare') then
    raise exception 'Non hai il permesso di approvare le schede';
  end if;
  if not exists (select 1 from public.characters where id = p_character and status = 'in_attesa') then
    raise exception 'La scheda non è in attesa di approvazione';
  end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then
    raise exception 'Scrivi il motivo del rifiuto';
  end if;
  update public.characters
  set status = case when p_approve then 'approvata' else 'rifiutata' end,
      rejection_reason = case when p_approve then null else left(trim(p_reason), 1000) end
  where id = p_character;
end;
$$;

revoke execute on function public.submit_character(uuid) from anon;
revoke execute on function public.review_character(uuid, boolean, text) from anon;
