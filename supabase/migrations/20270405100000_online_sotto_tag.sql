-- =====================================================================
-- ONLINE: IL SOTTO-TAG DELLA CHAT ACCANTO AL NOME
-- touch_online tiene anche «subTag» (il nome del sotto-tag in cui il
-- personaggio si trova nella sua chat, max 40 caratteri), mostrato
-- nell'elenco «Online» della barra laterale.
-- =====================================================================

create or replace function public.touch_online(p_info jsonb, p_action boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_info jsonb := coalesce(p_info, '{}'::jsonb);
begin
  if auth.uid() is null then return; end if;
  -- si tengono solo i campi previsti, con testi brevi
  v_info := jsonb_strip_nulls(jsonb_build_object(
    'availability', case when v_info ->> 'availability' in ('disponibile', 'cerca', 'occupato') then v_info ->> 'availability' end,
    'place', left(v_info ->> 'place', 80),
    'placeKey', left(v_info ->> 'placeKey', 60),
    'note', nullif(left(btrim(v_info ->> 'note'), 80), ''),
    'subTag', nullif(left(btrim(v_info ->> 'subTag'), 40), '')
  ));
  insert into public.online_status (user_id, info, last_seen, last_action)
  values (auth.uid(), v_info, now(), now())
  on conflict (user_id) do update set
    info = excluded.info,
    last_seen = now(),
    last_action = case when p_action then now() else public.online_status.last_action end;
end;
$$;

revoke execute on function public.touch_online(jsonb, boolean) from public, anon;
grant execute on function public.touch_online(jsonb, boolean) to authenticated;
