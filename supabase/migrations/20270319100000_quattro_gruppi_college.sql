-- =====================================================================
-- GRUPPI COLLEGE: FINO A 4 PER PERSONAGGIO
-- - L'ambito «Gruppi College» (non sportivo, con «college» nel nome)
--   passa a 4 gruppi per personaggio.
-- - Il massimo complessivo max_gruppi sale ad almeno 6 (1 cittadino +
--   4 del college + 1 club o fratellanza), altrimenti bloccherebbe prima.
-- =====================================================================

update public.group_categories set max_per_character = 4
where not for_sport and lower(name) like '%college%';

update public.game_settings set value = '6'::jsonb
where key = 'max_gruppi' and coalesce((value #>> '{}')::int, 0) < 6;

select name as ambito, max_per_character as massimo_per_personaggio from public.group_categories order by sort_order;
