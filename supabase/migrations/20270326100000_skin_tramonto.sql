-- =====================================================================
-- SKIN DEL SITO
-- user_prefs.skin: 'classica' (quella di sempre) o 'tramonto' (spiaggia al
-- tramonto con palme e torretta del bagnino, mappa incorniciata di luce).
-- Si sceglie dalla scheda, Modifica · Principale («Scegli skin»).
-- Con la modalità notte vale la grafica della notte.
-- =====================================================================
alter table public.user_prefs add column if not exists skin text not null default 'classica'
  check (skin in ('classica', 'tramonto'));
