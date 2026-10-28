-- =====================================================================
-- 12 · SISTEMA INTERLOCK, LIVELLI UTENTE E PERMESSI
-- Blocco 1 (base dati) del documento "GDR College – Sistema Interlock".
--
-- - Livelli utente (Amministratore, Master, Moderatore, Giocatore, Ospite)
--   con rango e permessi spuntabili: sostituiscono i vecchi ruoli.
--   Tutte le policy che usavano is_staff() ora usano permessi specifici.
-- - Impostazioni del sistema (punti, età, PX, massimali…) modificabili.
-- - Caratteristiche (5) e abilità (46) come dati iniziali modificabili.
-- - Elenchi della scheda (indirizzi di studio, anni di corso, squadre e club).
-- - Vantaggi, svantaggi, tratti e tenore di vita.
-- - Valori dei personaggi (caratteristiche, abilità, scelte) e stato della scheda.
-- - Registro delle azioni del pannello.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LIVELLI UTENTE
-- ---------------------------------------------------------------------

create table public.user_levels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 40),
  description text not null default '' check (char_length(description) <= 300),
  -- colore del badge (facoltativo): se presente, il livello si vede accanto al nome
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  -- rango: non si gestiscono livelli o utenti di rango uguale o superiore al proprio
  rank int not null check (rank between 0 and 1000),
  -- chiavi dei permessi spuntati (il registro è nel codice: src/lib/permissions.ts)
  permissions text[] not null default '{}',
  -- livello Amministratore: ha sempre tutti i permessi, non si elimina
  is_admin boolean not null default false,
  -- numero massimo di personaggi attivi
  max_characters int not null default 1 check (max_characters between 0 and 20),
  created_at timestamptz not null default now()
);

create unique index user_levels_one_admin_idx on public.user_levels (is_admin) where is_admin;

insert into public.user_levels (name, description, color, rank, is_admin, permissions) values
  ('Amministratore', 'Gestisce tutto il sito. Ha sempre tutti i permessi.', '#ff6b7d', 1000, true, '{}'),
  ('Master', 'Conduce le giocate, approva le schede e assegna i PX.', '#ffb08a', 80, false, array[
    'admin.accedere', 'log.vedere',
    'personaggi.creare', 'personaggi.modificare_propri', 'personaggi.vedere_tutti', 'personaggi.modificare_tutti',
    'personaggi.approvare', 'personaggi.assegnare_px',
    'chat.scrivere', 'dadi.tirare', 'dadi.nascosti', 'luoghi.gestire', 'scene.gestire',
    'messaggi.modificare_propri', 'messaggi.modificare_altrui',
    'quest.gestire', 'quest.ricompense',
    'segnalazioni.gestire',
    'elenchi.gestire', 'annunci.pubblicare', 'contenuti.moderare'
  ]),
  ('Moderatore', 'Modera chat, forum e social e gestisce le segnalazioni.', '#8fe3d1', 60, false, array[
    'admin.accedere',
    'personaggi.creare', 'personaggi.modificare_propri', 'personaggi.vedere_tutti',
    'chat.scrivere', 'dadi.tirare', 'messaggi.modificare_propri', 'messaggi.modificare_altrui',
    'utenti.silenziare', 'segnalazioni.gestire', 'contenuti.moderare'
  ]),
  ('Giocatore', 'Gioca con il proprio personaggio.', null, 20, false, array[
    'personaggi.creare', 'personaggi.modificare_propri', 'chat.scrivere', 'dadi.tirare', 'messaggi.modificare_propri'
  ]),
  ('Ospite', 'Può leggere ma non giocare.', null, 10, false, '{}');

-- Ogni utente ha un livello. I vecchi ruoli diventano livelli.
alter table public.profiles add column level_id uuid references public.user_levels (id) on delete restrict;

update public.profiles p
set level_id = l.id
from public.user_levels l
where l.name = case p.role::text
  when 'admin' then 'Amministratore'
  when 'master' then 'Master'
  else 'Giocatore'
end;

alter table public.profiles alter column level_id set not null;
create index profiles_level_id_idx on public.profiles (level_id);

alter table public.user_levels enable row level security;

-- ---------------------------------------------------------------------
-- 2. FUNZIONI DEI PERMESSI
-- ---------------------------------------------------------------------

-- L'utente corrente ha questo permesso? (l'Amministratore li ha tutti)
create or replace function public.has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.user_levels l on l.id = p.level_id
    where p.id = (select auth.uid())
      and (l.is_admin or perm = any (l.permissions))
  );
$$;

-- Rango del livello dell'utente corrente (0 se non collegato)
create or replace function public.my_rank()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select l.rank from public.profiles p join public.user_levels l on l.id = p.level_id
    where p.id = (select auth.uid())
  ), 0);
$$;

-- L'utente corrente è Amministratore?
create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p join public.user_levels l on l.id = p.level_id
    where p.id = (select auth.uid()) and l.is_admin
  );
$$;

-- Compatibilità: "staff" = chi può accedere al pannello admin
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission('admin.accedere');
$$;

-- ---------------------------------------------------------------------
-- 3. LE POLICY ESISTENTI PASSANO AI PERMESSI SPECIFICI
-- ---------------------------------------------------------------------

-- Quartieri e luoghi: "Creare e modificare i luoghi"
alter policy "Quartieri: lo staff li crea" on public.districts with check ((select public.has_permission('luoghi.gestire')));
alter policy "Quartieri: lo staff li modifica" on public.districts
  using ((select public.has_permission('luoghi.gestire'))) with check ((select public.has_permission('luoghi.gestire')));
