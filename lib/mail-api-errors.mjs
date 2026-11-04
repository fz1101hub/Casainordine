// Client-only localization of known legacy mail API errors.
// Unknown messages are intentionally preserved for diagnostics and compatibility.
const MESSAGES={
 'Non autorizzato':['Non autorizzato','Unauthorized','No autorizado','Non autorisé','Nicht autorisiert','Não autorizado'],
 'ID non valido':['ID non valido','Invalid ID','ID no válido','Identifiant invalide','Ungültige ID','ID inválido'],
 'Casella non trovata':['Casella non trovata','Mailbox not found','Buzón no encontrado','Boîte mail introuvable','Postfach nicht gefunden','Caixa de correio não encontrada'],
 'Richiesta non valida.':['Richiesta non valida.','Invalid request.','Solicitud no válida.','Requête invalide.','Ungültige Anfrage.','Pedido inválido.'],
 'Ricollega l’account prima di sincronizzare.':['Ricollega l’account prima di sincronizzare.','Reconnect the account before syncing.','Vuelve a conectar la cuenta antes de sincronizar.','Reconnectez le compte avant la synchronisation.','Konto vor der Synchronisierung erneut verbinden.','Volte a ligar a conta antes de sincronizar.'],
 'Sincronizzazione già eseguita recentemente. Riprova tra 5 minuti.':['Sincronizzazione già eseguita recentemente. Riprova tra 5 minuti.','Recently synchronized. Try again in 5 minutes.','Sincronización reciente. Inténtalo de nuevo en 5 minutos.','Synchronisation récente. Réessayez dans 5 minutes.','Kürzlich synchronisiert. In 5 Minuten erneut versuchen.','Sincronização recente. Tente novamente dentro de 5 minutos.'],
 'Scegli una bolletta da associare al pagamento.':['Scegli una bolletta da associare al pagamento.','Choose a bill to associate with the payment.','Elige una factura para asociar al pago.','Choisissez une facture à associer au paiement.','Wählen Sie eine Rechnung für die Zahlung.','Escolha uma fatura para associar ao pagamento.'],
 'Bolletta non trovata.':['Bolletta non trovata.','Bill not found.','Factura no encontrada.','Facture introuvable.','Rechnung nicht gefunden.','Fatura não encontrada.'],
 'Questa bolletta è già segnata come pagata.':['Questa bolletta è già segnata come pagata.','This bill is already marked as paid.','Esta factura ya está marcada como pagada.','Cette facture est déjà marquée comme payée.','Diese Rechnung ist bereits als bezahlt markiert.','Esta fatura já está marcada como paga.']
};
const LANGS=['it','en','es','fr','de','pt'];
export function localizeMailApiMessage(message,language='it'){
 if(typeof message!=='string'||!message)return message;
 const normalized=message.trim().replace(/\.$/,'');
 const key=Object.keys(MESSAGES).find(x=>x.replace(/\.$/,'')===normalized);
 if(!key)return message;
 const lang=String(language||'it').toLowerCase().split(/[-_]/)[0];
 return MESSAGES[key][Math.max(0,LANGS.indexOf(lang))];
}
