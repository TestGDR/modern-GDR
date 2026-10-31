-- Sicurezza della zona per ogni chat: semaforo verde (sicura), giallo (poco sicura),
-- rosso (pericolosa). Si sceglie in Gestione → Mondo → Chat; si vede sulla mappa e in chat.
alter table public.rooms
  add column if not exists safety text not null default 'sicura'
  check (safety in ('sicura', 'poco_sicura', 'pericolosa'));

-- la scrive lo staff del mondo (le policy di rooms valgono già per mondo.gestire)
grant insert (safety), update (safety) on public.rooms to authenticated;

-- anche il cambio della sicurezza finisce nel registro del pannello
create or replace trigger rooms_log after insert or delete or update of
  location_id, name, description, is_open, sort_order, group_id, image_url, access, owner_character_id, safety
  on public.rooms
  for each row execute function public.log_admin_change();