alter policy "Quartieri: lo staff li elimina" on public.districts using ((select public.has_permission('luoghi.gestire')));
alter policy "Luoghi: lo staff li crea" on public.places with check ((select public.has_permission('luoghi.gestire')));
alter policy "Luoghi: lo staff li modifica" on public.places
  using ((select public.has_permission('luoghi.gestire'))) with check ((select public.has_permission('luoghi.gestire')));
alter policy "Luoghi: lo staff li elimina" on public.places using ((select public.has_permission('luoghi.gestire')));

-- Personaggi
alter policy "Personaggi: ognuno crea il proprio" on public.characters
  with check (owner_id = (select auth.uid()) and (select public.has_permission('personaggi.creare')));
alter policy "Personaggi: modifica del proprietario o dello staff" on public.characters
  using (
    (owner_id = (select auth.uid()) and (select public.has_permission('personaggi.modificare_propri')))
    or (select public.has_permission('personaggi.modificare_tutti'))
  )
  with check (
    (owner_id = (select auth.uid()) and (select public.has_permission('personaggi.modificare_propri')))
    or (select public.has_permission('personaggi.modificare_tutti'))
  );
alter policy "Personaggi: eliminazione del proprietario o dello staff" on public.characters
  using ((select public.has_permission('personaggi.eliminare')));

-- Chat di gioco
alter policy "Chat: si scrive col proprio personaggio nei luoghi aperti" on public.chat_messages
  with check (
    author_id = (select auth.uid())
    and (select public.has_permission('chat.scrivere'))
    and public.owns_character(character_id)
    and exists (select 1 from public.places p where p.id = place_id and p.is_open)
  );
alter policy "Chat: eliminazione dell'autore o dello staff" on public.chat_messages
  using (
    (author_id = (select auth.uid()) and (select public.has_permission('messaggi.modificare_propri')))
    or (select public.has_permission('messaggi.modificare_altrui'))
  );

-- Forum: struttura e moderazione = "contenuti.moderare", bacheche riservate = "annunci.pubblicare"
alter policy "Forum sezioni: lo staff le crea" on public.forum_sections with check ((select public.has_permission('contenuti.moderare')));
alter policy "Forum sezioni: lo staff le modifica" on public.forum_sections
  using ((select public.has_permission('contenuti.moderare'))) with check ((select public.has_permission('contenuti.moderare')));
alter policy "Forum sezioni: lo staff le elimina" on public.forum_sections using ((select public.has_permission('contenuti.moderare')));
alter policy "Forum bacheche: lo staff le crea" on public.forum_boards with check ((select public.has_permission('contenuti.moderare')));
alter policy "Forum bacheche: lo staff le modifica" on public.forum_boards
  using ((select public.has_permission('contenuti.moderare'))) with check ((select public.has_permission('contenuti.moderare')));
alter policy "Forum bacheche: lo staff le elimina" on public.forum_boards using ((select public.has_permission('contenuti.moderare')));
alter policy "Forum discussioni: gli utenti registrati le aprono" on public.forum_threads
  with check (
    author_id = (select auth.uid())
    and (character_id is null or public.owns_character(character_id))
    and (
      (select public.has_permission('annunci.pubblicare'))
      or not exists (select 1 from public.forum_boards b where b.id = board_id and b.staff_only)
    )
  );
alter policy "Forum discussioni: modifica dell'autore o dello staff" on public.forum_threads
  using (author_id = (select auth.uid()) or (select public.has_permission('contenuti.moderare')))
  with check (author_id = (select auth.uid()) or (select public.has_permission('contenuti.moderare')));
alter policy "Forum discussioni: lo staff le elimina" on public.forum_threads
  using ((select public.has_permission('contenuti.moderare')));
alter policy "Forum messaggi: si risponde nelle discussioni aperte" on public.forum_posts
  with check (
    author_id = (select auth.uid())
    and (character_id is null or public.owns_character(character_id))
    and (
      (select public.has_permission('contenuti.moderare'))
      or exists (select 1 from public.forum_threads t where t.id = thread_id and not t.is_locked)
    )
  );
alter policy "Forum messaggi: modifica dell'autore o dello staff" on public.forum_posts
  using (author_id = (select auth.uid()) or (select public.has_permission('contenuti.moderare')))
  with check (author_id = (select auth.uid()) or (select public.has_permission('contenuti.moderare')));
alter policy "Forum messaggi: eliminazione dell'autore o dello staff" on public.forum_posts
  using (author_id = (select auth.uid()) or (select public.has_permission('contenuti.moderare')));

-- Social
alter policy "Social post: eliminazione dell'autore o dello staff" on public.social_posts
  using (author_id = (select auth.uid()) or (select public.has_permission('contenuti.moderare')));
alter policy "Social commenti: eliminazione dell'autore o dello staff" on public.social_comments
  using (author_id = (select auth.uid()) or (select public.has_permission('contenuti.moderare')));

-- Notizie: "Pubblicare annunci e novità"
alter policy "Notizie: lo staff le pubblica" on public.city_news with check ((select public.has_permission('annunci.pubblicare')));
alter policy "Notizie: lo staff le modifica" on public.city_news
  using ((select public.has_permission('annunci.pubblicare'))) with check ((select public.has_permission('annunci.pubblicare')));
alter policy "Notizie: lo staff le elimina" on public.city_news using ((select public.has_permission('annunci.pubblicare')));

