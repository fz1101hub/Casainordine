import {normalizeLanguage,formatDate} from './i18n.mjs';

const COPY={
 it:{missing_bill:['Bolletta da verificare','Non risulta ricevuta la bolletta attesa intorno al {date}. Controlla la casella e il fornitore.'],fraud:['Importo insolito: verifica la bolletta','{name}: l’importo supera nettamente quelli precedenti. Non indica necessariamente una frode.'],mail_sync:['Controlla il collegamento email','La casella richiede attenzione: {status}.'],move:['Trasloco in programma','{name}: previsto il {date}. Controlla la checklist.'],savings:['Obiettivo di risparmio da rivedere','{name} termina il {date}; l’importo accantonato è ancora inferiore all’obiettivo.'],mailStatus:['Ricollega la casella','Errore di sincronizzazione','Mai sincronizzata','Ultimo controllo oltre 48 ore fa']},
 en:{missing_bill:['Bill to check','The bill expected around {date} has not been received. Check your inbox and supplier.'],fraud:['Unusual amount: check the bill','{name}: the amount is much higher than previous bills. This does not necessarily indicate fraud.'],mail_sync:['Check your email connection','Your mailbox needs attention: {status}.'],move:['Upcoming move','{name}: scheduled for {date}. Review your checklist.'],savings:['Review savings goal','{name} ends on {date}; the amount saved is still below the target.'],mailStatus:['Reconnect your mailbox','Synchronization error','Never synchronized','Last check was over 48 hours ago']},
 es:{missing_bill:['Factura pendiente de verificar','No se ha recibido la factura esperada alrededor del {date}. Revisa el correo y el proveedor.'],fraud:['Importe inusual: revisa la factura','{name}: el importe supera ampliamente los anteriores. No implica necesariamente un fraude.'],mail_sync:['Revisa la conexión del correo','Tu buzón requiere atención: {status}.'],move:['Mudanza próxima','{name}: prevista para el {date}. Revisa la lista de tareas.'],savings:['Revisa el objetivo de ahorro','{name} termina el {date}; lo ahorrado aún no alcanza el objetivo.'],mailStatus:['Vuelve a conectar el buzón','Error de sincronización','Nunca sincronizado','Última comprobación hace más de 48 horas']},
 fr:{missing_bill:['Facture à vérifier','La facture attendue vers le {date} n’a pas été reçue. Vérifiez votre messagerie et le fournisseur.'],fraud:['Montant inhabituel : vérifiez la facture','{name} : le montant dépasse nettement les précédents. Cela ne signifie pas nécessairement une fraude.'],mail_sync:['Vérifiez la connexion e-mail','Votre messagerie nécessite une vérification : {status}.'],move:['Déménagement à venir','{name} : prévu le {date}. Vérifiez votre liste de tâches.'],savings:['Vérifiez l’objectif d’épargne','{name} se termine le {date} ; l’épargne reste inférieure à l’objectif.'],mailStatus:['Reconnectez votre messagerie','Erreur de synchronisation','Jamais synchronisée','Dernière vérification il y a plus de 48 heures']},
 de:{missing_bill:['Rechnung prüfen','Die für etwa den {date} erwartete Rechnung ist nicht eingegangen. Postfach und Anbieter prüfen.'],fraud:['Ungewöhnlicher Betrag: Rechnung prüfen','{name}: Der Betrag liegt deutlich über früheren Rechnungen. Das bedeutet nicht zwangsläufig Betrug.'],mail_sync:['E-Mail-Verbindung prüfen','Ihr Postfach benötigt Aufmerksamkeit: {status}.'],move:['Bevorstehender Umzug','{name}: geplant für den {date}. Checkliste prüfen.'],savings:['Sparziel überprüfen','{name} endet am {date}; der gesparte Betrag liegt noch unter dem Ziel.'],mailStatus:['Postfach erneut verbinden','Synchronisierungsfehler','Noch nie synchronisiert','Letzte Prüfung vor mehr als 48 Stunden']},
 pt:{missing_bill:['Fatura por verificar','A fatura esperada por volta de {date} não foi recebida. Verifique o email e o fornecedor.'],fraud:['Valor invulgar: verifique a fatura','{name}: o valor é muito superior aos anteriores. Não indica necessariamente fraude.'],mail_sync:['Verifique a ligação de email','A caixa de correio requer atenção: {status}.'],move:['Mudança de casa próxima','{name}: prevista para {date}. Verifique a lista de tarefas.'],savings:['Reveja o objetivo de poupança','{name} termina em {date}; o montante poupado ainda é inferior ao objetivo.'],mailStatus:['Volte a ligar a caixa de correio','Erro de sincronização','Nunca sincronizada','Última verificação há mais de 48 horas']}
};
const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g,' ').replace(/\s+/g,' ').trim().slice(0,160).trim();
export function v20AlertCopy(event,language='it'){
 const c=COPY[normalizeLanguage(language)],kind=event?.kind;
 if(!['missing_bill','fraud','mail_sync','move','savings'].includes(kind))throw new TypeError('Invalid alert kind');
 const source=event.source||{};
 const name=clean(kind==='missing_bill'?source.supplier:kind==='fraud'?source.supplier:kind==='move'?source.title:source.label);
 let date='';
 if(['missing_bill','move','savings'].includes(kind)){
  const iso=kind==='missing_bill'?source.expected_on:kind==='move'?source.move_on:source.deadline;
  date=formatDate(iso,language);
  if(date==='—')throw new TypeError('Invalid alert date');
 }
 if(kind!=='mail_sync'&&!name)throw new TypeError('Missing alert name');
 const statuses={reconnect:0,error:1,never:2,stale:3};
 const status=source.mail_status;
 if(kind==='mail_sync'&&!Object.hasOwn(statuses,status))throw new TypeError('Invalid mailbox status');
 const [title,template]=c[kind];
 return {title:kind==='missing_bill'?title+': '+name:title,
  body:template.replace('{date}',date).replace('{name}',name).replace('{status}',kind==='mail_sync'?c.mailStatus[statuses[status]]:'')};
}
