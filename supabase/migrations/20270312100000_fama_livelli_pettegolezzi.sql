-- =====================================================================
-- FAMA: DESCRIZIONE DEI LIVELLI E PETTEGOLEZZI
-- 1. Ogni livello di fama e di infamia ha una descrizione con le
--    indicazioni per giocarlo (fame_levels.description), mostrata in
--    scheda → Fama e modificabile in Gestione → Fama → Livelli.
-- 2. Pettegolezzi: nel tiro di fine giocata conta il luogo. In una chat
--    pubblica chi ha fama o infamia viene notato più facilmente: al dado
--    si somma il bonus del suo livello (fame_levels.gossip_bonus; vale il
--    più alto tra fama e infamia). Nei luoghi privati niente bonus.
-- =====================================================================
alter table public.fame_levels add column if not exists description text not null default '' check (char_length(description) <= 1500);
alter table public.fame_levels add column if not exists gossip_bonus int not null default 0 check (gossip_bonus between -10 and 20);

update public.fame_levels l set description = v.descr, gossip_bonus = v.bonus
from (values
  ('fama', 'Sconosciuto', 0, 'Nessuno ti ferma per strada: puoi muoverti dove vuoi senza che nessuno ti noti, e su di te girano pochi pettegolezzi. Gioca l''anonimato: è una libertà, ma nessuna porta si apre per il tuo nome.'),
  ('fama', 'Noto nel campus', 1, 'Nel campus qualcuno conosce il tuo nome: compagni di corso, di squadra, gente delle feste. Nei luoghi pubblici del campus capita che ti salutino o ti indichino; fuori dal campus resti quasi anonimo. Ogni tanto qualcuno parla di te.'),
  ('fama', 'Popolare', 2, 'Il tuo nome gira: alle feste ti cercano, sui social ti seguono, i PNG del campus sanno chi sei. Nei luoghi pubblici è facile che qualcuno ti noti e lo racconti. Gioca con la reputazione: ogni gesto in pubblico può diventare un pettegolezzo.'),
  ('fama', 'Celebre', 3, 'Ti conoscono anche fuori dal campus: ti chiedono foto, il giornale del college ti cerca, i marchi ti scrivono. In pubblico vieni riconosciuto quasi sempre: per la privacy servono luoghi chiusi. Ogni passo falso fa notizia e c''è chi ti si avvicina per interesse.'),
  ('fama', 'Leggenda di San Diego', 5, 'A San Diego ti conoscono tutti. Non puoi stare in un luogo pubblico senza essere riconosciuto, fotografato o avvicinato. Hai porte aperte ovunque ma niente anonimato: gioca la pressione della fama, i fan, i paparazzi, le aspettative degli altri.'),
  ('infamia', 'Pulito', 0, 'La tua reputazione è pulita: nessuno ha motivo di diffidare di te.'),
  ('infamia', 'Chiacchierato', 1, 'Su di te gira qualche voce: qualcuno ti guarda storto, altri sono curiosi. Nei luoghi pubblici chi ti riconosce tende a raccontare cosa fai.'),
  ('infamia', 'Malfamato', 2, 'Hai una brutta fama: professori, staff del campus e genitori ti tengono d''occhio. Alcuni posti ti accolgono con sospetto e i tuoi errori vengono notati e ingigantiti.'),
  ('infamia', 'Famigerato', 3, 'Tutti conoscono le tue storie peggiori: sei sorvegliato, evitato o cercato per i motivi sbagliati. In pubblico quasi ogni tua mossa viene notata e diventa pettegolezzo.')
) as v (kind, name, bonus, descr)
where l.kind = v.kind and l.name = v.name and l.description = '';

create or replace function public.fame_level_info(p_points int, p_kind text default 'fama')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with cur as (
    select * from public.fame_levels where kind = p_kind and min_points <= greatest(p_points, 0)
    order by min_points desc limit 1
  ), low as (
    select * from public.fame_levels where kind = p_kind order by min_points limit 1
  ), lv as (
    select * from cur union all select * from low where not exists (select 1 from cur)
  ), nxt as (
    select * from public.fame_levels where kind = p_kind and min_points > (select min_points from lv)
    order by min_points limit 1
  )
  select case when not exists (select 1 from lv) then null else jsonb_build_object(
    'points', p_points,
    'description', (select description from lv), 'gossip_bonus', (select gossip_bonus from lv),
    'id', (select id from lv), 'name', (select name from lv), 'icon', (select icon from lv), 'color', (select color from lv),
    'min', (select min_points from lv),
    'next_name', (select name from nxt), 'next_min', (select min_points from nxt),
    'missing', case when exists (select 1 from nxt) then (select min_points from nxt) - p_points end,
    'pct', case when p_points < 0 then 0
                when not exists (select 1 from nxt) then 100
                else least(100, greatest(0, round(100.0 * (p_points - (select min_points from lv))
                       / nullif((select min_points from nxt) - (select min_points from lv), 0))))::int end) end
$$;

-- tiro dei pettegolezzi: dove eravate (chat), e il bonus del livello nei luoghi pubblici
alter table public.gossip_rolls add column if not exists room_id uuid references public.rooms (id) on delete set null;
alter table public.gossip_rolls add column if not exists bonus int not null default 0;
create index if not exists gossip_rolls_room_idx on public.gossip_rolls (room_id);

drop function if exists public.gossip_roll(uuid);
create or replace function public.gossip_roll(p_character uuid, p_room uuid default null)
returns table (id uuid, seen boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.gossip_settings;
  f public.character_fame;
  v_roll int;
  v_bonus int := 0;
  v_id uuid;
begin
  if not public.owns_character(p_character) then
    raise exception 'Serve un personaggio approvato.' using errcode = 'P0001';
  end if;
  select * into s from public.gossip_settings;
  -- luogo pubblico: chi è famoso (o famigerato) si nota di più
  if p_room is not null and exists (select 1 from public.rooms where rooms.id = p_room and access = 'pubblica') then
    select * into f from public.character_fame where character_id = p_character;
    v_bonus := greatest(0,
      coalesce((public.fame_level_info(coalesce(f.fame_cache, 0), 'fama') ->> 'gossip_bonus')::int, 0),
      coalesce((public.fame_level_info(coalesce(f.infamy_cache, 0), 'infamia') ->> 'gossip_bonus')::int, 0));
  end if;
  v_roll := 1 + floor(random() * s.die_sides)::int;
  insert into public.gossip_rolls (character_id, user_id, roll, sides, seen, room_id, bonus)
  values (p_character, auth.uid(), v_roll, s.die_sides, v_roll + v_bonus >= s.seen_from, p_room, v_bonus)
  returning gossip_rolls.id into v_id;
  return query select v_id, v_roll + v_bonus >= s.seen_from;
end;
$$;
revoke execute on function public.gossip_roll(uuid, uuid) from public, anon;
grant execute on function public.gossip_roll(uuid, uuid) to authenticated;
