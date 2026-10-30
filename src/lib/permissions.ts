// =====================================================================
// REGISTRO DEI PERMESSI
// Unico elenco dei permessi del gioco: il pannello "Livelli e permessi"
// genera le caselle da qui. La chiave (es. "chat.scrivere") è quella salvata
// in user_levels.permissions e controllata nel database con
// public.has_permission('chiave'): non cambiarla dopo averla usata.
//
// Per aggiungere un permesso: aggiungi una voce qui e usala nel codice e
// nelle policy. Compare da solo nel pannello, spento per tutti i livelli
// tranne Amministratore (che li ha sempre tutti).
// =====================================================================

export type PermissionItem = {
  key: string;
  label: string;
  description?: string;
};

export type PermissionArea = {
  id: string;
  title: string;
  items: PermissionItem[];
};

export const PERMISSION_AREAS: PermissionArea[] = [
  {
    id: "amministrazione",
    title: "Amministrazione",
    items: [
      { key: "admin.accedere", label: "Accedere al pannello admin" },
      { key: "utenti.vedere_modificare", label: "Vedere e modificare gli utenti" },
      { key: "livelli.assegnare", label: "Assegnare i livelli" },
      { key: "livelli.gestire", label: "Gestire livelli e permessi" },
      { key: "regole.gestire", label: "Gestire caratteristiche e abilità", description: "Anche vantaggi, svantaggi, tratti e patrimonio" },
      { key: "impostazioni.gestire", label: "Modificare le impostazioni del sistema" },
      { key: "log.vedere", label: "Vedere il registro delle azioni del pannello" },
      { key: "iscrizioni.gestire", label: "Aprire e chiudere le iscrizioni" },
      { key: "gestione.accessi", label: "Vedere gli accessi", description: "Indirizzi IP, paese e controllo VPN/proxy di ogni accesso" },
      { key: "manutenzione.sito", label: "Fare manutenzione", description: "Eliminare messaggi vecchi e account inattivi, con anteprima" },
    ],
  },
  {
    id: "personaggi",
    title: "Personaggi",
    items: [
      { key: "personaggi.creare", label: "Creare personaggi" },
      { key: "personaggi.modificare_propri", label: "Modificare i propri personaggi" },
      { key: "personaggi.vedere_tutti", label: "Vedere le schede di tutti", description: "Anche bozze e schede in attesa" },
      { key: "personaggi.modificare_tutti", label: "Modificare qualsiasi scheda" },
      { key: "personaggi.approvare", label: "Approvare o rifiutare le schede" },
      { key: "personaggi.eliminare", label: "Eliminare personaggi" },
      { key: "personaggi.assegnare_px", label: "Assegnare PX" },
      { key: "personaggi.modificare_caratteristiche", label: "Modificare direttamente caratteristiche e abilità di un personaggio" },
    ],
  },
  {
    id: "gioco",
    title: "Gioco e chat",
    items: [
      { key: "chat.scrivere", label: "Scrivere in chat", description: "Entrare in giocata e scrivere con il proprio personaggio" },
      { key: "dadi.tirare", label: "Tirare i dadi" },
      { key: "dadi.nascosti", label: "Fare tiri nascosti da Master" },
      { key: "chat.narrazione", label: "Narrare come Master", description: "Messaggi «Narrazione master» e modalità master (limiti di caratteri)" },
      { key: "combattimento.gestire", label: "Gestire il combattimento", description: "Vedere dadi e PF degli scontri, decidere le difese, chiudere gli scontri, modificare PF e ferite" },
      { key: "chat.moderare", label: "Moderare le chat", description: "Entrare in tutte le chat, anche chiuse o su invito, eliminare messaggi, invitare e allontanare" },
      { key: "staff.invisibile", label: "Diventare invisibile", description: "Leggere e scrivere nelle chat senza comparire tra i presenti" },
      { key: "mondo.gestire", label: "Gestire il mondo", description: "Mappe, quartieri, chat e impostazioni della chat" },
      { key: "chat.log", label: "Rileggere le chat", description: "Gestione → Log: tutte le chat, anche senza entrare in giocata (i sussurri solo l'Amministratore)" },
    ],
  },
  {
    id: "messaggi",
    title: "Messaggi e ticket",
    items: [
      { key: "messaggi.tutti", label: "Scrivere a tutti", description: "Messaggi a tutti nei canali ON e OFF (anche senza pubblicare notizie)" },
      { key: "messaggi.log", label: "Leggere i messaggi OFF e del telefono", description: "Gestione → Log: messaggi privati, gruppi e telefono (i giocatori ne sono avvisati)" },
      { key: "ticket.gestire", label: "Gestire i ticket", description: "Vedere tutti i ticket, rispondere come staff, cambiare stato ed eliminare quelli in archivio" },
      { key: "ticket.categorie", label: "Gestire le sezioni dei ticket", description: "Nomi, istruzioni e ordine delle sezioni" },
    ],
  },
  {
    id: "comunita",
    title: "Comunità",
    items: [
      { key: "forum.moderare", label: "Moderare il forum", description: "Fissare, chiudere, rendere importanti, spostare, rinominare ed eliminare le discussioni; modificare ed eliminare i post di tutti" },
      { key: "forum.sezioni", label: "Gestire categorie e sezioni del forum" },
      { key: "forum.riservate", label: "Leggere le sezioni riservate del forum", description: "Vede e scrive in tutte le sezioni riservate a livelli o gruppi" },
      { key: "forum.segnalare", label: "Segnalare un post a tutti", description: "A tutti compare un avviso con il link al post" },
      { key: "assenze.gestire", label: "Gestire le assenze", description: "Togliere le assenze di chiunque" },
      { key: "ricerca.moderare", label: "Moderare la ricerca di gioco", description: "Togliere le richieste di chiunque" },
      { key: "pettegolezzi.gestire", label: "Gestire i pettegolezzi", description: "Vedere i tiri, approvare, modificare, rifiutare ed eliminare le voci, cambiare dado e soglia" },
    ],
  },
  {
    id: "utility",
    title: "Utility",
    items: [
      { key: "prestatalento.gestire", label: "Cambiare i prestatalento", description: "Modificare o togliere il prestatalento registrato da un giocatore" },
      { key: "prestavolti.gestire", label: "Cambiare i prestavolti", description: "Modificare o togliere il prestavolto registrato da un giocatore" },
      { key: "lavori.gestire", label: "Gestire i lavori", description: "Creare lavori e ruoli con lo stipendio, assegnarli ai personaggi" },
      { key: "gruppi.gestire", label: "Gestire i gruppi", description: "Creare gruppi e ruoli con lo stipendio, assegnarli ai personaggi" },
      { key: "banca.gestire", label: "Gestire la banca", description: "Vedere tutti i conti e i movimenti, dare e togliere soldi con un motivo" },
    ],
  },
  {
    id: "trama",
    title: "Trama",
    items: [
      { key: "quest.gestire", label: "Creare e gestire quest ed eventi" },
      { key: "quest.ricompense", label: "Assegnare ricompense e PX di quest" },
    ],
  },
  {
    id: "moderazione",
    title: "Moderazione",
    items: [
      { key: "utenti.silenziare", label: "Silenziare o sospendere utenti" },
      { key: "utenti.bandire", label: "Bandire utenti" },
      { key: "segnalazioni.gestire", label: "Vedere e gestire le segnalazioni" },
    ],
  },
  {
    id: "contenuti",
    title: "Contenuti",
    items: [
      { key: "elenchi.gestire", label: "Gestire gli elenchi della scheda", description: "Indirizzi di studio, anni di corso, squadre e club" },
      { key: "guida.scrivere", label: "Scrivere la guida", description: "Macrosezioni, sottosezioni e discussioni della Guida (barra laterale)" },
      { key: "annunci.globali", label: "Pubblicare notizie e scrivere a tutti", description: "Notizie dello staff, messaggi a tutti (ON e OFF) e bacheche riservate del forum" },
      { key: "contenuti.moderare", label: "Moderare il social", description: "Eliminare post e commenti altrui sul social" },
    ],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_AREAS.flatMap((a) => a.items.map((i) => i.key));
