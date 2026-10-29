-- =====================================================================
-- GUIDA DEL GIOCO (dal Westeros, 0016, con un livello in più)
-- Macrosezioni → sottosezioni → discussioni (le pagine, testo in HTML).
-- La leggono tutti i giocatori collegati; la scrive chi ha "guida.scrivere"
-- (l'Amministratore li ha tutti; al Moderatore si spunta dal pannello).
-- =====================================================================

create table public.guide_macros (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.guide_sections (
  id uuid primary key default gen_random_uuid(),
  macro_id uuid not null references public.guide_macros (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index guide_sections_macro_idx on public.guide_sections (macro_id, sort_order);

create table public.guide_pages (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.guide_sections (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  content text not null default '' check (char_length(content) <= 200000),
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid()
);
create index guide_pages_section_idx on public.guide_pages (section_id, sort_order);
create index guide_pages_updated_by_idx on public.guide_pages (updated_by);

alter table public.guide_macros enable row level security;
alter table public.guide_sections enable row level security;
alter table public.guide_pages enable row level security;
revoke all on public.guide_macros, public.guide_sections, public.guide_pages from anon;
grant select, insert, update, delete on public.guide_macros, public.guide_sections, public.guide_pages to authenticated;

create policy "Guida: macrosezioni visibili" on public.guide_macros for select to authenticated using (true);
create policy "Guida: macrosezioni create da chi scrive" on public.guide_macros for insert to authenticated
  with check ((select public.has_permission('guida.scrivere')));
create policy "Guida: macrosezioni modificate da chi scrive" on public.guide_macros for update to authenticated
  using ((select public.has_permission('guida.scrivere'))) with check ((select public.has_permission('guida.scrivere')));
create policy "Guida: macrosezioni eliminate da chi scrive" on public.guide_macros for delete to authenticated
  using ((select public.has_permission('guida.scrivere')));

create policy "Guida: sottosezioni visibili" on public.guide_sections for select to authenticated using (true);
create policy "Guida: sottosezioni create da chi scrive" on public.guide_sections for insert to authenticated
  with check ((select public.has_permission('guida.scrivere')));
create policy "Guida: sottosezioni modificate da chi scrive" on public.guide_sections for update to authenticated
  using ((select public.has_permission('guida.scrivere'))) with check ((select public.has_permission('guida.scrivere')));
create policy "Guida: sottosezioni eliminate da chi scrive" on public.guide_sections for delete to authenticated
  using ((select public.has_permission('guida.scrivere')));

create policy "Guida: discussioni visibili" on public.guide_pages for select to authenticated using (true);
create policy "Guida: discussioni create da chi scrive" on public.guide_pages for insert to authenticated
  with check ((select public.has_permission('guida.scrivere')));
create policy "Guida: discussioni modificate da chi scrive" on public.guide_pages for update to authenticated
  using ((select public.has_permission('guida.scrivere'))) with check ((select public.has_permission('guida.scrivere')));
create policy "Guida: discussioni eliminate da chi scrive" on public.guide_pages for delete to authenticated
  using ((select public.has_permission('guida.scrivere')));

-- Data e autore dell'ultima modifica li mette il database
create or replace function public.guide_pages_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger guide_pages_touch before insert or update on public.guide_pages
  for each row execute function public.guide_pages_touch();

-- Registro del pannello
create trigger guide_macros_log after insert or update or delete on public.guide_macros
  for each row execute function public.log_admin_change();
create trigger guide_sections_log after insert or update or delete on public.guide_sections
  for each row execute function public.log_admin_change();
create trigger guide_pages_log after insert or delete on public.guide_pages
  for each row execute function public.log_admin_change();
