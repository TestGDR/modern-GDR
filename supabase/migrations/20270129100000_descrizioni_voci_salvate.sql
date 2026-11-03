-- =====================================================================
-- DESCRIZIONI DI VANTAGGI, SVANTAGGI E TRATTI: ORA SI SALVANO
-- La colonna character_options.note (nata come nota del Master) è quella
-- delle descrizioni scritte dal giocatore nel Background, ma il trigger
-- character_options_guard la svuotava (voce nuova) o la riportava al
-- valore vecchio (voce già scelta) per chi non è staff: le descrizioni
-- non restavano mai e l'invio della scheda le diceva mancanti.
-- In più il limite era 300 caratteri contro i 1.000 della pagina.
-- =====================================================================

alter table public.character_options drop constraint if exists character_options_note_check;
alter table public.character_options add constraint character_options_note_check check (char_length(note) <= 1000);

-- Il giocatore scrive le sue descrizioni; restano allo staff solo l'origine
-- della voce (data dal Master, non costa PX) e il PNG collegato.
create or replace function public.character_options_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.has_permission('personaggi.modificare_tutti') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.source := 'creazione';
    new.npc_id := null;
  else
    new.source := old.source;
    new.npc_id := old.npc_id;
  end if;
  if exists (select 1 from public.creation_options where id = new.option_id and requires_choice = 'master') then
    new.choice_value := case when tg_op = 'INSERT' then '' else old.choice_value end;
  end if;
  return new;
end;
$$;
revoke execute on function public.character_options_guard() from public, anon, authenticated;