-- Trigger che usavano is_staff()
create or replace function public.protect_character_stats()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.has_permission('personaggi.modificare_caratteristiche') and (
    new.physique is distinct from old.physique
    or new.cunning is distinct from old.cunning
    or new.charisma is distinct from old.charisma
    or new.driving is distinct from old.driving
  ) then
    raise exception 'Le caratteristiche possono essere modificate solo da chi ha il permesso';
  end if;
  return new;
end;
$$;

create or replace function public.protect_thread_flags()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.has_permission('contenuti.moderare') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_pinned = false;
    new.is_locked = false;
  elsif new.is_pinned is distinct from old.is_pinned
     or new.is_locked is distinct from old.is_locked then
    raise exception 'Solo lo staff può fissare o chiudere una discussione';
  end if;
  return new;
end;
$$;

-- I vecchi ruoli non servono più
alter table public.profiles drop column role;
drop type public.user_role;

-- ---------------------------------------------------------------------
-- 4. IMPOSTAZIONI DEL SISTEMA
-- ---------------------------------------------------------------------

create table public.game_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  value jsonb not null,
  -- come mostrarla nel pannello: numero, elenco di numeri, livello
  kind text not null check (kind in ('number', 'numbers', 'level')),
  label text not null,
  description text not null default '',
  sort_order int not null default 0
);

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('caratteristica_min', '1', 'number', 'Valore minimo di una caratteristica', 'Scala delle caratteristiche: minimo.', 1),
  ('caratteristica_max', '10', 'number', 'Valore massimo di una caratteristica', 'Scala delle caratteristiche: massimo.', 2),
  ('caratteristica_min_creazione', '2', 'number', 'Minimo alla creazione', 'Nessuna caratteristica sotto questo valore alla creazione.', 3),
  ('punti_caratteristiche', '36', 'number', 'Punti caratteristica alla creazione', 'Da spendere tutti nel passaggio Caratteristiche.', 4),
  ('massimali_creazione', '[10, 9, 8, 8, 7]', 'numbers', 'Massimali alla creazione', 'Valori massimi consentiti, dal più alto al più basso (es. un solo 10, un solo 9…).', 5),
  ('eta_min', '18', 'number', 'Età minima dei personaggi', 'Studenti di college.', 6),
  ('eta_max', '25', 'number', 'Età massima dei personaggi', 'Fino alla laurea magistrale.', 7),
  ('anno_di_gioco', '2026', 'number', 'Anno di gioco corrente', 'Serve a calcolare l''anno di nascita dall''età.', 8),
  ('px_iniziali', '1060', 'number', 'PX iniziali', 'Budget di PX alla creazione, da spendere sulle abilità.', 9),
  ('abilita_max', '10', 'number', 'Massimo assoluto delle abilità', 'Un''abilità non supera mai questo valore né la caratteristica collegata.', 10),
  ('costo_px_livello', '10', 'number', 'Costo PX per livello', 'Salire al livello N costa questo valore × N (da 0 a 1 = 10, da 1 a 2 = 20…).', 11),
  ('tetto_modificatori', '3', 'number', 'Tetto di vantaggi e svantaggi', 'Massimo ± sul totale dei modificatori di un tiro.', 12),
  ('livello_predefinito', to_jsonb((select id::text from public.user_levels where name = 'Giocatore')), 'level',
   'Livello dei nuovi iscritti', 'Il livello assegnato a chi si registra.', 13);

alter table public.game_settings enable row level security;
revoke all on public.game_settings from anon, authenticated;
grant select on public.game_settings to authenticated;
grant update (value) on public.game_settings to authenticated;

create policy "Impostazioni: lettura per utenti registrati"
  on public.game_settings for select to authenticated using (true);
create policy "Impostazioni: modifica con permesso"
  on public.game_settings for update to authenticated
  using ((select public.has_permission('impostazioni.gestire')))
  with check ((select public.has_permission('impostazioni.gestire')));

-- Lettura comoda di un'impostazione numerica
create or replace function public.setting_int(p_key text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select (value #>> '{}')::int from public.game_settings where key = p_key;
$$;

-- ---------------------------------------------------------------------
-- 5. CARATTERISTICHE E ABILITÀ
-- ---------------------------------------------------------------------

create table public.attributes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9]{1,5}$'),
  name text not null unique check (char_length(name) between 2 and 40),
  description text not null default '' check (char_length(description) <= 500),
  sort_order int not null default 0,
  active boolean not null default true
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  attribute_id uuid not null references public.attributes (id) on delete restrict,
  name text not null unique check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 500),
  category text check (category in ('Studio', 'Sport', 'Arti', 'Sociale', 'Pratico')),
  sort_order int not null default 0,
  active boolean not null default true
);

create index skills_attribute_id_idx on public.skills (attribute_id);

insert into public.attributes (code, name, description, sort_order) values
  ('INT', 'Intelletto', 'Studio, logica, memoria, cultura, attenzione. Esami, ricerca, laboratorio, informatica, notare dettagli.', 1),
  ('RIF', 'Riflessi', 'Coordinazione, destrezza, velocità di reazione, precisione. Sport con la palla, danza, guida, strumenti musicali, schivare.', 2),
  ('VIG', 'Vigore', 'Forza, resistenza, salute, fiato. Atletica, football, nuoto, resistere a fatica, alcol e malattie.', 3),
  ('EMP', 'Empatia', 'Sensibilità, intuito, creatività, controllo emotivo. Leggere le persone, recitare, dipingere, gestire lo stress.', 4),
  ('PRE', 'Presenza', 'Carisma, leadership, fascino, autorità. Dibattere, guidare un club, feste, farsi rispettare.', 5);

