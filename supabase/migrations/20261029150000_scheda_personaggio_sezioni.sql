-- =====================================================================
-- 11 · SCHEDA PERSONAGGIO A SEZIONI
-- Nuovi campi per le sezioni della scheda: immagine grande, aspetto,
-- tratti, abilità, "si sa che", affetti, equipaggiamento.
-- Le policy esistenti restano valide: modifica il proprietario o lo staff.
-- =====================================================================

alter table public.characters
  add column if not exists cover_url text check (char_length(cover_url) <= 500),
  add column if not exists appearance text check (char_length(appearance) <= 3000),
  add column if not exists traits text check (char_length(traits) <= 3000),
  add column if not exists skills text check (char_length(skills) <= 3000),
  add column if not exists known_facts text check (char_length(known_facts) <= 3000),
  add column if not exists relationships text check (char_length(relationships) <= 3000),
  add column if not exists equipment text check (char_length(equipment) <= 3000);

-- Le immagini si inseriscono come link e devono essere sicuri (https)
alter table public.characters drop constraint if exists characters_images_https;
alter table public.characters
  add constraint characters_images_https check (
    (avatar_url is null or avatar_url ~ '^https://')
    and (cover_url is null or cover_url ~ '^https://')
  );
