-- =====================================================================
-- SPORT: VIA IL REDSHIRT
-- Il Redshirt (un anno in squadra senza gareggiare, per non consumare una
-- delle 4 stagioni) non ha senso nel gioco: si toglie. Chi lo era passa a
-- Riserva (di nuovo convocabile) e non si può più scegliere. Il limite delle
-- stagioni (sport_stagioni_max) resta.
-- =====================================================================

update public.sport_roster set squad_status = 'reserve' where squad_status = 'redshirt';

alter table public.sport_roster drop constraint if exists sport_roster_squad_status_check;
alter table public.sport_roster add constraint sport_roster_squad_status_check
  check (squad_status in ('starter', 'reserve', 'captain'));

-- l'allenamento si sceglie come prima; il Redshirt non c'è più
create or replace function public.sport_set_training(p_character uuid, p_sport uuid, p_intensity text, p_redshirt boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ro public.sport_roster;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if p_intensity not in ('light', 'normal', 'intense') then raise exception 'Intensità non valida.' using errcode = 'P0001'; end if;
  select * into ro from public.sport_roster where character_id = p_character and sport_id = p_sport and left_at is null for update;
  if ro.id is null then raise exception 'Non fai parte di questo sport.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.sport_events e join public.sport_seasons se on se.id = e.season_id
             where e.sport_id = p_sport and se.status = 'active' and e.status in ('simulated', 'published')) then
    raise exception 'La stagione è già cominciata: l''intensità si sceglie prima del primo evento.' using errcode = 'P0001';
  end if;
  update public.sport_roster set training_intensity = p_intensity where id = ro.id;
end;
$$;
revoke execute on function public.sport_set_training(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.sport_set_training(uuid, uuid, text, boolean) to authenticated;