insert into public.skills (attribute_id, name, description, category, sort_order)
select a.id, v.name, v.description, v.category, v.sort_order
from (values
  -- INT – Intelletto
  ('INT', 'Scienze naturali', 'Biologia, chimica, fisica, geologia, laboratorio', 'Studio', 1),
  ('INT', 'Matematica e statistica', 'Calcolo, analisi dei dati, logica formale', 'Studio', 2),
  ('INT', 'Informatica e tecnologia', 'Programmazione, reti, sicurezza informatica, riparare dispositivi', 'Studio', 3),
  ('INT', 'Lettere e filosofia', 'Storia, letteratura, filosofia, storia dell''arte', 'Studio', 4),
  ('INT', 'Scienze sociali ed economia', 'Psicologia, sociologia, economia, gestione del denaro', 'Studio', 5),
  ('INT', 'Diritto e politica', 'Leggi, regolamenti del campus, politica studentesca', 'Studio', 6),
  ('INT', 'Medicina e primo soccorso', 'Anatomia, cure di base, riconoscere sintomi', 'Studio', 7),
  ('INT', 'Lingue straniere', 'Parlare, scrivere e tradurre in altre lingue', 'Studio', 8),
  ('INT', 'Scrittura e giornalismo', 'Saggi, articoli, giornale del college, scrittura creativa', 'Studio', 9),
  ('INT', 'Studio e ricerca', 'Preparare esami, biblioteca, trovare fonti, tesi', 'Studio', 10),
  ('INT', 'Osservazione e indagine', 'Notare dettagli, ricostruire fatti, scoprire segreti', 'Pratico', 11),
  -- RIF – Riflessi
  ('RIF', 'Sport di squadra', 'Tecnica e tattica con la palla: basket, baseball, pallavolo, calcio, lacrosse', 'Sport', 1),
  ('RIF', 'Mira e precisione', 'Tiro con l''arco, tiro a segno, freccette, biliardo, lanci', 'Sport', 2),
  ('RIF', 'Autodifesa e arti marziali', 'Boxe, judo, difesa personale, risse', 'Sport', 3),
  ('RIF', 'Schivare', 'Evitare colpi e ostacoli, reagire d''istinto', 'Pratico', 4),
  ('RIF', 'Guida', 'Auto, moto, bicicletta', 'Pratico', 5),
  ('RIF', 'Furtività', 'Muoversi senza farsi notare, uscire dopo il coprifuoco', 'Pratico', 6),
  ('RIF', 'Danza', 'Danza, coreografia, ballo di coppia', 'Arti', 7),
  ('RIF', 'Strumenti musicali', 'Suonare e accordare strumenti, mixare come DJ', 'Arti', 8),
  ('RIF', 'Meccanica e fai da te', 'Riparare, costruire, allestire scenografie', 'Pratico', 9),
  ('RIF', 'Videogiochi e e-sport', 'Gaming competitivo, tornei, streaming', 'Sport', 10),
  -- VIG – Vigore
  ('VIG', 'Atletica', 'Corsa, scatti, salti, lanci', 'Sport', 1),
  ('VIG', 'Nuoto e sport acquatici', 'Nuoto, tuffi, canottaggio, pallanuoto', 'Sport', 2),
  ('VIG', 'Forza', 'Sollevamento pesi, spingere, trasportare, bloccare', 'Sport', 3),
  ('VIG', 'Sport di contatto', 'Football americano, rugby, hockey, lotta: scontro fisico e placcaggi', 'Sport', 4),
  ('VIG', 'Ginnastica e acrobazie', 'Ginnastica, cheerleading, parkour, equilibrio', 'Sport', 5),
  ('VIG', 'Equitazione', 'Cavalli e squadra equestre del college', 'Sport', 6),
  ('VIG', 'Outdoor e sopravvivenza', 'Escursionismo, arrampicata, campeggio, sci, orientamento', 'Sport', 7),
  ('VIG', 'Resistenza fisica', 'Fatica, notti in bianco, dolore, malattie, alcol, caldo e freddo', 'Pratico', 8),
  -- EMP – Empatia
  ('EMP', 'Leggere le persone', 'Capire emozioni, intenzioni e bugie altrui', 'Sociale', 1),
  ('EMP', 'Ascolto e supporto', 'Consolare, mediare, aiutare chi sta male', 'Sociale', 2),
  ('EMP', 'Inganno e bluff', 'Mentire, ingannare, bluffare a poker', 'Sociale', 3),
  ('EMP', 'Autocontrollo', 'Stress, ansia da esame, rabbia, panico, tentazioni', 'Pratico', 4),
  ('EMP', 'Recitazione', 'Teatro, musical, improvvisazione, interpretare un ruolo', 'Arti', 5),
  ('EMP', 'Canto', 'Canto solista, coro, musical', 'Arti', 6),
  ('EMP', 'Arti visive', 'Disegno, pittura, scultura, design, scenografia', 'Arti', 7),
  ('EMP', 'Fotografia e video', 'Foto, cortometraggi, montaggio, contenuti social', 'Arti', 8),
  ('EMP', 'Cucina', 'Cucinare, pasticceria, organizzare cene', 'Pratico', 9),
  -- PRE – Presenza
  ('PRE', 'Persuasione e dibattito', 'Convincere, negoziare, debate team', 'Sociale', 1),
  ('PRE', 'Oratoria', 'Parlare in pubblico, discorsi, presentazioni', 'Sociale', 2),
  ('PRE', 'Leadership', 'Guidare squadre, club e confraternite, organizzare eventi', 'Sociale', 3),
  ('PRE', 'Seduzione e fascino', 'Flirtare, conquistare simpatia', 'Sociale', 4),
  ('PRE', 'Intimidazione', 'Mettere soggezione, minacciare, farsi rispettare', 'Sociale', 5),
  ('PRE', 'Stile e immagine', 'Moda, cura di sé, social media, reputazione', 'Sociale', 6),
  ('PRE', 'Vita sociale', 'Fare conoscenze, feste, contatti utili, networking', 'Sociale', 7),
  ('PRE', 'Intrattenere', 'Comicità, animare una festa, presentare eventi', 'Arti', 8)
) as v (code, name, description, category, sort_order)
join public.attributes a on a.code = v.code;

