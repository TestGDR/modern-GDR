-- =====================================================================
-- SKIN: SFONDO CON L'IMMAGINE
-- user_prefs.skin_image: se vero, le skin che hanno un'immagine di sfondo
-- (per ora la Tramonto: spiaggia al tramonto) la mostrano dietro al gioco;
-- altrimenti resta lo sfondo a tinta unita della skin.
-- =====================================================================
alter table public.user_prefs add column if not exists skin_image boolean not null default false;
