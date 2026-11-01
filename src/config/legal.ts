// Documenti della registrazione: Termini del servizio, Privacy policy e Cookie policy.
// Si aggiornano qui (ricordarsi di cambiare anche legalVersion).
import { siteConfig } from "@/config/site";

/** Un documento: sezioni con titolo (facoltativo) e paragrafi */
export type LegalSection = { heading?: string; text: string[] };

/** Data dell'ultima versione dei documenti */
export const legalVersion = "1 novembre 2026";

/** Email di contatto dello staff per privacy e segnalazioni (vuota = solo ticket) */
export const contactEmail = "";

const contact = contactEmail ? `aprendo un ticket dal gioco oppure scrivendo a ${contactEmail}` : "aprendo un ticket dal gioco (icona Ticket della barra laterale)";

/** Testo che precede le caselle della registrazione */
export const signupIntro = `${siteConfig.name} è un gioco di ruolo online testuale, gratuito e riservato a chi ha compiuto 18 anni. Prima di proseguire leggi il Disclaimer, i Termini del servizio, la Privacy policy e la Cookie policy.`;

export const termsOfService: LegalSection[] = [
  {
    heading: "1. Natura del servizio e requisiti di accesso",
    text: [
      `${siteConfig.name} è un gioco di ruolo play by chat testuale, gratuito, amatoriale e senza scopo di lucro. Registrazione e gioco sono riservati ai maggiorenni: spuntando l'apposita casella dichiari, sotto la tua responsabilità, di avere compiuto 18 anni. La dichiarazione non è una verifica dei documenti.`,
      "Le storie del gioco sono interamente immaginarie e possono contenere, tra l'altro, riferimenti a violenza, sessualità, turpiloquio, alcol e sostanze. Riguardano solo personaggi e situazioni inventate e non vanno mai riferite alle persone reali che giocano.",
    ],
  },
  {
    heading: "2. Account e credenziali",
    text: [
      "Ogni persona può avere un solo account, con un solo personaggio. Sei responsabile della correttezza dei dati che inserisci, della custodia della password e di tutto ciò che viene fatto con il tuo account, che non va ceduto né condiviso.",
      "È vietato tentare di entrare in account, aree o dati di altri senza autorizzazione. Se sospetti un accesso non autorizzato al tuo account, cambia subito la password e avvisa lo staff.",
    ],
  },
  {
    heading: "3. Regole di condotta",
    text: [
      "Ti impegni a rispettare la legge, il regolamento del gioco (nella Guida) e le altre persone. Non sono ammessi, ad esempio: molestie, minacce, discriminazioni, diffusione di dati personali altrui, contenuti illeciti o pornografici, violazioni del diritto d'autore, spam, programmi dannosi, tentativi di compromettere il sito o di aggirarne le protezioni.",
      "Il gioco è finzione: quello che accade ai personaggi non si porta sul piano personale.",
    ],
  },
  {
    heading: "4. Contenuti pubblicati dagli utenti",
    text: [
      "Resti titolare dei contenuti originali che scrivi (azioni in chat, schede, forum, social, messaggi) e dichiari di avere i permessi per usare eventuali materiali di altri, comprese le immagini dei prestavolti.",
      "Pubblicando, concedi allo staff una licenza gratuita e non esclusiva, limitata a quanto serve per ospitare, mostrare, moderare, archiviare e salvare in copia di sicurezza i contenuti all'interno del gioco. La licenza non ti toglie la proprietà dell'opera. Dopo la rimozione di un contenuto o la chiusura dell'account possono restare copie tecniche per il tempo necessario ai backup, alla sicurezza e alla gestione di eventuali contestazioni.",
    ],
  },
  {
    heading: "5. Moderazione e comunicazioni interne",
    text: [
      "Chat, messaggi OFF, telefono, social, forum e ticket sono strumenti del gioco e non vanno usati per comunicazioni personali riservate. Lo staff non legge le comunicazioni in modo indiscriminato, ma chi è autorizzato può consultarle (anche i messaggi privati) quando serve: controlli a campione sul rispetto del regolamento, segnalazioni, sicurezza, abusi, assistenza o obblighi di legge.",
      "I contenuti contrari alla legge, a questi Termini o al regolamento possono essere rimossi o limitati. Quando è ragionevolmente possibile ne sei informato, salvo urgenze di sicurezza, tutela di altre persone o richieste delle autorità.",
    ],
  },
  {
    heading: "6. Sospensione e chiusura dell'account",
    text: [
      "Lo staff può sospendere, limitare o chiudere un account in caso di violazioni, abusi, rischi per la sicurezza, lunga inattività, impossibilità tecnica di proseguire il servizio o obblighi di legge. Le misure sono proporzionate alla situazione e, su richiesta, lo staff ne spiega i motivi, ma non è garantito un riesame dei provvedimenti.",
    ],
  },
  {
    heading: "7. Disponibilità e responsabilità",
    text: [
      "Il servizio è gratuito e può avere manutenzioni, modifiche, interruzioni o malfunzionamenti. Lo staff fa il possibile per tenerlo disponibile e sicuro, ma non garantisce continuità assoluta, assenza di errori o conservazione illimitata dei contenuti. Soldi, oggetti, case e ogni altro bene del gioco non hanno alcun valore reale.",
      "Nessuna parte di questi Termini limita responsabilità che per legge non si possono escludere, comprese quelle per dolo o colpa grave.",
    ],
  },
  {
    heading: "8. Collegamenti e servizi esterni",
    text: [
      "Il sito può mostrare collegamenti o contenuti di servizi esterni (immagini e video inseriti con un link, meteo). Lo staff non controlla questi servizi e non risponde delle loro condizioni, della loro disponibilità o del loro trattamento dei dati.",
    ],
  },
  {
    heading: "9. Modifiche ai Termini",
    text: [
      "I Termini possono essere aggiornati per esigenze organizzative, tecniche o di legge. Le modifiche importanti vengono annunciate negli Annunci staff prima di entrare in vigore, quando possibile. Continuando a usare il sito dopo l'entrata in vigore accetti la nuova versione; se non la accetti puoi chiedere la chiusura dell'account.",
    ],
  },
  {
    heading: "10. Legge applicabile e contatti",
    text: [`Si applica la legge italiana, salvi i diritti inderogabili previsti dalla legge. Per segnalazioni, richieste o contestazioni puoi contattare lo staff ${contact}.`],
  },
];

