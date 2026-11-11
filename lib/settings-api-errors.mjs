// Translate only known server responses. Unknown diagnostic messages remain unchanged.
const messages={
 'Non autorizzato':['Non autorizzato','Not authorized','No autorizado','Non autorisé','Nicht autorisiert','Não autorizado'],
 'Sottoscrizione push non valida':['Sottoscrizione push non valida','Invalid push subscription','Suscripción push no válida','Abonnement push non valide','Ungültiges Push-Abonnement','Subscrição push inválida'],
 'Questo dispositivo risulta già associato a un altro account':['Questo dispositivo risulta già associato a un altro account','This device is already linked to another account','Este dispositivo ya está vinculado a otra cuenta','Cet appareil est déjà associé à un autre compte','Dieses Gerät ist bereits mit einem anderen Konto verknüpft','Este dispositivo já está associado a outra conta'],
 'Endpoint richiesto':['Endpoint richiesto','Endpoint required','Se requiere un endpoint','Point de terminaison requis','Endpunkt erforderlich','Endpoint obrigatório'],
 'Impossibile leggere le notifiche di questo account.':["Impossibile leggere le notifiche di questo account.", "This account’s notifications could not be read.", "No se han podido leer las notificaciones de esta cuenta.", "Impossible de lire les notifications de ce compte.", "Die Benachrichtigungen dieses Kontos konnten nicht gelesen werden.", "Não foi possível ler as notificações desta conta."],
 'Impossibile attivare le notifiche su questo dispositivo.':["Impossibile attivare le notifiche su questo dispositivo.", "Notifications could not be turned on for this device.", "No se han podido activar las notificaciones en este dispositivo.", "Impossible d’activer les notifications sur cet appareil.", "Benachrichtigungen konnten auf diesem Gerät nicht aktiviert werden.", "Não foi possível ativar as notificações neste dispositivo."],
 'Impossibile disattivare le notifiche su questo dispositivo.':["Impossibile disattivare le notifiche su questo dispositivo.", "Notifications could not be turned off for this device.", "No se han podido desactivar las notificaciones en este dispositivo.", "Impossible de désactiver les notifications sur cet appareil.", "Benachrichtigungen konnten auf diesem Gerät nicht deaktiviert werden.", "Não foi possível desativar as notificações neste dispositivo."],
 'Impossibile leggere il calendario.':["Impossibile leggere il calendario.", "The calendar could not be read.", "No se ha podido leer el calendario.", "Impossible de lire le calendrier.", "Der Kalender konnte nicht gelesen werden.", "Não foi possível ler o calendário."],
 'Impossibile creare il collegamento al calendario.':["Impossibile creare il collegamento al calendario.", "The calendar link could not be created.", "No se ha podido crear el enlace al calendario.", "Impossible de créer le lien vers le calendrier.", "Der Kalenderlink konnte nicht erstellt werden.", "Não foi possível criar a ligação ao calendário."],
 'Impossibile disattivare il calendario.':["Impossibile disattivare il calendario.", "The calendar could not be turned off.", "No se ha podido desactivar el calendario.", "Impossible de désactiver le calendrier.", "Der Kalender konnte nicht deaktiviert werden.", "Não foi possível desativar o calendário."],
 'Configurazione del database incompleta':["Configurazione del database incompleta", "Database configuration incomplete", "Configuración de la base de datos incompleta", "Configuration de la base de données incomplète", "Datenbankkonfiguration unvollständig", "Configuração da base de dados incompleta"],
 'Impossibile leggere integrazione':["Impossibile leggere integrazione", "The integration could not be read", "No se ha podido leer la integración", "Impossible de lire l’intégration", "Die Integration konnte nicht gelesen werden", "Não foi possível ler a integração"],
 'Impossibile creare chiave':["Impossibile creare chiave", "The key could not be created", "No se ha podido crear la clave", "Impossible de créer la clé", "Der Schlüssel konnte nicht erstellt werden", "Não foi possível criar a chave"],
 'Impossibile revocare chiave':["Impossibile revocare chiave", "The key could not be revoked", "No se ha podido revocar la clave", "Impossible de révoquer la clé", "Der Schlüssel konnte nicht widerrufen werden", "Não foi possível revogar a chave"],
 'Accesso necessario':["Accesso necessario", "Sign-in required", "Es necesario iniciar sesión", "Connexion requise", "Anmeldung erforderlich", "É necessário iniciar sessão"]
};
const languages=['it','en','es','fr','de','pt'];
export function localizeSettingsApiError(message,language){
 const key=String(message||'');
 const index=languages.indexOf(String(language||'').toLowerCase().split(/[-_]/)[0]);
 return messages[key]?.[index<0?0:index]??key;
}
