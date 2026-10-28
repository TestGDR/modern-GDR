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
      { key: "regole.gestire", label: "Gestire caratteristiche e abilità", description: "Anche vantaggi, svantaggi, tratti e tenore di vita" },
      { key: "impostazioni.gestire", label: "Modificare le impostazioni del sistema" },
      { key: "log.vedere", label: "Vedere il log delle azioni" },
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
      { key: "chat.scrivere", label: "Scrivere in chat" },
      { key: "dadi.tirare", label: "Tirare i dadi" },
      { key: "dadi.nascosti", label: "Fare tiri nascosti da Master" },
      { key: "luoghi.gestire", label: "Creare e modificare i luoghi del campus", description: "Quartieri e luoghi della mappa" },
      { key: "scene.gestire", label: "Aprire e chiudere le scene" },
      { key: "messaggi.modificare_propri", label: "Modificare o eliminare i propri messaggi" },
      { key: "messaggi.modificare_altrui", label: "Modificare o eliminare i messaggi altrui" },
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
      { key: "annunci.pubblicare", label: "Pubblicare annunci e novità", description: "Notizie in bacheca e bacheche riservate del forum" },
      { key: "contenuti.moderare", label: "Moderare forum e social", description: "Fissare e chiudere discussioni, eliminare post e commenti altrui" },
    ],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_AREAS.flatMap((a) => a.items.map((i) => i.key));
