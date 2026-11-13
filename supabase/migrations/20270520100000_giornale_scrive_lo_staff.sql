-- =====================================================================
-- CAMPUS WIRE: SCRIVE ANCHE LO STAFF
-- Prima scriveva solo chi era membro di un gruppo della redazione: se il
-- Club Giornalistico era vuoto nessuno vedeva «Scrivi», e nemmeno lo
-- staff che pubblica. Ora scrive anche chi ha giornale.gestire, con il
-- proprio personaggio approvato. press_me dice anche il motivo per cui
-- non si può scrivere (per la pagina) e quanti sono in redazione.
-- Alla fine: chi c'è oggi nei gruppi della redazione.
-- =====================================================================

-- può firmare un pezzo con questo personaggio
create or replace function public.press_can_sign(p_pg uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.press_writer(p_pg)
    or (public.has_permission('giornale.gestire')
        and exists (select 1 from public.characters c where c.id = p_pg and c.owner_id = auth.uid() and c.status = 'approvata'))
$$;
revoke execute on function public.press_can_sign(uuid) from public, anon;
grant execute on function public.press_can_sign(uuid) to authenticated;

create or replace function public.press_me()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'editor', public.press_is_editor(),
    'writers', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name))
                         from public.characters c where c.owner_id = auth.uid() and public.press_can_sign(c.id)), '[]'::jsonb),
    'has_character', exists (select 1 from public.characters c where c.owner_id = auth.uid() and c.status = 'approvata'),
    'groups', coalesce((select jsonb_agg(g.name order by g.name) from public.game_groups g where g.press_access and g.active), '[]'::jsonb),
    'members', (select count(distinct cg.character_id)::int from public.character_groups cg
                join public.game_groups g on g.id = cg.group_id where g.press_access and g.active)
  )
$$;
revoke execute on function public.press_me() from public, anon;
grant execute on function public.press_me() to authenticated;

-- press_save: chi può firmare (redazione o staff del giornale)
create or replace function public.press_save(
  p_id uuid, p_pg uuid, p_kind text, p_title text, p_summary text, p_body text,
  p_section text, p_cover text, p_guests text, p_submit boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.press_items;
  v_editor boolean := public.press_is_editor();
  v_cover text := nullif(btrim(coalesce(p_cover, '')), '');
  v_id uuid;
  v_status text;
begin
  if p_id is null then
    if not public.owns_character(p_pg) then raise exception 'Personaggio non valido.'; end if;
    if not public.press_can_sign(p_pg) then
      raise exception 'Scrive sul giornale solo chi fa parte della redazione (Club Giornalistico) o lo staff del giornale.';
    end if;
  else
    select * into it from public.press_items where id = p_id for update;
    if it.id is null then raise exception 'Pezzo non trovato.'; end if;
    if it.author_id <> auth.uid() and not v_editor then raise exception 'Puoi modificare solo i tuoi pezzi.'; end if;
    if it.status = 'pubblicato' and not v_editor then
      raise exception 'Il pezzo è già uscito: per correggerlo chiedi al Direttore o al Caporedattore.';
    end if;
  end if;
  if p_kind not in ('articolo', 'podcast') then raise exception 'Scegli articolo o podcast.'; end if;
  if char_length(btrim(coalesce(p_title, ''))) < 3 then raise exception 'Il titolo deve avere almeno 3 caratteri.'; end if;
  if v_cover is not null and v_cover !~ '^https://' then raise exception 'L''immagine dev''essere un link https://'; end if;

  if p_id is null then
    insert into public.press_items (kind, character_id, author_id, title, summary, body, section, cover_url, guests, status)
    values (p_kind, p_pg, auth.uid(), left(btrim(p_title), 150), left(btrim(coalesce(p_summary, '')), 400), left(coalesce(p_body, ''), 40000),
            coalesce(nullif(p_section, ''), 'campus'), v_cover, left(btrim(coalesce(p_guests, '')), 200),
            case when p_submit then 'in_revisione' else 'bozza' end)
    returning id, status into v_id, v_status;
  else
    v_status := case when p_submit and it.status in ('bozza', 'rifiutato') then 'in_revisione' else it.status end;
    update public.press_items set kind = p_kind, title = left(btrim(p_title), 150), summary = left(btrim(coalesce(p_summary, '')), 400),
      body = left(coalesce(p_body, ''), 40000), section = coalesce(nullif(p_section, ''), 'campus'), cover_url = v_cover,
      guests = left(btrim(coalesce(p_guests, '')), 200), status = v_status, updated_at = now()
    where id = p_id;
    v_id := p_id;
  end if;

  if p_submit and v_status = 'in_revisione' and (p_id is null or it.status <> 'in_revisione') then
    perform public.press_notify_editors(v_id,
      '📰 Campus Wire: «' || btrim(p_title) || '» di ' || public.first_name((select name from public.characters c join public.press_items i on i.character_id = c.id where i.id = v_id))
      || ' aspetta di essere pubblicato. Lo trovi nel Giornale → Redazione.');
  end if;
  return v_id;
end;
$$;
revoke execute on function public.press_save(uuid, uuid, text, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.press_save(uuid, uuid, text, text, text, text, text, text, text, boolean) to authenticated;

-- controllo: gruppi della redazione, chi c'è e chi pubblica
select g.name as gruppo, g.press_access as scrive, c.name as personaggio, r.name as ruolo, r.press_editor as pubblica
from public.game_groups g
left join public.character_groups cg on cg.group_id = g.id
left join public.characters c on c.id = cg.character_id
left join public.group_roles r on r.id = cg.role_id
where g.press_access or lower(g.name) like '%giornal%'
order by g.name, r.press_editor desc, c.name;
