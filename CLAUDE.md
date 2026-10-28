# Modern GDR — regole del progetto

GDR (gioco di ruolo) play by chat moderno: chat di gioco, messaggi privati tra giocatori, mappe, forum, funzioni social.

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
