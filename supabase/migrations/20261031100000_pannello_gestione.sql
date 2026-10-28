-- =====================================================================
-- 14 · PANNELLO DI GESTIONE
-- Blocchi 3 e 4 del documento "GDR College – Sistema Interlock".
--
-- - Il livello dei nuovi iscritti si sceglie anche da "Livelli e permessi".
-- - Le impostazioni si controllano prima di salvarle (numeri, elenchi, livelli).
-- - Conteggi "in uso da N personaggi" per caratteristiche, abilità e scelte.
-- =====================================================================

-- 1. Il livello predefinito lo cambia anche chi gestisce i livelli
alter policy "Impostazioni: modifica con permesso" on public.game_settings
  using (
    (select public.has_permission('impostazioni.gestire'))
    or (key = 'livello_predefinito' and (select public.has_permission('livelli.gestire')))
  )
  with check (
    (select public.has_permission('impostazioni.gestire'))
    or (key = 'livello_predefinito' and (select public.has_permission('livelli.gestire')))
  );

-- 2. Controllo dei valori delle impostazioni
create or replace function public.validate_game_setting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'number' then
    if jsonb_typeof(new.value) <> 'number' or (new.value #>> '{}')::numeric <> trunc((new.value #>> '{}')::numeric)
       or (new.value #>> '{}')::numeric < 0 then
      raise exception '«%» deve essere un numero intero, zero o positivo', new.label;
    end if;
  elsif new.kind = 'numbers' then
    if jsonb_typeof(new.value) <> 'array' or jsonb_array_length(new.value) = 0
       or exists (select 1 from jsonb_array_elements(new.value) e where jsonb_typeof(e) <> 'number') then
      raise exception '«%» deve essere un elenco di numeri', new.label;
    end if;
  elsif new.kind = 'level' then
    if jsonb_typeof(new.value) <> 'string'
       or not exists (select 1 from public.user_levels where id::text = new.value #>> '{}' and not is_admin) then
      raise exception '«%» deve essere un livello esistente (non Amministratore)', new.label;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists game_settings_validate on public.game_settings;
create trigger game_settings_validate
  before update on public.game_settings
  for each row execute function public.validate_game_setting();

-- 3. Quante volte è usata ogni voce (solo per chi gestisce le regole)
create or replace function public.rules_usage()
returns table (kind text, id uuid, n int)
language sql
stable
security definer
set search_path = ''
as $$
  select 'attribute', attribute_id, count(*)::int from public.character_attributes
  where public.has_permission('regole.gestire') group by attribute_id
  union all
  select 'skill', skill_id, count(*)::int from public.character_skills
  where public.has_permission('regole.gestire') group by skill_id
  union all
  select 'option', option_id, count(*)::int from public.character_options
  where public.has_permission('regole.gestire') group by option_id;
$$;

revoke execute on function public.rules_usage() from anon;
