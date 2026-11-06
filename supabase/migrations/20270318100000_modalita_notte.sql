-- =====================================================================
-- MODALITÀ NOTTE
-- - user_prefs.theme: 'giorno' (il tramonto di sempre) o 'notte' (blu della
--   notte, luci della città), scelta dalla finestra dei presenti online.
-- - maps.night_image_url: immagine della mappa di notte (link https o
--   immagine del sito /images/…); senza, di notte si vede quella del giorno.
--   La prima mappa riceve /images/mappa-notte.webp.
-- =====================================================================

alter table public.user_prefs add column if not exists theme text not null default 'giorno' check (theme in ('giorno', 'notte'));

alter table public.maps add column if not exists night_image_url text
  check (night_image_url is null or night_image_url ~ '^(https://|/images/)');

update public.maps set night_image_url = '/images/mappa-notte.webp'
where id = (select id from public.maps where image_url is not null order by active desc, sort_order, name limit 1)
  and night_image_url is null;