alter table public.attributes enable row level security;
alter table public.skills enable row level security;

create policy "Caratteristiche: lettura per utenti registrati" on public.attributes for select to authenticated using (true);
create policy "Caratteristiche: gestione con permesso" on public.attributes for all to authenticated
  using ((select public.has_permission('regole.gestire'))) with check ((select public.has_permission('regole.gestire')));
create policy "Abilità: lettura per utenti registrati" on public.skills for select to authenticated using (true);
create policy "Abilità: gestione con permesso" on public.skills for all to authenticated
  using ((select public.has_permission('regole.gestire'))) with check ((select public.has_permission('regole.gestire')));

revoke all on public.attributes, public.skills from anon;

-- ---------------------------------------------------------------------
-- 6. ELENCHI DELLA SCHEDA E OPZIONI DI CREAZIONE
-- ---------------------------------------------------------------------

-- Indirizzi di studio, anni di corso, squadre e club (solo descrittivi)
create table public.sheet_options (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('indirizzo', 'anno', 'club')),
  name text not null check (char_length(name) between 2 and 60),
  sort_order int not null default 0,
  active boolean not null default true,
  unique (kind, name)
);

insert into public.sheet_options (kind, name, sort_order) values
  ('anno', 'Freshman (1° anno)', 1), ('anno', 'Sophomore (2° anno)', 2), ('anno', 'Junior (3° anno)', 3),
  ('anno', 'Senior (4° anno)', 4), ('anno', 'Graduate (magistrale)', 5),
  ('indirizzo', 'Biologia', 1), ('indirizzo', 'Economia', 2), ('indirizzo', 'Giurisprudenza', 3),
  ('indirizzo', 'Informatica', 4), ('indirizzo', 'Ingegneria', 5), ('indirizzo', 'Lettere', 6),
  ('indirizzo', 'Medicina', 7), ('indirizzo', 'Psicologia', 8), ('indirizzo', 'Scienze politiche', 9),
  ('indirizzo', 'Giornalismo', 10), ('indirizzo', 'Arti visive', 11), ('indirizzo', 'Teatro e musica', 12),
  ('club', 'Squadra di football', 1), ('club', 'Squadra di basket', 2), ('club', 'Squadra di nuoto', 3),
  ('club', 'Cheerleading', 4), ('club', 'Compagnia teatrale', 5), ('club', 'Coro', 6),
  ('club', 'Giornale del college', 7), ('club', 'Debate team', 8), ('club', 'Club di fotografia', 9),
  ('club', 'Confraternita', 10), ('club', 'Sorellanza', 11);

-- Vantaggi, svantaggi, tratti e tenore di vita (costi in PX)
create table public.creation_options (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('vantaggio', 'svantaggio', 'tratto', 'tenore')),
  name text not null check (char_length(name) between 2 and 60),
  -- positivo se costa PX, negativo se ne dà
  cost_px int not null default 0 check (cost_px between -1000 and 1000),
  description text not null default '' check (char_length(description) <= 500),
  -- effetto sui tiri (facoltativo), nel rispetto del tetto dei modificatori
  roll_modifier smallint check (roll_modifier between -3 and 3),
  roll_skill_id uuid references public.skills (id) on delete set null,
  -- voci che non si possono scegliere insieme a questa
  incompatible_ids uuid[] not null default '{}',
  sort_order int not null default 0,
  active boolean not null default true,
  unique (kind, name)
);

insert into public.creation_options (kind, name, cost_px, description, sort_order) values
  ('tenore', 'Squattrinato', -60, 'Lavori part-time, debiti e conti da far quadrare.', 1),
  ('tenore', 'Borsa di studio', 0, 'Studi grazie a una borsa: niente lussi, ma nessun debito.', 2),
  ('tenore', 'Benestante', 60, 'Famiglia agiata, auto e appartamento fuori dal campus.', 3),
  ('tenore', 'Ricco', 150, 'Soldi di famiglia, contatti importanti e tutto ciò che si può comprare.', 4),
  ('vantaggio', 'Memoria fotografica', 80, 'Ricordi ciò che leggi e vedi con grande precisione.', 1),
  ('vantaggio', 'Atleta nato', 80, 'Fisico allenato e talento naturale per lo sport.', 2),
  ('vantaggio', 'Bell''aspetto', 60, 'Attiri gli sguardi ovunque vai.', 3),
  ('vantaggio', 'Contatti', 60, 'Conosci le persone giuste dentro e fuori dal campus.', 4),
  ('svantaggio', 'Insonnia', -40, 'Dormi poco e male: la stanchezza si fa sentire.', 1),
  ('svantaggio', 'Timidezza', -40, 'Parlare con gli sconosciuti ti mette in difficoltà.', 2),
  ('svantaggio', 'Debiti', -60, 'Devi soldi a qualcuno, e prima o poi verrà a riscuotere.', 3),
  ('svantaggio', 'Allergia', -30, 'Un''allergia seria ti obbliga a stare attento.', 4),
  ('tratto', 'Ambizioso', 10, 'Vuoi arrivare in alto, a ogni costo.', 1),
  ('tratto', 'Leale', 10, 'Non tradisci mai chi ti è vicino.', 2),
  ('tratto', 'Ribelle', 10, 'Le regole sono fatte per essere infrante.', 3),
  ('tratto', 'Romantico', 10, 'Credi nei grandi amori e nei gesti plateali.', 4);

