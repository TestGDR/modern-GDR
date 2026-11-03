-- =====================================================================
-- RE O REGINA DELLE FESTE: PRIVILEGIO NARRATIVO UNA VOLTA A SETTIMANA
-- «Usa» nel pannello dei dadi scrive in chat che la festa del personaggio
-- è l'evento di cui parlano tutti; il Master ne tiene conto. Non cambia i
-- tiri (resta una voce di ambientazione allo stesso prezzo).
-- =====================================================================
update public.creation_options
set description = 'Le feste migliori le organizzi tu. Una volta a settimana, con «Usa» nel pannello dei dadi, dichiari in chat che la tua festa è l''evento di cui parla tutto il campus: chi conta ci vuole essere, se ne parla per giorni e il Master ne tiene conto (inviti, ospiti, pettegolezzi). Non cambia i tiri.',
    effects = '[{"type":"narrative_privilege","holder":"player","uses_per":"period"}]'::jsonb
where name = 'Re o regina delle feste';
