-- =====================================================================
-- "PUNTI AZIONE" DIVENTANO "AZIONI" (nomi delle impostazioni e messaggio
-- di SISTEMA del lunedì). La logica non cambia.
-- =====================================================================
update public.game_settings set label = 'Azioni · Caratteri minimi',
  description = 'Un''azione conta se è lunga almeno così (e c''è un altro personaggio in giocata).' where key = 'pa_caratteri_min';
update public.game_settings set label = 'Azioni · Fasce della settimana',
  description = 'Azioni minime per ogni pacchetto, dal più piccolo al più grande.' where key = 'pa_fasce';
update public.game_settings set label = 'Azioni · PX dei pacchetti' where key = 'pa_pacchetti';

create or replace function public.xp_weekly_award()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_pack int;
  v_room int;
  v_px int;
  v_count int := 0;
  v_cap int := coalesce(public.setting_int('px_tetto_totale'), 4000) - coalesce(public.setting_int('px_iniziali'), 1300);
begin
  for r in
    select ap.character_id, ap.week_start, greatest(0, ap.points + ap.adjusted) as points, c.owner_id, c.name
    from public.action_points ap join public.characters c on c.id = ap.character_id and c.status = 'approvata'
    where ap.week_start < public.rome_week_start()
      and not exists (select 1 from public.xp_awards a where a.character_id = ap.character_id and a.week_start = ap.week_start)
    order by ap.week_start
  loop
    v_pack := public.xp_package(r.points);
    v_room := greatest(0, v_cap - coalesce((select sum(px) from public.xp_awards where character_id = r.character_id), 0));
    v_px := least(v_pack, v_room);
    insert into public.xp_awards (character_id, week_start, points, px) values (r.character_id, r.week_start, r.points, v_px);
    if v_px > 0 then
      perform set_config('app.invio_scheda', 'on', true);
      update public.characters set px = px + v_px where id = r.character_id;
      perform set_config('app.invio_scheda', 'off', true);
    end if;
    perform public.send_system_message(r.owner_id,
      '⭐ Settimana dal ' || to_char(r.week_start, 'DD/MM') || ': ' || public.first_name(r.name) || ' ha fatto ' || r.points
      || case when r.points = 1 then ' azione' else ' azioni' end || ' → '
      || case when v_px > 0 then '+' || v_px || ' PX. Spendili in Scheda → Abilità.'
              when v_pack > 0 then 'nessun PX: hai raggiunto il tetto dei PX accumulati.'
              else 'nessun pacchetto (ne servono almeno ' || coalesce((public.uni_list('pa_fasce'))[1], 10)::int || ').' end);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.xp_weekly_award() from public, anon, authenticated;
