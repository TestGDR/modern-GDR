-- =====================================================================
-- 10 · IL NOME DEL PERSONAGGIO È IL NOME DI ACCESSO
-- Il nome scelto in registrazione (profiles.username) è il nome del
-- personaggio e si usa per accedere al posto dell'email.
-- =====================================================================

-- Nomi lunghi come quelli dei personaggi (3-40 caratteri)
alter table public.profiles drop constraint if exists profiles_username_check;
alter table public.profiles
  add constraint profiles_username_check check (char_length(username) between 3 and 40);

-- Nessun doppione ignorando maiuscole/minuscole ("Lena Moreno" = "lena moreno")
create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));
create unique index if not exists characters_name_lower_idx on public.characters (lower(name));
