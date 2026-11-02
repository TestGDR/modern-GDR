-- Chat: lunghezza massima di un messaggio 1.500 caratteri (era 1.200).
-- Si può cambiare in ogni momento da Gestione → Chat.
update public.chat_settings set max_length = 1500;
alter table public.chat_settings alter column max_length set default 1500;
