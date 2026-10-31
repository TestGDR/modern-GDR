-- Icone dei livelli Amministratore (corona d'oro) e Moderatore (corona lavanda):
-- i file sono nel sito (public/icons), il link è quello pubblico di Vercel
update public.user_levels set icon_url = 'https://modern-gdr.vercel.app/icons/corona-amministratore.svg' where is_admin;
update public.user_levels set icon_url = 'https://modern-gdr.vercel.app/icons/corona-moderatore.svg' where name = 'Moderatore';
