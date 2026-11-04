const COPY={
 it:['Monitoraggio e sicurezza','Controlli automatici, avvisi sulle bollette mancanti e salute delle caselle email.','Bollette che potrebbero mancare','Collegamenti email','Segnalazioni automatiche','Verifica bollette','Segnala anomalie, senza presumere che siano truffe e senza approvare pagamenti.','Analizza una bolletta','Verifiche registrate'],
 en:['Monitoring and security','Automatic checks, missing bill alerts and mailbox connection health.','Potentially missing bills','Email connections','Automatic alerts','Check bills','Flag unusual activity without assuming fraud or approving payments.','Analyze a bill','Saved reviews'],
 es:['Supervisión y seguridad','Controles automáticos, avisos de facturas ausentes y estado de las conexiones de correo.','Posibles facturas ausentes','Conexiones de correo','Alertas automáticas','Revisar facturas','Detecta anomalías sin presumir fraude ni aprobar pagos.','Analizar una factura','Revisiones guardadas'],
 fr:['Suivi et sécurité','Contrôles automatiques, alertes de factures manquantes et état des connexions e-mail.','Factures potentiellement manquantes','Connexions e-mail','Alertes automatiques','Vérifier les factures','Signalez les anomalies sans présumer de fraude ni autoriser de paiements.','Analyser une facture','Vérifications enregistrées'],
 de:['Überwachung und Sicherheit','Automatische Prüfungen, Hinweise auf fehlende Rechnungen und Status der E-Mail-Verbindungen.','Möglicherweise fehlende Rechnungen','E-Mail-Verbindungen','Automatische Hinweise','Rechnungen prüfen','Auffälligkeiten melden, ohne Betrug zu unterstellen oder Zahlungen freizugeben.','Rechnung analysieren','Gespeicherte Prüfungen'],
 pt:['Monitorização e segurança','Verificações automáticas, alertas de faturas em falta e estado das ligações de email.','Possíveis faturas em falta','Ligações de email','Alertas automáticos','Verificar faturas','Assinale anomalias sem presumir fraude nem autorizar pagamentos.','Analisar uma fatura','Verificações guardadas']
};
const KEYS=['monitorTitle','monitorDescription','missingBills','mailConnections','automaticAlerts','fraudTitle','fraudDescription','analyzeBill','savedReviews'];
export function v20UiCopy(language='it'){
 const lang=['it','en','es','fr','de','pt'].includes(language)?language:'it';
 return Object.fromEntries(KEYS.map((key,i)=>[key,COPY[lang][i]]));
}
