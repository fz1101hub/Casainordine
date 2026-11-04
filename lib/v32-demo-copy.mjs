// Presentation-only copy for the public, local-only test drive.
const COPY={
 it:['Navigazione della prova','Chiudi avviso','Da organizzare','Lista condivisa simulata','La casa in 5 minuti','Esempio di scadenze','Casa condivisa · simulazione','Gestione quotidiana','Scadenza: {date}','Un riepilogo semplice','Apri'],
 en:['Demo navigation','Dismiss notice','To organize','Simulated shared list','The home in 5 minutes','Example due dates','Shared home · simulation','Everyday tasks','Due: {date}','A simple summary','Open'],
 es:['Navegación de prueba','Cerrar aviso','Por organizar','Lista compartida simulada','La casa en 5 minutos','Ejemplo de vencimientos','Hogar compartido · simulación','Gestión diaria','Vence: {date}','Un resumen sencillo','Abrir'],
 fr:['Navigation de démonstration','Fermer l’alerte','À organiser','Liste partagée simulée','La maison en 5 minutes','Exemple d’échéances','Maison partagée · simulation','Gestion quotidienne','Échéance : {date}','Un résumé simple','Ouvrir'],
 de:['Demo-Navigation','Hinweis schließen','Zu organisieren','Simulierte gemeinsame Liste','Das Zuhause in 5 Minuten','Beispiel für Fälligkeiten','Gemeinsamer Haushalt · Simulation','Alltagsaufgaben','Fällig: {date}','Eine einfache Übersicht','Öffnen'],
 pt:['Navegação da demonstração','Fechar aviso','Por organizar','Lista partilhada simulada','A casa em 5 minutos','Exemplo de vencimentos','Casa partilhada · simulação','Gestão diária','Prazo: {date}','Um resumo simples','Abrir']
};
const KEYS=['navigation','dismiss','toOrganize','sharedList','fiveMinutes','dueDates','sharedSimulation','dailyTasks','taskDue','simpleSummary','open'];
export function v32DemoCopy(language='it'){
 const values=COPY[language]||COPY.it;
 return Object.fromEntries(KEYS.map((key,i)=>[key,values[i]]));
}
