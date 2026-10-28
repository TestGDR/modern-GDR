-- =====================================================================
-- 08 · NOTIZIE DALLA CITTÀ
-- La cronaca di Miami mostrata in bacheca. La scrive lo staff.
-- =====================================================================

create table public.city_news (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 160),
  body text check (char_length(body) <= 5000),
  district_id uuid references public.districts (id) on delete set null,
  author_id uuid default auth.uid() references public.profiles (id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index city_news_published_idx on public.city_news (published_at desc);
create index city_news_district_id_idx on public.city_news (district_id);
create index city_news_author_id_idx on public.city_news (author_id);

alter table public.city_news enable row level security;

grant select on public.city_news to anon, authenticated;
grant insert, update, delete on public.city_news to authenticated;

create policy "Notizie: lettura per tutti"
  on public.city_news for select to anon, authenticated using (true);

create policy "Notizie: lo staff le pubblica"
  on public.city_news for insert to authenticated with check ((select public.is_staff()));

create policy "Notizie: lo staff le modifica"
  on public.city_news for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

create policy "Notizie: lo staff le elimina"
  on public.city_news for delete to authenticated using ((select public.is_staff()));