export const privacyPolicy: LegalSection[] = [
  { text: ["Informativa ai sensi degli articoli 13 e 14 del Regolamento (UE) 2016/679 (GDPR) e del D.Lgs. 196/2003, come modificato dal D.Lgs. 101/2018."] },
  {
    heading: "1. Titolare del trattamento",
    text: [`Il titolare del trattamento è lo staff di ${siteConfig.name}. Per ogni questione sulla privacy puoi contattarlo ${contact}.`],
  },
  {
    heading: "2. Dati trattati",
    text: [
      "Possono essere trattati: indirizzo email e password (conservata solo in forma cifrata, illeggibile anche allo staff); nome e dati del personaggio; la dichiarazione di maggiore età; le preferenze di gioco; i contenuti che pubblichi, i messaggi e le richieste di assistenza (ticket); indirizzo IP, data e ora di registrazione e degli accessi, e il risultato del controllo VPN; i cookie tecnici di sessione; altri dati che decidi di fornire. Non chiediamo altri dati personali.",
    ],
  },
  {
    heading: "3. Finalità e basi giuridiche",
    text: [
      "• Creare e gestire l'account, farti accedere e offrirti le funzioni del gioco: esecuzione del servizio che hai richiesto.",
      "• Mandarti le email tecniche indispensabili (conferma dell'account, recupero della password) e rispondere alle richieste di assistenza: esecuzione del servizio.",
      "• Prevenire abusi e account multipli, proteggere account, sito e utenti, moderare i contenuti e accertare violazioni del regolamento: legittimo interesse dello staff alla sicurezza e al corretto funzionamento del gioco.",
      "• Adempiere a obblighi di legge e a richieste delle autorità competenti.",
      "Se in futuro servisse un consenso per altri trattamenti, verrà chiesto a parte e sarà sempre facoltativo. Aver letto questa informativa non vale come consenso a trattamenti ulteriori.",
    ],
  },
  {
    heading: "4. Conferimento dei dati",
    text: [
      "Email, nome del personaggio, password e dichiarazione di maggiore età sono necessari per registrarsi: senza, non è possibile creare l'account. Gli altri dati sono facoltativi, salvo quelli che servono alle singole funzioni che scegli di usare.",
    ],
  },
  {
    heading: "5. Modalità del trattamento e sicurezza",
    text: [
      "I dati sono trattati con strumenti informatici e con misure tecniche e organizzative proporzionate ai rischi: connessioni cifrate, password cifrate, permessi del database che limitano ciascuno ai propri dati e accesso riservato ai soli membri dello staff autorizzati per le loro funzioni (ad esempio la lettura dei messaggi solo a chi ha il permesso dei log). Nessun sistema informatico può comunque garantire una sicurezza assoluta.",
    ],
  },
  {
    heading: "6. Destinatari",
    text: [
      "I dati non vengono venduti né diffusi. Possono trattarli lo staff autorizzato e i fornitori tecnici che fanno funzionare il sito, come responsabili del trattamento: Supabase (database, accessi ed email di servizio, con i dati conservati nell'Unione Europea, in Irlanda), Vercel (ospitalità del sito, con server in Irlanda) e proxycheck.io (verifica dell'indirizzo IP per individuare le VPN). Possono essere comunicati alle autorità quando la legge lo richiede o per tutelare un diritto.",
      "Le immagini e i video inseriti dai giocatori con un link (prestavolti, social, forum) vengono caricati direttamente dai siti che li ospitano, che possono vedere il tuo indirizzo IP; lo stesso vale per il meteo del gioco, letto dal servizio Open-Meteo.",
    ],
  },
  {
    heading: "7. Trasferimenti fuori dallo Spazio economico europeo",
    text: [
      "Alcuni fornitori hanno sede fuori dallo Spazio economico europeo (Stati Uniti, Regno Unito). Gli eventuali trasferimenti avvengono nel rispetto degli articoli 44 e seguenti del GDPR, sulla base di decisioni di adeguatezza, clausole contrattuali standard o altre garanzie valide. Puoi chiedere informazioni sulle garanzie allo staff.",
    ],
  },
  {
    heading: "8. Conservazione",
    text: [
      "I dati dell'account restano finché l'account esiste e, dopo la chiusura, per il tempo necessario a completare la cancellazione e a gestire richieste, contestazioni, sicurezza e obblighi di legge. Il registro degli accessi (IP, date, controllo VPN) viene cancellato automaticamente dopo 6 mesi, salvo casi che richiedano di tenerlo più a lungo. Le copie di backup vengono eliminate o sovrascritte con i normali cicli tecnici.",
    ],
  },
  {
    heading: "9. Diritti dell'interessato",
    text: [
      `Nei casi previsti puoi chiedere di accedere ai tuoi dati, correggerli, cancellarli, limitarne il trattamento, opporti e riceverli in un formato portabile, oltre a revocare un eventuale consenso senza effetti sui trattamenti già fatti. Le richieste si inviano ${contact}.`,
      "Hai anche il diritto di proporre reclamo al Garante per la protezione dei dati personali o all'autorità di controllo competente.",
    ],
  },
  {
    heading: "10. Decisioni automatizzate",
    text: ["Non ci sono decisioni esclusivamente automatizzate che producono effetti giuridici o comunque significativi su di te. I tiri di dado e i calcoli del gioco riguardano solo i personaggi."],
  },
  {
    heading: "11. Cookie",
    text: ["Il sito usa solo cookie tecnici, necessari alla sessione, all'accesso e al funzionamento delle pagine, per i quali non serve il consenso. I dettagli sono nella Cookie policy."],
  },
  {
    heading: "12. Chiusura dell'account",
    text: [
      `Puoi chiedere la chiusura dell'account ${contact}, indicando il nome del tuo personaggio; se scrivi per email, usa l'indirizzo con cui ti sei registrato. La cancellazione non riguarda i dati da conservare per obblighi di legge, sicurezza o tutela di diritti, né le copie temporanee nei backup.`,
    ],
  },
];

