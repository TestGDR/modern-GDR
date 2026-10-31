-- Gruppi di chat: una breve descrizione, mostrata sotto il nome del gruppo
-- nella finestra del quartiere sulla mappa (Gestione → Mondo → Chat).
alter table public.room_groups
  add column if not exists description text not null default '' check (char_length(description) <= 300);
