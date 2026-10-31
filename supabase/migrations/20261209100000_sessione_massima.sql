-- =====================================================================
-- DURATA MASSIMA DELLA SESSIONE
-- Oltre all'uscita per inattività (chat_settings.idle_minutes), dopo un
-- certo numero di ore dall'ultimo accesso con nome e password si viene
-- disconnessi comunque: niente personaggi appesi in gioco per giorni.
-- 0 = nessun limite. L'ora d'ingresso la scrive solo il server al login
-- (profiles.session_started_at, il giocatore non la può modificare).
-- =====================================================================

alter table public.chat_settings
  add column if not exists session_hours int not null default 8 check (session_hours between 0 and 72);
grant update (session_hours) on public.chat_settings to authenticated;

alter table public.profiles add column if not exists session_started_at timestamptz;
-- (come last_login_at: non è tra le colonne che il giocatore può modificare)