-- Esempio di incompatibilità: "Ricco" (tenore) e "Debiti" (svantaggio) non si scelgono insieme
update public.creation_options set incompatible_ids = array[(select id from public.creation_options where name = 'Debiti')]
where name = 'Ricco';
update public.creation_options set incompatible_ids = array[(select id from public.creation_options where name = 'Ricco')]
where name = 'Debiti';

alter table public.sheet_options enable row level security;
alter table public.creation_options enable row level security;

create policy "Elenchi scheda: lettura per utenti registrati" on public.sheet_options for select to authenticated using (true);
create policy "Elenchi scheda: gestione con permesso" on public.sheet_options for all to authenticated
  using ((select public.has_permission('elenchi.gestire'))) with check ((select public.has_permission('elenchi.gestire')));
create policy "Opzioni creazione: lettura per utenti registrati" on public.creation_options for select to authenticated using (true);
create policy "Opzioni creazione: gestione con permesso" on public.creation_options for all to authenticated
  using ((select public.has_permission('regole.gestire'))) with check ((select public.has_permission('regole.gestire')));

revoke all on public.sheet_options, public.creation_options from anon;

-- ---------------------------------------------------------------------
-- 7. VALORI DEI PERSONAGGI E STATO DELLA SCHEDA
-- ---------------------------------------------------------------------

alter table public.characters
  add column status text not null default 'bozza' check (status in ('bozza', 'in_attesa', 'approvata', 'rifiutata')),
  add column rejection_reason text check (char_length(rejection_reason) <= 1000),
  -- PX non spesi
  add column px int not null default 0 check (px >= 0);

-- I personaggi già esistenti restano attivi
update public.characters set status = 'approvata';

-- Chi può vedere una scheda: approvata, propria, oppure con permesso
create or replace function public.can_see_character(p_character_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.characters c
    where c.id = p_character_id
      and (c.status = 'approvata' or c.owner_id = (select auth.uid()) or public.has_permission('personaggi.vedere_tutti'))
  );
$$;

-- Il proprietario può modificare i valori finché la scheda non è approvata
create or replace function public.can_edit_character_build(p_character_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.characters c
    where c.id = p_character_id
      and (
        (c.owner_id = (select auth.uid()) and c.status in ('bozza', 'rifiutata'))
        or public.has_permission('personaggi.modificare_caratteristiche')
      )
  );
$$;

alter policy "Personaggi: lettura per utenti registrati" on public.characters
  using (status = 'approvata' or owner_id = (select auth.uid()) or (select public.has_permission('personaggi.vedere_tutti')));

-- Una scheda approvata non cambia stato da sola: approva/rifiuta solo chi ha il permesso
create or replace function public.protect_character_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- SQL Editor o chiave segreta (nessun utente collegato): contesto fidato, nessun controllo
  if (select auth.uid()) is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if public.has_permission('personaggi.approvare') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status = 'bozza';
    new.rejection_reason = null;
    new.px = 0;
    return new;
  end if;
  -- Il giocatore può solo inviare la bozza (o la scheda rifiutata) in approvazione
  if new.status is distinct from old.status
     and not (old.status in ('bozza', 'rifiutata') and new.status = 'in_attesa') then
    raise exception 'Lo stato della scheda lo cambia solo chi può approvare';
  end if;
  if new.rejection_reason is distinct from old.rejection_reason then
    raise exception 'Il motivo del rifiuto lo scrive chi approva';
  end if;
  if new.px is distinct from old.px and not public.has_permission('personaggi.assegnare_px') then
    raise exception 'I PX li assegna il Master';
  end if;
  return new;
end;
$$;

create trigger characters_protect_status
  before insert or update on public.characters
  for each row execute function public.protect_character_status();

-- Limite di personaggi per livello
create or replace function public.check_character_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
  v_count int;
begin
  select l.max_characters into v_max
  from public.profiles p join public.user_levels l on l.id = p.level_id
  where p.id = new.owner_id;
  select count(*) into v_count from public.characters where owner_id = new.owner_id and status <> 'rifiutata';
  if v_count >= coalesce(v_max, 0) then
    raise exception 'Hai raggiunto il numero massimo di personaggi per il tuo livello';
  end if;
  return new;
end;
$$;

create trigger characters_check_limit
  before insert on public.characters
  for each row execute function public.check_character_limit();

create table public.character_attributes (
  character_id uuid not null references public.characters (id) on delete cascade,
  attribute_id uuid not null references public.attributes (id) on delete restrict,
  value smallint not null check (value between 1 and 10),
  primary key (character_id, attribute_id)
);

