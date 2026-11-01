-- =====================================================================
-- DESCRIZIONE DI VANTAGGI, SVANTAGGI E TRATTI NEL BACKGROUND
-- Ogni voce scelta in creazione ha una descrizione: come si vede nella
-- storia del personaggio (passaggio 5, Background). È obbligatoria per
-- inviare la scheda (non per il patrimonio e per le voci date dal Master).
-- =====================================================================
alter table public.character_options
  add column if not exists note text not null default '' check (char_length(note) <= 1000);

create or replace function public.characters_require_option_notes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing text;
begin
  if new.status = 'in_attesa' and old.status is distinct from 'in_attesa' then
    select string_agg(o.name, ', ' order by o.name) into v_missing
    from public.character_options co join public.creation_options o on o.id = co.option_id
    where co.character_id = new.id and o.kind in ('vantaggio', 'svantaggio', 'tratto')
      and co.source = 'creazione' and btrim(co.note) = '';
    if v_missing is not null then
      raise exception 'Descrivi nel Background (passaggio 5) come si vedono nella storia: %.', v_missing using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.characters_require_option_notes() from public, anon, authenticated;
drop trigger if exists characters_require_option_notes on public.characters;
create trigger characters_require_option_notes before update of status on public.characters
  for each row execute function public.characters_require_option_notes();
