-- =====================================================================
-- GUIDA LEGGIBILE ANCHE DALLA HOMEPAGE (visitatori non collegati)
-- Solo lettura: scrivere resta a chi ha guida.scrivere.
-- =====================================================================

grant select on public.guide_macros, public.guide_sections, public.guide_pages to anon;
create policy "Guida: macrosezioni visibili ai visitatori" on public.guide_macros for select to anon using (true);
create policy "Guida: sottosezioni visibili ai visitatori" on public.guide_sections for select to anon using (true);
create policy "Guida: discussioni visibili ai visitatori" on public.guide_pages for select to anon using (true);