create table public.character_skills (
  character_id uuid not null references public.characters (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete restrict,
  level smallint not null check (level between 0 and 10),
  primary key (character_id, skill_id)
);

create table public.character_options (
  character_id uuid not null references public.characters (id) on delete cascade,
  option_id uuid not null references public.creation_options (id) on delete restrict,
  primary key (character_id, option_id)
);

create index character_attributes_attribute_idx on public.character_attributes (attribute_id);
create index character_skills_skill_idx on public.character_skills (skill_id);
create index character_options_option_idx on public.character_options (option_id);

alter table public.character_attributes enable row level security;
alter table public.character_skills enable row level security;
alter table public.character_options enable row level security;

revoke all on public.character_attributes, public.character_skills, public.character_options from anon;

create policy "Valori caratteristiche: lettura" on public.character_attributes for select to authenticated
  using (public.can_see_character(character_id));
create policy "Valori caratteristiche: modifica" on public.character_attributes for all to authenticated
  using (public.can_edit_character_build(character_id)) with check (public.can_edit_character_build(character_id));
create policy "Livelli abilità: lettura" on public.character_skills for select to authenticated
  using (public.can_see_character(character_id));
create policy "Livelli abilità: modifica" on public.character_skills for all to authenticated
  using (public.can_edit_character_build(character_id)) with check (public.can_edit_character_build(character_id));
create policy "Scelte di creazione: lettura" on public.character_options for select to authenticated
  using (public.can_see_character(character_id));
create policy "Scelte di creazione: modifica" on public.character_options for all to authenticated
  using (public.can_edit_character_build(character_id)) with check (public.can_edit_character_build(character_id));

-- Un'abilità non supera mai la caratteristica collegata né il massimo assoluto
create or replace function public.check_skill_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attr int;
begin
  if new.level > coalesce(public.setting_int('abilita_max'), 10) then
    raise exception 'Il livello supera il massimo assoluto delle abilità';
  end if;
  select ca.value into v_attr
  from public.skills s
  join public.character_attributes ca on ca.attribute_id = s.attribute_id and ca.character_id = new.character_id
  where s.id = new.skill_id;
  if new.level > coalesce(v_attr, 0) then
    raise exception 'Un''abilità non può superare il valore della caratteristica collegata';
  end if;
  return new;
end;
$$;

create trigger character_skills_check_level
  before insert or update on public.character_skills
  for each row execute function public.check_skill_level();

-- Caratteristiche e abilità in uso non si eliminano: si disattivano
create or replace function public.protect_rules_in_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'attributes' and (
    exists (select 1 from public.skills where attribute_id = old.id)
    or exists (select 1 from public.character_attributes where attribute_id = old.id)
  ) then
    raise exception 'Questa caratteristica è in uso: non si elimina, si disattiva.';
  end if;
  if tg_table_name = 'skills' and exists (select 1 from public.character_skills where skill_id = old.id) then
    raise exception 'Questa abilità è posseduta da qualche personaggio: non si elimina, si disattiva.';
  end if;
  return old;
end;
$$;

create trigger attributes_protect_in_use before delete on public.attributes
  for each row execute function public.protect_rules_in_use();
create trigger skills_protect_in_use before delete on public.skills
  for each row execute function public.protect_rules_in_use();

-- ---------------------------------------------------------------------
-- 8. PROTEZIONI DEI LIVELLI
-- ---------------------------------------------------------------------

-- Creare e modificare livelli: con permesso, solo sotto il proprio rango,
-- e senza concedere permessi che non si hanno
create or replace function public.protect_user_levels()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mine text[];
begin
  -- SQL Editor o chiave segreta (nessun utente collegato): contesto fidato, nessun controllo
  if (select auth.uid()) is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    -- consentito solo dentro delete_level(), che sposta prima gli utenti
    if current_setting('app.eliminazione_livello', true) = 'on' then
      return old;
    end if;
    raise exception 'I livelli si eliminano dal pannello, scegliendo dove spostare gli utenti';
  end if;
  if tg_op = 'UPDATE' and old.is_admin then
    raise exception 'Il livello Amministratore non si modifica';
  end if;
  if new.is_admin then
    raise exception 'Esiste un solo livello Amministratore';
  end if;
  if public.is_admin_user() then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.rank >= public.my_rank() then
    raise exception 'Non puoi modificare un livello di rango uguale o superiore al tuo';
  end if;
  if new.rank >= public.my_rank() then
    raise exception 'Il rango deve essere inferiore al tuo';
  end if;
  select l.permissions into v_mine from public.profiles p join public.user_levels l on l.id = p.level_id
  where p.id = (select auth.uid());
  if not (new.permissions <@ coalesce(v_mine, '{}')) then
    raise exception 'Non puoi concedere permessi che non hai';
  end if;
  return new;
end;
$$;

create trigger user_levels_protect
  before insert or update or delete on public.user_levels
  for each row execute function public.protect_user_levels();

grant select, insert, update on public.user_levels to authenticated;
revoke all on public.user_levels from anon;

create policy "Livelli: lettura per utenti registrati" on public.user_levels for select to authenticated using (true);
create policy "Livelli: creazione con permesso" on public.user_levels for insert to authenticated
  with check ((select public.has_permission('livelli.gestire')));
create policy "Livelli: modifica con permesso" on public.user_levels for update to authenticated
  using ((select public.has_permission('livelli.gestire'))) with check ((select public.has_permission('livelli.gestire')));

-- Deve restare almeno un amministratore
create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.user_levels where id = old.level_id and is_admin)
     and (tg_op = 'DELETE' or not exists (select 1 from public.user_levels where id = new.level_id and is_admin))
     and (select count(*) from public.profiles p join public.user_levels l on l.id = p.level_id where l.is_admin) <= 1 then
    raise exception 'Deve restare almeno un amministratore';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger profiles_protect_last_admin
  before update of level_id or delete on public.profiles
  for each row execute function public.protect_last_admin();

