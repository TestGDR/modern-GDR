-- =====================================================================
-- PNG DELLA CITTÀ: CATEGORIE, PROPOSTE DEI GIOCATORI E LEGAMI
-- - npcs.category: categoria dei PNG della città (Docenti, Personalità
--   influenti, Autorità…), testo libero con suggerimenti nell'interfaccia.
-- - I giocatori (con personaggio approvato) possono proporre anche PNG
--   della città (kind 'ambiente', senza proprietario): lo staff li approva,
--   poi diventano dell'ambientazione e li modifica solo lo staff.
-- - npc_links: legami tra un personaggio e un PNG della città (es. «è il mio
--   relatore», «mio zio»). Li propone il giocatore, lo staff li approva;
--   più personaggi possono essere legati allo stesso PNG. Segreti: solo il
--   giocatore del legame e lo staff.
-- =====================================================================

alter table public.npcs add column if not exists category text not null default '' check (char_length(category) <= 40);

-- 1. CHI VEDE E CHI SCRIVE I PNG
drop policy if exists "PNG: approvati e pubblici per tutti, il resto a proprietario e staff" on public.npcs;
create policy "PNG: approvati e pubblici per tutti, il resto a proprietario e staff" on public.npcs for select to authenticated
  using (
    (status = 'approvato' and active and not secret)
    or (select public.npc_staff())
    or (owner_character_id is not null and public.npc_mine(owner_character_id))
    or (kind = 'ambiente' and created_by = (select auth.uid()))
  );

drop policy if exists "PNG: lo staff li crea, i giocatori li propongono" on public.npcs;
create policy "PNG: lo staff li crea, i giocatori li propongono" on public.npcs for insert to authenticated
  with check (
    (select public.has_permission('png.gestire'))
    or (kind = 'giocatore' and status = 'proposto' and public.owns_character(owner_character_id))
    or (kind = 'ambiente' and status = 'proposto' and owner_character_id is null
        and exists (select 1 from public.characters c where c.owner_id = (select auth.uid()) and c.status = 'approvata'))
  );

drop policy if exists "PNG: lo staff li modifica, il giocatore i suoi" on public.npcs;
create policy "PNG: lo staff li modifica, il giocatore i suoi" on public.npcs for update to authenticated
  using (
    (select public.has_permission('png.gestire'))
    or (kind = 'giocatore' and public.npc_mine(owner_character_id))
    or (kind = 'ambiente' and created_by = (select auth.uid()) and status <> 'approvato')
  )
  with check (
    (select public.has_permission('png.gestire'))
    or (kind = 'giocatore' and public.owns_character(owner_character_id))
    or (kind = 'ambiente' and created_by = (select auth.uid()) and owner_character_id is null)
  );

drop policy if exists "PNG: lo staff li elimina, il giocatore le sue proposte" on public.npcs;
create policy "PNG: lo staff li elimina, il giocatore le sue proposte" on public.npcs for delete to authenticated
  using (
    (select public.has_permission('png.gestire'))
    or (status <> 'approvato' and kind = 'giocatore' and public.npc_mine(owner_character_id))
    or (status <> 'approvato' and kind = 'ambiente' and created_by = (select auth.uid()))
  );

-- Il giocatore non approva da solo: ogni sua modifica torna "proposta"
create or replace function public.npcs_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  -- SQL Editor (nessun utente) o staff: tutto consentito
  if auth.uid() is null or public.has_permission('png.gestire') then
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      new.reviewed_by := auth.uid();
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.kind := case when new.kind = 'ambiente' then 'ambiente' else 'giocatore' end;
    new.created_by := auth.uid();
  else
    new.kind := old.kind;
    new.created_by := old.created_by;
    new.owner_character_id := old.owner_character_id;
  end if;
  if new.kind = 'ambiente' then new.owner_character_id := null; end if;
  new.status := 'proposto';
  new.review_note := case when tg_op = 'UPDATE' then old.review_note else '' end;
  new.reviewed_by := null;
  new.active := true;
  return new;
end;
$$;

-- Avvisi: proposte allo staff, esito al giocatore (anche per i PNG della città proposti)
create or replace function public.npcs_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  v_pg text;
  v_to uuid;
begin
  -- i PNG creati dalle voci della scheda: l'avviso allo staff arriva quando il giocatore li completa
  if current_setting('app.png_auto', true) = 'on' then return null; end if;
  if new.kind = 'giocatore' then
    select public.first_name(name), owner_id into v_pg, v_to from public.characters where id = new.owner_character_id;
  else
    -- PNG della città: avvisi solo se l'ha proposto un giocatore
    if new.created_by is null or exists (
      select 1 from public.profiles p join public.user_levels l on l.id = p.level_id
      where p.id = new.created_by and (l.is_admin or 'png.gestire' = any (l.permissions))) then
      return null;
    end if;
    v_to := new.created_by;
    select public.first_name(name) into v_pg from public.characters where owner_id = new.created_by order by created_at limit 1;
  end if;
  -- proposta (nuova o modificata) → staff
  if new.status = 'proposto' and (tg_op = 'INSERT' or old.status is distinct from 'proposto' or old.name <> new.name or old.description <> new.description) then
    for u in
      select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
      where (l.is_admin or 'png.gestire' = any (l.permissions)) and p.id is distinct from auth.uid()
    loop
      perform public.send_system_message(u.id,
        '🎭 PNG ' || case when new.kind = 'ambiente' then 'della città ' else '' end || 'da approvare: ' || new.name
        || coalesce(' (' || nullif(new.role, '') || ')', '') || ', proposto ' || case when new.kind = 'ambiente' then 'da ' else 'per ' end
        || coalesce(v_pg, 'un personaggio') || '. Lo trovi in Utility → PNG.');
    end loop;
  end if;
  -- esito → giocatore
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approvato', 'rifiutato') and v_to is not null then
    perform public.send_system_message(v_to,
      case when new.status = 'approvato' then '🎭 Il PNG ' || new.name || ' è stato approvato: da ora il Master può interpretarlo in gioco.'
           else '🎭 Il PNG ' || new.name || ' non è stato approvato' || coalesce(': ' || nullif(new.review_note, ''), '.') || ' Puoi correggerlo e riproporlo da Utility → PNG.' end);
  end if;
  return null;
