-- =====================================================================
-- DISPONIBILITÀ E MESSAGGIO OFF NEL DATABASE
-- Prima stavano nel browser: sullo stesso PC un account ereditava lo stato
-- di quello di prima, e cambiando PC si perdevano. Ora sono dell'account
-- (user_prefs, che ha già la RLS: ognuno legge e scrive solo la propria riga).
-- =====================================================================

alter table public.user_prefs
  add column if not exists availability text not null default 'disponibile'
    check (availability in ('disponibile', 'cerca', 'occupato')),
  add column if not exists presence_note text not null default ''
    check (char_length(presence_note) <= 80);
