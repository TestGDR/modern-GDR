# Modern GDR — regole del progetto

GDR (gioco di ruolo) play by chat moderno ambientato a Miami: chat di gioco, messaggi privati tra giocatori, mappe, forum, funzioni social.

@AGENTS.md

## Stack
- Next.js 16 (App Router, cartella `src/app`), TypeScript, Tailwind CSS v4, shadcn/ui.
- Supabase (database Postgres, Auth, Realtime) tramite `@supabase/supabase-js` e `@supabase/ssr`.
- In Next.js 16 il middleware si chiama **proxy**: il file è `src/proxy.ts`, non `middleware.ts`.
- Porta locale: **3001** (`npm run dev` → http://localhost:3001). La 3000 è usata da un altro progetto.

## Struttura
- `src/lib/supabase/client.ts` — client per i Client Components (browser).
- `src/lib/supabase/server.ts` — client per Server Components, Server Actions, Route Handlers. Crearne uno nuovo per ogni richiesta.
- `src/lib/supabase/proxy.ts` + `src/proxy.ts` — aggiornano la sessione a ogni richiesta.
- `src/components/ui/` — componenti shadcn/ui (si aggiungono con `npx shadcn@latest add <nome>`).
- `supabase/migrations/` — migrazioni SQL del database, una per file, con prefisso data (`YYYYMMDDHHMMSS_nome.sql`).
- `src/config/site.ts` — nome del sito, tagline e voci di menu.
- `src/app/(gioco)/` — area di gioco (bacheca, mappa, chat, messaggi, forum, social, scheda) con il layout comune.
- `src/components/scenery/` — scenografia (cielo al tramonto, palme SVG).
- `src/lib/auth.ts` — utente collegato: `getPlayer()`, `requirePlayer()` (serve l'accesso; il personaggio può essere null) e `requireCharacter()` (per le azioni che richiedono un personaggio).
- `supabase/email-templates/` — modelli delle email di Supabase (da incollare in Authentication > Emails > Templates).

## Percorso del giocatore
- Registrazione → email di riepilogo con link di conferma → home (`/?registrato=1`) → accesso → bacheca.
- Il personaggio è facoltativo: si crea da **Scheda personaggio** (`/scheda`). Senza personaggio si può leggere tutto; per scrivere in chat, messaggi e social compare l'invito `NeedsCharacter`.
- Recupero password: `/recupera-password` → email → `/nuova-password`.
- `src/lib/data.ts` — letture dal database (solo server). `src/lib/actions/` — Server Action (scritture).
- `src/lib/types.ts` — tipi delle tabelle: aggiornarli quando cambia il database.

## Design ("Golden Hour" a Miami)
- Ambientazione: **una sola città, Miami (Florida)**, divisa in quartieri. Mood: tramonto, palme in silhouette, neon e pastelli anni '80, oceano.
- Colori: usare i token del tema in `globals.css` (`night`, `dusk`, `violet`, `lavender`, `orchid`, `flamingo`, `peach`, `sand`, `mint`, `palm`), non colori a caso.
- Font: `font-heading` (Bebas Neue) per i titoli, `font-script` (Pacifico) solo per il logo, Geist per il testo.
- Pannelli con la classe `glass`; titoli di pagina con `PageHeader`; testo sfumato con `text-sunset`.
- Mobile first: ogni pagina deve funzionare a 375px. Su mobile: barra in alto + barra in basso; su desktop: sidebar.
- Nessun materiale di giochi esistenti (immagini, loghi, nomi, font di GTA o simili): solo grafica originale.

## Stile del codice
- TypeScript rigoroso: niente `any`, tipi espliciti per props e dati dal database.
- Componenti funzionali; Server Components di default, `"use client"` solo quando serve (stato, eventi, Realtime).
- Stili con classi Tailwind e componenti shadcn/ui; niente CSS ad hoc se non necessario.
- Import con l'alias `@/`.
- Testi dell'interfaccia in italiano. Commenti brevi e in italiano.
- Prima di consegnare: `npm run lint` e `npm run build` senza errori.

## Database e sicurezza (Supabase)
- La RLS (Row Level Security) è attiva su **tutte** le tabelle.
- Ogni nuova tabella va creata in una migrazione che contiene anche:
  1. `alter table ... enable row level security;`
  2. le policy di accesso per select / insert / update / delete, basate su `auth.uid()`.
- Nessuna tabella senza policy. Nessuna policy `using (true)` in scrittura.
- I messaggi privati devono essere leggibili solo da mittente e destinatario.
- Per sapere chi è l'utente sul server usare `supabase.auth.getClaims()` (o `getUser()`), mai `getSession()`.
- Supabase concede di default tutti i permessi sulle tabelle: dove servono colonne non modificabili, fare `revoke all` e poi `grant` solo delle colonne ammesse.
- Funzioni di supporto già presenti: `public.is_staff()` (master/admin) e `public.owns_character(id)`.
- Ruoli: `player`, `master`, `admin` (colonna `profiles.role`), modificabili solo dalla dashboard/SQL Editor.
- `supabase/setup-completo.sql` è l'unione delle migrazioni iniziali (01-09), usata una volta per creare il database.

## Chiavi e segreti
- Le chiavi segrete **non vanno mai nel codice** né nei commit (niente service_role / secret key, password del database, token).
- Nel codice si usano solo le variabili `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, lette da `.env.local`.
- `.env.local` è nel `.gitignore` e non va mai committato. `.env.example` contiene solo i nomi delle variabili, senza valori.
- Se serve una chiave segreta lato server, va in una variabile senza prefisso `NEXT_PUBLIC_` e mai usata in codice client.

## Cosa non toccare
- `.env.local` (lo gestisce l'utente).
- `src/components/ui/*`: file generati da shadcn; si rigenerano con la CLI, non si modificano a mano senza motivo.
- Il blocco `nextjs-agent-rules` in `AGENTS.md` (lo rigenera `next dev`).
- `package-lock.json`, `next-env.d.ts`: modificati solo dagli strumenti.
- Migrazioni già applicate al database: non si modificano, se ne crea una nuova.
