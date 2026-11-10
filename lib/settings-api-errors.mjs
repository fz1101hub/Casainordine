// Translate only known server responses. Unknown diagnostic messages remain unchanged.
const messages={
 'Non autorizzato':['Non autorizzato','Not authorized','No autorizado','Non autorisé','Nicht autorisiert','Não autorizado'],
 'Sottoscrizione push non valida':['Sottoscrizione push non valida','Invalid push subscription','Suscripción push no válida','Abonnement push non valide','Ungültiges Push-Abonnement','Subscrição push inválida'],
 'Questo dispositivo risulta già associato a un altro account':['Questo dispositivo risulta già associato a un altro account','This device is already linked to another account','Este dispositivo ya está vinculado a otra cuenta','Cet appareil est déjà associé à un autre compte','Dieses Gerät ist bereits mit einem anderen Konto verknüpft','Este dispositivo já está associado a outra conta'],
 'Endpoint richiesto':['Endpoint richiesto','Endpoint required','Se requiere un endpoint','Point de terminaison requis','Endpunkt erforderlich','Endpoint obrigatório']
};
const languages=['it','en','es','fr','de','pt'];
export function localizeSettingsApiError(message,language){
 const key=String(message||'');
 const index=languages.indexOf(String(language||'').toLowerCase().split(/[-_]/)[0]);
 return messages[key]?.[index<0?0:index]??key;
}