end;
$$;

-- 2. LEGAMI TRA PERSONAGGI E PNG DELLA CITTÀ
create table if not exists public.npc_links (
  id uuid primary key default gen_random_uuid(),
  npc_id uuid not null references public.npcs (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  -- es. «Il mio relatore», «Mio zio», «Mi deve un favore»
  relation text not null check (char_length(btrim(relation)) between 2 and 120),
  note text not null default '' check (char_length(note) <= 1000),
  secret boolean not null default false,
  status text not null default 'proposto' check (status in ('proposto', 'approvato', 'rifiutato')),
  review_note text not null default '' check (char_length(review_note) <= 500),
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (npc_id, character_id)
);
create index if not exists npc_links_character_idx on public.npc_links (character_id);
create index if not exists npc_links_reviewed_by_idx on public.npc_links (reviewed_by);

alter table public.npc_links enable row level security;
revoke all on public.npc_links from anon, authenticated;
grant select, insert, update, delete on public.npc_links to authenticated;

drop policy if exists "PNG: legami approvati per tutti, il resto al giocatore e allo staff" on public.npc_links;
create policy "PNG: legami approvati per tutti, il resto al giocatore e allo staff" on public.npc_links for select to authenticated
  using (
    (status = 'approvato' and not secret)
    or (select public.npc_staff())
    or public.npc_mine(character_id)
  );
drop policy if exists "PNG: legami proposti dal giocatore" on public.npc_links;
create policy "PNG: legami proposti dal giocatore" on public.npc_links for insert to authenticated
  with check (
    (select public.has_permission('png.gestire'))
    or (status = 'proposto' and public.owns_character(character_id)
        and exists (select 1 from public.npcs n where n.id = npc_id and n.kind = 'ambiente' and n.status = 'approvato' and n.active))
  );
drop policy if exists "PNG: legami modificati dal giocatore o dallo staff" on public.npc_links;
create policy "PNG: legami modificati dal giocatore o dallo staff" on public.npc_links for update to authenticated
  using ((select public.has_permission('png.gestire')) or public.npc_mine(character_id))
  with check ((select public.has_permission('png.gestire')) or public.owns_character(character_id));
drop policy if exists "PNG: legami tolti dal giocatore o dallo staff" on public.npc_links;
create policy "PNG: legami tolti dal giocatore o dallo staff" on public.npc_links for delete to authenticated
  using ((select public.has_permission('png.gestire')) or public.npc_mine(character_id));

-- il giocatore non approva da solo: ogni sua modifica torna "proposta"
create or replace function public.npc_links_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if auth.uid() is null or public.has_permission('png.gestire') then
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      new.reviewed_by := auth.uid();
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.npc_id := old.npc_id;
    new.character_id := old.character_id;
    new.review_note := old.review_note;
  else
    new.review_note := '';
  end if;
  new.status := 'proposto';
  new.reviewed_by := null;
  return new;
end;
$$;
revoke execute on function public.npc_links_guard() from public, anon, authenticated;
drop trigger if exists npc_links_guard on public.npc_links;
create trigger npc_links_guard before insert or update on public.npc_links
  for each row execute function public.npc_links_guard();

drop trigger if exists npc_links_log on public.npc_links;
create trigger npc_links_log after insert or update or delete on public.npc_links
  for each row execute function public.log_admin_change();

create or replace function public.npc_links_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  v_pg text;
  v_owner uuid;
  v_npc text;
begin
  select public.first_name(name), owner_id into v_pg, v_owner from public.characters where id = new.character_id;
  select name into v_npc from public.npcs where id = new.npc_id;
  if new.status = 'proposto' and (tg_op = 'INSERT' or old.status is distinct from 'proposto' or old.relation <> new.relation or old.note <> new.note) then
    for u in
      select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
      where (l.is_admin or 'png.gestire' = any (l.permissions)) and p.id is distinct from auth.uid()
    loop
      perform public.send_system_message(u.id,
        '🎭 Legame da approvare: ' || coalesce(v_pg, 'un personaggio') || ' con ' || coalesce(v_npc, 'un PNG') || ' («' || new.relation || '»). Lo trovi in Utility → PNG.');
    end loop;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approvato', 'rifiutato') and v_owner is not null then
    perform public.send_system_message(v_owner,
      case when new.status = 'approvato' then '🎭 Il legame con ' || coalesce(v_npc, 'il PNG') || ' («' || new.relation || '») è stato approvato.'
           else '🎭 Il legame con ' || coalesce(v_npc, 'il PNG') || ' non è stato approvato' || coalesce(': ' || nullif(new.review_note, ''), '.') || ' Puoi correggerlo da Utility → PNG.' end);
  end if;
  return null;
end;
$$;
revoke execute on function public.npc_links_notify() from public, anon, authenticated;
drop trigger if exists npc_links_notify on public.npc_links;
create trigger npc_links_notify after insert or update on public.npc_links
  for each row execute function public.npc_links_notify();
