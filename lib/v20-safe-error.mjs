// V20 user-facing messages: classify only stable provider codes, never display raw details.
const COPY={
 it:{generic:'Operazione non riuscita. Riprova; se il problema persiste, contatta l’assistenza.',access:'Non hai i permessi per questa operazione.',network:'Connessione non disponibile. Controlla la rete e riprova.',schema:'Funzione temporaneamente non disponibile. Contatta l’assistenza.',rate:'Troppe richieste. Attendi qualche istante e riprova.'},
 en:{generic:'The operation failed. Try again; if the problem persists, contact support.',access:'You do not have permission to perform this operation.',network:'Connection unavailable. Check your network and try again.',schema:'This feature is temporarily unavailable. Contact support.',rate:'Too many requests. Wait a moment and try again.'},
 es:{generic:'No se pudo completar la operación. Inténtalo de nuevo; si el problema continúa, contacta con soporte.',access:'No tienes permiso para realizar esta operación.',network:'No hay conexión disponible. Comprueba tu red e inténtalo de nuevo.',schema:'Esta función no está disponible temporalmente. Contacta con soporte.',rate:'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.'},
 fr:{generic:'L’opération a échoué. Réessayez ; si le problème persiste, contactez l’assistance.',access:'Vous n’avez pas l’autorisation d’effectuer cette opération.',network:'Connexion indisponible. Vérifiez votre réseau et réessayez.',schema:'Cette fonctionnalité est temporairement indisponible. Contactez l’assistance.',rate:'Trop de demandes. Patientez un instant, puis réessayez.'},
 de:{generic:'Der Vorgang ist fehlgeschlagen. Bitte erneut versuchen; falls das Problem weiterhin besteht, den Support kontaktieren.',access:'Du hast keine Berechtigung für diesen Vorgang.',network:'Keine Verbindung verfügbar. Bitte Netzwerk prüfen und erneut versuchen.',schema:'Diese Funktion ist vorübergehend nicht verfügbar. Bitte den Support kontaktieren.',rate:'Zu viele Anfragen. Bitte kurz warten und erneut versuchen.'},
 pt:{generic:'Não foi possível concluir a operação. Tente novamente; se o problema persistir, contacte o apoio.',access:'Não tem permissão para realizar esta operação.',network:'Ligação indisponível. Verifique a rede e tente novamente.',schema:'Esta funcionalidade está temporariamente indisponível. Contacte o apoio.',rate:'Demasiados pedidos. Aguarde um momento e tente novamente.'}
};
// Only trusted structured codes; never infer a category from arbitrary message text.
export function v20ErrorCategory(error){
 const code=typeof error?.code==='string'?error.code:'';
 const status=Number.isInteger(error?.status)?error.status:null;
 if(code==='42501'||status===401||status===403)return 'access';
 if(status===429)return 'rate';
 if(code==='42P01'||code==='42703'||code==='PGRST202'||code==='PGRST205')return 'schema';
 if(code==='NETWORK_ERROR'||code==='FETCH_ERROR'||status===0)return 'network';
 return 'generic';
}
export function v20SafeError(language='it',error=null){
 const locale=typeof language==='string'?language.toLowerCase().slice(0,2):'it';
 return (COPY[locale]||COPY.it)[v20ErrorCategory(error)];
}
