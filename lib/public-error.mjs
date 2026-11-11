// Errore pensato per chi usa l'app (dati inseriti non validi e simili): il suo messaggio si può
// mostrare nel browser. Gli altri errori restano nei log del server (vedi failure in server.mjs).
// Modulo a parte perché lo usano anche file caricati nel browser (mail-providers.mjs).
export function publicError(message) { return Object.assign(new Error(message), { public: true }); }
