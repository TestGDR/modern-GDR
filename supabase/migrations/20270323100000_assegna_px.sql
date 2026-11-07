-- =====================================================================
-- ASSEGNA PX
-- Chi ha il permesso «Assegnare PX» (personaggi.assegnare_px) dà o toglie
-- PX a uno o più personaggi approvati, con un motivo. Ogni assegnazione
-- resta nel registro xp_grants e il giocatore riceve un messaggio di
-- SISTEMA. I PX non scendono mai sotto zero (nel registro va quanto è
-- stato tolto davvero). Non contano nel tetto dei pacchetti settimanali.
-- =====================================================================

create table if not exists public.xp_grants (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  amount int not null check (amount <> 0 and amount between -10000 and 10000),
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists xp_grants_character on public.xp_grants (character_id, created_at desc);

alter table public.xp_grants enable row level security;
revoke all on public.xp_grants from anon, authenticated;
grant select on public.xp_grants to authenticated;
drop policy if exists "PX assegnati: proprietario e staff" on public.xp_grants;
create policy "PX assegnati: proprietario e staff" on public.xp_grants for select to authenticated
  using ((select public.owns_character(character_id)) or (select public.has_permission('personaggi.assegnare_px')));
drop policy if exists "PX assegnati: solo dalla funzione" on public.xp_grants;
create policy "PX assegnati: solo dalla funzione" on public.xp_grants for insert to authenticated with check (false);
drop policy if exists "PX assegnati: non si modificano" on public.xp_grants;
create policy "PX assegnati: non si modificano" on public.xp_grants for update to authenticated using (false);
drop policy if exists "PX assegnati: non si eliminano" on public.xp_grants;
create policy "PX assegnati: non si eliminano" on public.xp_grants for delete to authenticated using (false);

-- Assegna (o toglie, con un numero negativo) PX a uno o più personaggi approvati
create or replace function public.xp_grant(p_characters uuid[], p_amount int, p_reason text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  c record;
  v_real int;
  v_n int := 0;
begin
  if not public.has_permission('personaggi.assegnare_px') then
    raise exception 'Non hai il permesso di assegnare PX.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 or p_amount not between -10000 and 10000 then
    raise exception 'Scrivi quanti PX (da −10.000 a 10.000, non zero).' using errcode = 'P0001';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 300 then
    raise exception 'Scrivi il motivo (da 3 a 300 caratteri).' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_characters, 1), 0) = 0 then
    raise exception 'Scegli almeno un personaggio.' using errcode = 'P0001';
  end if;

  for c in
    select id, owner_id, px from public.characters
    where id = any (p_characters) and status = 'approvata'
    for update
  loop
    -- mai sotto zero: si toglie al massimo quello che c'è
    v_real := greatest(p_amount, -c.px);
    continue when v_real = 0;
    perform set_config('app.invio_scheda', 'on', true);
    update public.characters set px = px + v_real where id = c.id;
    perform set_config('app.invio_scheda', 'off', true);
    insert into public.xp_grants (character_id, amount, reason, granted_by) values (c.id, v_real, v_reason, auth.uid());
    if c.owner_id is not null then
      insert into public.system_messages (user_id, body)
      values (c.owner_id,
        case when v_real > 0 then '⭐ Hai ricevuto ' || v_real || ' PX' else '⭐ Ti sono stati tolti ' || -v_real || ' PX' end
        || ': ' || v_reason || '. Ora hai ' || (c.px + v_real) || ' PX da spendere in scheda.');
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    raise exception 'Nessun personaggio approvato a cui assegnare PX.' using errcode = 'P0001';
  end if;
  return v_n;
end;
$$;
revoke execute on function public.xp_grant(uuid[], int, text) from public, anon;
grant execute on function public.xp_grant(uuid[], int, text) to authenticated;

-- Registro: le ultime assegnazioni (di un personaggio o di tutti), con nomi
create or replace function public.xp_grants_list(p_character uuid default null, p_limit int default 100)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select g.id, g.character_id, ch.name as character_name, g.amount, g.reason, g.created_at,
      coalesce(gp.username, 'Staff') as granted_by_name
    from public.xp_grants g
    join public.characters ch on ch.id = g.character_id
    left join public.profiles gp on gp.id = g.granted_by
    where (p_character is null or g.character_id = p_character)
      and (public.has_permission('personaggi.assegnare_px') or public.owns_character(g.character_id))
    order by g.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  ) x
$$;
revoke execute on function public.xp_grants_list(uuid, int) from public, anon;
grant execute on function public.xp_grants_list(uuid, int) to authenticated;
