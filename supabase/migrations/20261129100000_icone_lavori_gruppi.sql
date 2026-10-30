-- =====================================================================
-- ICONE DI LAVORI E GRUPPI (circa 20x20)
-- Un link a un'immagine (https://…), facoltativo: compare accanto al nome
-- in Utility, nella scheda (Dati → Gruppi e lavoro) e nel pannello.
-- Lo scrive chi gestisce lavori o gruppi (policy già esistenti).
-- =====================================================================

alter table public.jobs
  add column if not exists icon_url text check (icon_url is null or (icon_url ~ '^https://' and char_length(icon_url) <= 500));
alter table public.game_groups
  add column if not exists icon_url text check (icon_url is null or (icon_url ~ '^https://' and char_length(icon_url) <= 500));
