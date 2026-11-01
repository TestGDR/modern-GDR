-- =====================================================================
-- FASCE DI PATRIMONIO RICALIBRATE, PELL GRANT E BORSA DI STUDIO A 40 PX
-- - Al verde 300/300 (in pari), Tirare avanti 900/800 (+100), Vita
--   tranquilla 2600/1500, Agiato 3600/2200, Ricco 5500/3600, Élite
--   8500/6100; quote iniziali 300 / 1500 / 6000 / 15000 / 60000 / 200000.
--   Ai PG già approvati con una quota iniziale più alta si toglie la differenza.
-- - Pell Grant (vantaggio accademico, 40 PX, solo Al verde e Tirare
--   avanti, non con la Borsa di studio): come la borsa, niente retta e
--   camera doppia pagata. Borsa di studio scende a 40 PX.
-- (Applicata dall'SQL Editor il 01/11/2026.)
-- =====================================================================
do $$
declare
  v_riallinea boolean := true;
  r record;
  v_balance int;
begin
  if v_riallinea then
    for r in
      select c.id, c.owner_id, c.name, o.name as fascia, n.new_init - o.initial_amount as diff
      from public.character_options co
      join public.creation_options o on o.id = co.option_id and o.kind = 'tenore'
      join (values ('Al verde', 300), ('Tirare avanti', 1500), ('Vita tranquilla', 6000),
                   ('Agiato', 15000), ('Ricco', 60000), ('Élite', 200000)) n (fascia, new_init) on n.fascia = o.name
      join public.characters c on c.id = co.character_id and c.status = 'approvata'
      join public.bank_accounts a on a.character_id = c.id and a.initial_paid
      where n.new_init < o.initial_amount
    loop
      update public.bank_accounts set balance = balance + r.diff, updated_at = now()
      where character_id = r.id returning balance into v_balance;
      insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
      values (r.id, r.diff, 'iniziale', 'Fasce di patrimonio ricalibrate: adeguamento della quota iniziale', v_balance);
      perform public.send_system_message(r.owner_id,
        'Banca · ' || r.name || E'\nLe fasce di patrimonio sono state ricalibrate: la quota iniziale di «' || r.fascia || '» ora è più bassa. '
        || 'Differenza: ' || r.diff || E' $\nDettagli in Utility → Servizi bancari.');
    end loop;
  end if;

  update public.creation_options o set salary = n.salary, upkeep = n.upkeep, initial_amount = n.init
  from (values ('Al verde', 300, 300, 300), ('Tirare avanti', 900, 800, 1500), ('Vita tranquilla', 2600, 1500, 6000),
               ('Agiato', 3600, 2200, 15000), ('Ricco', 5500, 3600, 60000), ('Élite', 8500, 6100, 200000)) n (fascia, salary, upkeep, init)
  where o.kind = 'tenore' and o.name = n.fascia;
end;
$$;

update public.creation_options set cost_px = coalesce(public.setting_int('voci_px_per_punto'), 40)
where kind = 'vantaggio' and name = 'Borsa di studio';

insert into public.creation_options (kind, scope, subgroup, name, cost_px, max_level, choice_hint, secret_default, is_origin, available, description, effects, sort_order)
values ('vantaggio', 'accademica', 'risorse', 'Pell Grant', coalesce(public.setting_int('voci_px_per_punto'), 40), 1, '', false, false, true,
  'Hai compilato la FAFSA e ricevi il Pell Grant federale, un aiuto a fondo perduto per chi ha poche risorse: niente retta del college e camera doppia pagata (per la singola paghi solo la differenza). Solo per le fasce Al verde e Tirare avanti; non si somma alla Borsa di studio.',
  '[{"type":"rule_flag","flag":"pell_grant"}]', 51)
on conflict (kind, name) do nothing;

do $$
declare
  v_pell uuid := (select id from public.creation_options where kind = 'vantaggio' and name = 'Pell Grant');
  v_others uuid[] := array(select id from public.creation_options
    where (kind = 'tenore' and name in ('Vita tranquilla', 'Agiato', 'Ricco', 'Élite'))
       or (kind = 'vantaggio' and name = 'Borsa di studio'));
begin
  if v_pell is null then return; end if;
  update public.creation_options set incompatible_ids = array(select distinct unnest(incompatible_ids || v_others)) where id = v_pell;
  update public.creation_options set incompatible_ids = array(select distinct unnest(incompatible_ids || v_pell)) where id = any (v_others);
end;
$$;

create or replace function public.character_scholarship(p_character uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    public.trait_flag(p_character, 'scholarship')
    and not (
      public.trait_flag(p_character, 'merit_scholarship')
      and exists (
        select 1 from public.term_reports tr join public.academic_terms t on t.id = tr.term_id
        where tr.character_id = p_character and t.status = 'published' and tr.credits_attempted > 0 and tr.term_gpa < 2.5)
    )
  ) or public.trait_flag(p_character, 'pell_grant')
    or exists (
    select 1 from public.sport_roster ro where ro.character_id = p_character and ro.scholarship and ro.left_at is null
  )
$$;
revoke execute on function public.character_scholarship(uuid) from public, anon, authenticated;