export const cookiePolicy: LegalSection[] = [
  {
    heading: "1. Solo cookie tecnici",
    text: [
      `${siteConfig.name} usa esclusivamente cookie e strumenti tecnici, necessari a far funzionare il sito. Non ci sono cookie di profilazione, di pubblicità o di statistiche di terze parti, né strumenti di tracciamento.`,
    ],
  },
  {
    heading: "2. Quali sono",
    text: [
      "• Cookie della sessione (Supabase): ti tengono collegato al tuo account mentre navighi. Senza, non potresti accedere.",
      "• Cookie degli accessi: ricorda per qualche giorno il controllo di sicurezza del tuo collegamento, così non viene ripetuto a ogni pagina.",
      "• Memoria del browser (localStorage e sessionStorage): conserva solo informazioni tecniche, come il meteo del gioco per 30 minuti, la pagina aperta sotto le finestre e l'ultima attività. Le tue preferenze di gioco stanno nel database, non nel browser.",
    ],
  },
  {
    heading: "3. Consenso e gestione",
    text: [
      "Essendo tutti tecnici, questi strumenti non richiedono il consenso preventivo. Puoi comunque cancellarli dalle impostazioni del browser: dovrai solo accedere di nuovo.",
      "Se in futuro venissero introdotti cookie o strumenti non strettamente necessari, questa informativa e un sistema di scelta verranno aggiornati prima del loro utilizzo.",
    ],
  },
];
