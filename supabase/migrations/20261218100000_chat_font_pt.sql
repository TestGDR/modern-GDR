-- Grandezza del testo della chat in punti (pt) al posto della percentuale
-- (Scheda → Impostazioni). Vale solo per i messaggi della chat.
alter table public.user_prefs
  add column if not exists chat_font_pt int not null default 11 check (chat_font_pt between 9 and 18);

-- chi aveva scelto una percentuale riparte dalla grandezza più vicina
update public.user_prefs
set chat_font_pt = case text_scale when 90 then 10 when 112 then 13 when 125 then 14 when 140 then 16 else 11 end
where text_scale <> 100;
