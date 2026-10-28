-- =====================================================================
-- 02 · MAPPA: QUARTIERI E LUOGHI DI GIOCO
-- I quartieri di Miami e i luoghi (le stanze di chat) dentro ognuno.
-- Li legge chiunque, li gestisce solo lo staff.
-- =====================================================================

create table public.districts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 2 and 60),
  tagline text check (char_length(tagline) <= 120),
  -- posizione del pin sulla mappa (viewBox 0 0 300 400)
  map_x smallint not null default 150 check (map_x between 0 and 300),
  map_y smallint not null default 200 check (map_y between 0 and 400),
  -- classi Tailwind della sfumatura (es. 'from-violet via-flamingo to-sand')
  gradient text not null default 'from-violet via-flamingo to-peach',
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  district_id uuid not null references public.districts (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 500),
  is_open boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index places_district_id_idx on public.places (district_id);

alter table public.districts enable row level security;
alter table public.places enable row level security;

grant select on public.districts, public.places to anon, authenticated;
grant insert, update, delete on public.districts, public.places to authenticated;

-- Quartieri
create policy "Quartieri: lettura per tutti"
  on public.districts for select
  to anon, authenticated
  using (true);

create policy "Quartieri: lo staff li crea"
  on public.districts for insert
  to authenticated
  with check ((select public.is_staff()));

create policy "Quartieri: lo staff li modifica"
  on public.districts for update
  to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy "Quartieri: lo staff li elimina"
  on public.districts for delete
  to authenticated
  using ((select public.is_staff()));

-- Luoghi
create policy "Luoghi: lettura per tutti"
  on public.places for select
  to anon, authenticated
  using (true);

create policy "Luoghi: lo staff li crea"
  on public.places for insert
  to authenticated
  with check ((select public.is_staff()));

create policy "Luoghi: lo staff li modifica"
  on public.places for update
  to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy "Luoghi: lo staff li elimina"
  on public.places for delete
  to authenticated
  using ((select public.is_staff()));
