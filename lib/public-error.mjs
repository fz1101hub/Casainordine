// Errore che si può far vedere a chi usa l'app: porta il codice di un messaggio del dizionario
// («api.<codice>»). Il browser mostra il testo nella sua lingua (lib/friendly-error.mjs, apiErrorText).
export function publicError(code) { return Object.assign(new Error(code), { public: true, code }); }
