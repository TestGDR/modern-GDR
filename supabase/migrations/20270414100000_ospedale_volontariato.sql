-- =====================================================================
-- SEASIDE MEDICAL CENTER: SOLO VOLONTARIATO
-- I personaggi sono studenti: in ospedale non lavorano, fanno volontariato
-- (compagnia ai pazienti, pet therapy, attività con i bambini), solo part
-- time e con un piccolo rimborso spese.
-- Tolti i vecchi ruoli (Addetto all'accoglienza, Assistente infermiere) se
-- nessuno li ha. Si può rilanciare.
-- =====================================================================

update public.jobs set description =
  '<p>L''ospedale cittadino accoglie gli studenti come <strong>volontari</strong>: qualche pomeriggio a settimana per tenere compagnia ai pazienti, portare i cani della pet therapy o giocare con i bambini del reparto di pediatria. Niente camici né cure mediche: solo tempo, sorrisi e un piccolo rimborso spese.</p>'
where lower(name) = 'seaside medical center';

delete from public.job_roles r
using public.jobs j
where j.id = r.job_id and lower(j.name) = 'seaside medical center'
  and lower(r.name) in ('addetto all''accoglienza', 'assistente infermiere')
  and not exists (select 1 from public.character_jobs cj where cj.role_id = r.id);

insert into public.job_roles (job_id, name, description, salary, salary_full, salary_part, max_members, self_select, sort_order)
select j.id, v.role, v.descr, 0, null, v.part_pay, v.posti, true, v.ord
from (values
  ('Volontario in corsia', 'Compagnia ai pazienti, letture, passeggiate in giardino e due chiacchiere con chi è solo.', 400, null, 1),
  ('Volontario di pet therapy', 'Porta in reparto i cani addestrati (o il proprio) per far sorridere i pazienti.', 450, 4, 2),
  ('Animatore in pediatria', 'Giochi, disegni, letture e feste con i bambini ricoverati.', 450, 4, 3)
) as v (role, descr, part_pay, posti, ord)
join public.jobs j on lower(j.name) = 'seaside medical center'
where not exists (select 1 from public.job_roles r where r.job_id = j.id and lower(r.name) = lower(v.role));
