-- Niente più "Doppio sport": una sola squadra per personaggio.
-- Chi lo aveva lo perde e riprende i PX spesi; se è già in due sport li tiene,
-- ma non può entrare in altri finché non ne resta uno solo.
update public.creation_options
set active = false, available = false, effects = '[]'::jsonb
where kind = 'vantaggio' and name = 'Doppio sport';

delete from public.character_options co
using public.creation_options o
where o.id = co.option_id and o.kind = 'vantaggio' and o.name = 'Doppio sport';
