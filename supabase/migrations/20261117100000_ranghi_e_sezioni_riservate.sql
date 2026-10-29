-- =====================================================================
-- RANGHI DI RIUSCITA E SEZIONI RISERVATE DELLA SCHEDA
--
-- - Soglie dei ranghi (caratteristica + abilità): da 1 a 4 pessimo,
--   da 5 scadente, da 10 buono, da 13 ottimo, da 18 eccellenza.
--   Si cambiano in Gestione → Impostazioni.
-- - Caratteristiche, abilità e scelte di un personaggio le leggono solo
--   il proprietario e chi ha "personaggi.vedere_tutti" (l'Amministratore
--   li ha tutti). I tiri di dado non cambiano: li calcola il database.
-- - Il patrimonio (fascia di ricchezza) resta visibile a tutti nella
--   sezione Dati, con character_wealth().
-- =====================================================================

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('soglie_riuscita', '[5, 10, 13, 18]', 'numbers', 'Soglie dei ranghi di riuscita',
   'Caratteristica + abilità da cui iniziano i ranghi: scadente, buono, ottimo, eccellenza (sotto la prima è pessimo).', 50)
on conflict (key) do nothing;

-- Valori di gioco del personaggio: solo il proprietario e lo staff
create or replace function public.can_see_character(p_character_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.characters c
    where c.id = p_character_id
      and (c.owner_id = (select auth.uid()) or public.has_permission('personaggi.vedere_tutti'))
  );
$$;

-- Patrimonio di un personaggio, per la sezione Dati (visibile a tutti)
create or replace function public.character_wealth(p_character uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from public.character_options co join public.creation_options o on o.id = co.option_id
  where co.character_id = p_character and o.kind = 'tenore' and auth.uid() is not null
  limit 1
$$;
revoke execute on function public.character_wealth(uuid) from public, anon;
grant execute on function public.character_wealth(uuid) to authenticated;
