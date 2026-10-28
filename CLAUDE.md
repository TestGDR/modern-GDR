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
- Scheda personaggio in finestra: `src/app/(gioco)/@modal/(.)scheda` intercetta `/scheda` e `/scheda/[id]` e li apre in una finestra 800×550 (`SheetModal`, trascinabile e ridimensionabile). Aprendo l'indirizzo direttamente si vede la pagina intera. Il contenuto è condiviso in `src/components/game/sheet-content.tsx`.
- Lo slot `@modal` si chiude cambiando pagina grazie a `ModalGate` (controlla l'indirizzo). **Non** aggiungere un `[...catchAll]` in `@modal`: essendo nel gruppo `(gioco)` alla radice, renderebbe irraggiungibili `/login`, `/registrati` ecc.
- Ora corrente nei componenti del server: usare `requestTime()` (`src/lib/request-time.ts`), mai `Date.now()`/`new Date()` diretti (Cache Components).

## Percorso del giocatore
- Registrazione (nome del personaggio + email + password) → email di conferma → accesso con **nome del personaggio + password** → bacheca.
- Il nome scelto in registrazione (`profiles.username`) è il nome del personaggio: non si cambia. Unico senza distinguere maiuscole/minuscole.
- La scheda (età, lavoro, storia, caratteristiche) si completa da **Scheda personaggio** (`/scheda`). Senza personaggio si può leggere tutto; per scrivere in chat, messaggi e social compare l'invito `NeedsCharacter`.
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
- **Livelli e permessi** (al posto dei vecchi ruoli): ogni utente ha un livello (`profiles.level_id` → `user_levels`) con rango e permessi spuntati. Il registro dei permessi è in `src/lib/permissions.ts` (unico elenco: il pannello genera le caselle da lì).
- Nel database si controlla con `public.has_permission('chiave')` (l'Amministratore li ha tutti); nel codice con `can(player, "chiave")` di `src/lib/auth.ts`, solo per mostrare/nascondere: la sicurezza è nelle policy. Nuove policy: permessi specifici, **non** `is_staff()` (resta solo per compatibilità).
- Protezioni dei livelli: rango (non si gestiscono livelli/utenti di rango ≥ al proprio), un solo Amministratore non eliminabile, almeno un amministratore sempre, assegnazione con `assign_level()`, eliminazione con `delete_level()`. Dall'SQL Editor (nessun utente collegato) i controlli del pannello non si applicano.
- Sistema Interlock: `attributes` (caratteristiche), `skills` (abilità, una caratteristica ciascuna), `game_settings` (parametri), `sheet_options` (indirizzi, anni, club), `creation_options` (vantaggi, svantaggi, tratti, tenore). Valori dei PG in `character_attributes`, `character_skills`, `character_options`. Niente valori di gioco scritti nel codice: si leggono da queste tabelle.
- Stato della scheda: `bozza` → `in_attesa` → `approvata`/`rifiutata`. Le bozze le vedono solo il proprietario e chi ha `personaggi.vedere_tutti`.
- Le modifiche alle tabelle del pannello finiscono da sole in `admin_log`.
- Altre funzioni: `public.owns_character(id)`, `public.my_rank()`, `public.is_admin_user()`, `public.setting_int(chiave)`.
- `supabase/setup-completo.sql` è l'unione delle migrazioni iniziali (01-09), usata una volta per creare il database.

## Chiavi e segreti
- Le chiavi segrete **non vanno mai nel codice** né nei commit (niente service_role / secret key, password del database, token).
- Nel codice si usano le variabili `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, più `SUPABASE_SECRET_KEY` (solo server), lette da `.env.local` e dalle Environment Variables di Vercel.
- `SUPABASE_SECRET_KEY` si usa solo in `src/lib/supabase/admin.ts` (`server-only`), per trovare l'email dal nome del personaggio al login. Nessun altro uso senza motivo.
- `.env.local` è nel `.gitignore` e non va mai committato. `.env.example` contiene solo i nomi delle variabili, senza valori.
- Se serve una chiave segreta lato server, va in una variabile senza prefisso `NEXT_PUBLIC_` e mai usata in codice client.

## Cosa non toccare
- `.env.local` (lo gestisce l'utente).
- `src/components/ui/*`: file generati da shadcn; si rigenerano con la CLI, non si modificano a mano senza motivo.
- Il blocco `nextjs-agent-rules` in `AGENTS.md` (lo rigenera `next dev`).
- `package-lock.json`, `next-env.d.ts`: modificati solo dagli strumenti.
- Migrazioni già applicate al database: non si modificano, se ne crea una nuova.
