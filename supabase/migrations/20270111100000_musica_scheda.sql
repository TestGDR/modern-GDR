-- Musica della scheda: link a un file audio (mp3), suonato da un piccolo
-- lettore sotto gli stati del personaggio. La scrive il giocatore da
-- "Modifica Principale" (come le immagini, solo link https).
alter table public.characters
  add column if not exists music_url text check (music_url is null or (char_length(music_url) <= 500 and music_url ~ '^https://'));