-- Assegnare un livello a un utente
create or replace function public.assign_level(p_user uuid, p_level uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_rank int;
  v_new public.user_levels;
begin
  if not public.has_permission('livelli.assegnare') then
    raise exception 'Non hai il permesso di assegnare i livelli';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'Non puoi cambiare il tuo livello';
  end if;
  select * into v_new from public.user_levels where id = p_level;
  if v_new.id is null then
    raise exception 'Livello inesistente';
  end if;
  select l.rank into v_target_rank from public.profiles p join public.user_levels l on l.id = p.level_id where p.id = p_user;
  if v_target_rank is null then
    raise exception 'Utente inesistente';
  end if;
  if not public.is_admin_user() and (v_target_rank >= public.my_rank() or v_new.rank >= public.my_rank() or v_new.is_admin) then
    raise exception 'Non puoi gestire utenti o livelli di rango uguale o superiore al tuo';
  end if;
  update public.profiles set level_id = p_level where id = p_user;
end;
$$;

-- Eliminare un livello spostando i suoi utenti in un altro
create or replace function public.delete_level(p_level uuid, p_move_to uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.user_levels;
  v_new public.user_levels;
begin
  if not public.has_permission('livelli.gestire') then
    raise exception 'Non hai il permesso di gestire i livelli';
  end if;
  select * into v_old from public.user_levels where id = p_level;
  select * into v_new from public.user_levels where id = p_move_to;
  if v_old.id is null or v_new.id is null or p_level = p_move_to then
    raise exception 'Scegli un livello diverso a cui spostare gli utenti';
  end if;
  if v_old.is_admin then
    raise exception 'Il livello Amministratore non si elimina';
  end if;
  if not public.is_admin_user() and (v_old.rank >= public.my_rank() or v_new.rank >= public.my_rank() or v_new.is_admin) then
    raise exception 'Non puoi gestire livelli di rango uguale o superiore al tuo';
  end if;
  if (select value #>> '{}' from public.game_settings where key = 'livello_predefinito') = p_level::text then
    raise exception 'È il livello dei nuovi iscritti: scegline prima un altro nelle impostazioni';
  end if;
  update public.profiles set level_id = p_move_to where level_id = p_level;
  -- il trigger di protezione blocca le DELETE dirette: questo segnale vale solo per questa operazione
  perform set_config('app.eliminazione_livello', 'on', true);
  delete from public.user_levels where id = p_level;
  perform set_config('app.eliminazione_livello', 'off', true);
end;
$$;

revoke execute on function public.assign_level(uuid, uuid) from anon;
revoke execute on function public.delete_level(uuid, uuid) from anon;

-- I nuovi iscritti ricevono il livello predefinito
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level uuid;
begin
  select (value #>> '{}')::uuid into v_level from public.game_settings where key = 'livello_predefinito';
  if v_level is null or not exists (select 1 from public.user_levels where id = v_level) then
    select id into v_level from public.user_levels where not is_admin order by rank asc limit 1;
  end if;
  insert into public.profiles (id, username, level_id)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
      'utente_' || left(replace(new.id::text, '-', ''), 8)
    ),
    v_level
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. REGISTRO DELLE AZIONI DEL PANNELLO
-- ---------------------------------------------------------------------

create table public.admin_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_label text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index admin_log_created_idx on public.admin_log (created_at desc);
create index admin_log_actor_id_idx on public.admin_log (actor_id);

alter table public.admin_log enable row level security;
revoke all on public.admin_log from anon, authenticated;
grant select on public.admin_log to authenticated;

create policy "Registro: lettura con permesso" on public.admin_log for select to authenticated
  using ((select public.has_permission('log.vedere')));

-- Ogni modifica alle tabelle del pannello finisce nel registro
create or replace function public.log_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.admin_log (actor_id, action, entity, entity_label, details)
  values (
    (select auth.uid()),
    case tg_op when 'INSERT' then 'creazione' when 'UPDATE' then 'modifica' else 'eliminazione' end,
    tg_table_name,
    coalesce(v_row ->> 'name', v_row ->> 'username', v_row ->> 'label', v_row ->> 'key', v_row ->> 'id'),
    case when tg_op = 'UPDATE' then jsonb_build_object('prima', to_jsonb(old), 'dopo', to_jsonb(new)) else v_row end
  );
  return null;
end;
$$;

create trigger user_levels_log after insert or update or delete on public.user_levels
  for each row execute function public.log_admin_change();
create trigger game_settings_log after update on public.game_settings
  for each row execute function public.log_admin_change();
create trigger attributes_log after insert or update or delete on public.attributes
  for each row execute function public.log_admin_change();
create trigger skills_log after insert or update or delete on public.skills
  for each row execute function public.log_admin_change();
create trigger sheet_options_log after insert or update or delete on public.sheet_options
  for each row execute function public.log_admin_change();
create trigger creation_options_log after insert or update or delete on public.creation_options
  for each row execute function public.log_admin_change();
create trigger profiles_level_log after update of level_id on public.profiles
  for each row when (old.level_id is distinct from new.level_id)
  execute function public.log_admin_change();
