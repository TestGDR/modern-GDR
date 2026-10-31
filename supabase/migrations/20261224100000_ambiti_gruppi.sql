-- =====================================================================
-- AMBITI DEI GRUPPI
-- Ogni gruppo ha un ambito (Gruppi cittadini, Gruppi College, Club e
-- Fratellanze, Sport College…): in Utility → Gruppi ogni ambito è una
-- scheda. Gli ambiti li crea, rinomina e ordina lo staff (gruppi.gestire).
-- Le squadre sportive (create da Gestione → Sport) vanno da sole
-- nell'ambito segnato "per lo sport".
-- =====================================================================

create table public.group_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 40),
  -- qui finiscono le squadre sportive
  for_sport boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index group_categories_name_key on public.group_categories (lower(name));
-- un solo ambito per le squadre
create unique index group_categories_sport_key on public.group_categories (for_sport) where for_sport;
alter table public.group_categories enable row level security;
revoke all on public.group_categories from anon;
create policy "Ambiti dei gruppi: lettura" on public.group_categories for select to authenticated using (true);
create policy "Ambiti dei gruppi: lo staff li crea" on public.group_categories for insert to authenticated
  with check ((select public.has_permission('gruppi.gestire')));
create policy "Ambiti dei gruppi: lo staff li modifica" on public.group_categories for update to authenticated
  using ((select public.has_permission('gruppi.gestire'))) with check ((select public.has_permission('gruppi.gestire')));
create policy "Ambiti dei gruppi: lo staff li elimina" on public.group_categories for delete to authenticated
  using ((select public.has_permission('gruppi.gestire')));
create trigger group_categories_log after insert or update or delete on public.group_categories
  for each row execute function public.log_admin_change();

alter table public.game_groups add column if not exists category_id uuid references public.group_categories (id) on delete set null;
create index if not exists game_groups_category_idx on public.game_groups (category_id);

insert into public.group_categories (name, for_sport, sort_order) values
  ('Gruppi cittadini', false, 1),
  ('Gruppi College', false, 2),
  ('Club e Fratellanze', false, 3),
  ('Sport College', true, 4)
on conflict do nothing;
