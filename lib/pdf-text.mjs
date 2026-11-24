// Testo di una pagina PDF: le voci alla stessa altezza sulla stessa riga (usato nel browser da lib/document-reader.js e sul server da lib/mail-attachment.mjs).
// hasEOL dice che la riga finisce DOPO la voce. Prima si andava a capo anche PRIMA di quella voce:
// in una bolletta a colonne «Scadenza | Totale da pagare» e «18/12/2026 | € 156,20» finivano su
// quattro righe e l'importo non si trovava più (tests/bollette-pdf.test.mjs).
export function pageText(items){
  let prevY=null,prevEnd=null,result='';
  for(const item of items){
    if(typeof item.str!=='string')continue;
    const x=item.transform?.[4],y=item.transform?.[5];
    if(prevY!==null && Math.abs(y-prevY)>3)result+='\n';
    else if(result && !result.endsWith('\n') && prevEnd!==null && x > prevEnd+1)result+=' ';
    result+=item.str;
    prevY=y;prevEnd=Number.isFinite(x)?x+(item.width||0):null;
    if(item.hasEOL){result+='\n';prevY=null;prevEnd=null;}
  }
  return result;
}
