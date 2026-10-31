-- Descrizioni di lavori e gruppi scritte con l'editor (HTML): più spazio
alter table public.jobs drop constraint if exists jobs_description_check;
alter table public.jobs add constraint jobs_description_check check (char_length(description) <= 20000);
alter table public.game_groups drop constraint if exists game_groups_description_check;
alter table public.game_groups add constraint game_groups_description_check check (char_length(description) <= 20000);
