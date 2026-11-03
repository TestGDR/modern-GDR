-- =====================================================================
-- IMPOSTAZIONI DELLA CHAT (pulsante «Impostazioni» in chat)
-- Altre preferenze dell'account, solo per la chat: grandezza degli altri
-- messaggi (dadi, sussurri, OFF…) separata da quella delle azioni,
-- carattere e interlinea delle azioni, colore dei nomi, ritratti.
-- Sono in user_prefs (RLS: ognuno legge e scrive solo la propria riga).
-- =====================================================================
alter table public.user_prefs
  add column if not exists chat_other_pt int not null default 10 check (chat_other_pt between 8 and 18),
  add column if not exists chat_font_family text not null default 'normale'
    check (chat_font_family in ('normale', 'libro', 'macchina', 'elegante')),
  add column if not exists chat_line text not null default 'normale' check (chat_line in ('compatta', 'normale', 'ampia')),
  add column if not exists name_color text not null default '#f2b39c' check (name_color ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists chat_avatars text not null default 'grandi' check (chat_avatars in ('grandi', 'piccoli', 'nascosti'));

-- chi aveva già ingrandito la chat: gli altri messaggi un punto sotto le azioni, come prima
update public.user_prefs
set chat_other_pt = case when chat_font_pt >= 18 then 16 else greatest(9, chat_font_pt - 1) end
where chat_font_pt <> 11;
