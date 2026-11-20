import { acceptedLanguage } from './i18n-core.mjs';

// Messaggi propri dell'API OAuth: mai tradurre risposte di provider esterni.
const MESSAGES = Object.freeze({
  login: ['Accedi per collegare una casella.','Sign in to connect a mailbox.','Inicia sesión para conectar un buzón.','Connectez-vous pour associer une boîte mail.','Melden Sie sich an, um ein Postfach zu verbinden.','Inicie sessão para ligar uma caixa de correio.'],
  provider: ['Questo provider non usa OAuth.','This provider does not use OAuth.','Este proveedor no utiliza OAuth.','Ce fournisseur n’utilise pas OAuth.','Dieser Anbieter verwendet kein OAuth.','Este fornecedor não utiliza OAuth.'],
  rate: ['Troppi tentativi di collegamento: riprova tra 10 minuti.','Too many connection attempts: try again in 10 minutes.','Demasiados intentos de conexión: vuelve a intentarlo en 10 minutos.','Trop de tentatives de connexion : réessayez dans 10 minutes.','Zu viele Verbindungsversuche: Versuchen Sie es in 10 Minuten erneut.','Demasiadas tentativas de ligação: tente novamente dentro de 10 minutos.'],
  failure: ['Impossibile avviare il collegamento della casella: riprova più tardi.','Unable to start mailbox connection: try again later.','No se pudo iniciar la conexión del buzón: inténtalo más tarde.','Impossible de démarrer la connexion de la boîte mail : réessayez plus tard.','Postfachverbindung konnte nicht gestartet werden: Versuchen Sie es später erneut.','Não foi possível iniciar a ligação da caixa de correio: tente novamente mais tarde.']
});
const CODES=['it','en','es','fr','de','pt'];
export function mailStartMessage(key, acceptLanguage) {
  const index=CODES.indexOf(acceptedLanguage(acceptLanguage));
  return (MESSAGES[key]||MESSAGES.failure)[index<0?0:index];
}
