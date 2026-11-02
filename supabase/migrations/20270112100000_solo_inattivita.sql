-- Niente più durata massima della sessione: si esce solo dopo 2 ore senza
-- nessun gesto sul sito (chat_settings.idle_minutes = 120).
update public.chat_settings set session_hours = 0, idle_minutes = 120;
