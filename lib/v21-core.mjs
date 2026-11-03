// Casa in Ordine 2.1 — pure, deterministic rules. No AI, payment initiation or safety certification.
const DAY=86400000;
const iso=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))&&!Number.isNaN(Date.parse(s+'T12:00:00Z'));
const days=(a,b)=>iso(a)&&iso(b)?Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/DAY):null;
const name=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('it').trim().replace(/\s+/g,' ');
const safeMoney=x=>{const n=Number(x);return Number.isFinite(n)&&n>=0&&n<=1e8?n:null};
const fixedCategory=s=>/internet|fibra|telefono|telefonia|mobile|abbonamento/i.test(String(s||''));
export function detectBillingInconsistencies({bills=[],contracts=[],refunds=[]}={}){
 const out=[];const distinct=new Set();
 const add=(code,bill,detail)=>{const id=String(bill?.id||'');const k=`${code}/${id}`;if(!id||distinct.has(k))return;distinct.add(k);out.push({code,bill_id:id,title:String(bill.title||bill.supplier||'Bolletta'),detail,severity:code==='duplicate'?'high':'medium'});};
 const source=(bills||[]).filter(b=>!b.is_estimate&&b.source!=='recurring'&&b.id&&name(b.supplier));
 for(let i=0;i<source.length;i++){
  const a=source[i];for(let j=0;j<i;j++){
   const b=source[j];if((a.home_id||null)!==(b.home_id||null))continue;
   if(!a.home_id&&a.user_id&&b.user_id&&a.user_id!==b.user_id)continue;
   if(name(a.supplier)!==name(b.supplier)||name(a.category)!==name(b.category))continue;
   const samePeriod=!!a.period_start&&!!a.period_end&&a.period_start===b.period_start&&a.period_end===b.period_end;
   const sameReference=!!a.external_id&&!!b.external_id&&a.external_id===b.external_id;
   if(samePeriod||sameReference){
    const sameAmount=Math.abs(Number(a.amount)-Number(b.amount))<=0.01;
    if(sameAmount)add('duplicate',a,`Possibile fattura duplicata rispetto a ${b.title||b.supplier}. Verifica numero e periodo.`);
    else if(b.paid_at)add('repeat_paid_period',a,`Esiste già una bolletta saldata per lo stesso periodo. Potrebbe trattarsi di un conguaglio o di un duplicato: verifica.`);
    else add('overlapping_period',a,'Due documenti sembrano riferirsi allo stesso periodo ma hanno importi diversi: verifica conguagli e note di credito.');
    break;
   }
  }
  const contract=(contracts||[]).find(c=>name(c.supplier)===name(a.supplier)&&fixedCategory(c.service||a.category)&&safeMoney(c.offer_price)!==null&&Number(c.offer_price)>0&&(c.home_id||null)===(a.home_id||null));
  if(contract&&fixedCategory(a.category)&&safeMoney(a.amount)!==null&&Number(a.amount)>Number(contract.offer_price)*1.25&&Number(a.amount)-Number(contract.offer_price)>=5){add('contract_difference',a,`Importo superiore al prezzo indicativo del contratto (${Number(contract.offer_price).toFixed(2)} €). Verifica le condizioni.`);}
 }
 for(const r of refunds||[]){if(r.status!=='received'&&iso(r.expected_on)&&r.expected_on<new Date().toISOString().slice(0,10))out.push({code:'refund_late',bill_id:r.bill_id||null,title:r.label||'Rimborso',detail:'Rimborso previsto ma non ancora registrato: controlla l’accredito.',severity:'medium'});}
 return out;
}
export function simulateScenario({monthlyBaseline,consumptionShare=30,consumptionReduction=0,otherDelta=0,unexpectedCost=0,months=12}={}){
 const baseline=safeMoney(monthlyBaseline),share=Number(consumptionShare),saving=Number(consumptionReduction),other=Number(otherDelta),shock=safeMoney(unexpectedCost),term=Number(months);
 if(baseline===null||shock===null||![share,saving,other].every(Number.isFinite)||share<0||share>100||saving<0||saving>100||other< -100||other>300||!Number.isInteger(term)||term<1||term>60)return null;
 const energy=baseline*share/100,rest=baseline-energy;
 const adjusted=energy*(1-saving/100)+rest*(1+other/100);
 return {baselineMonthly:baseline,forecastMonthly:Math.round(adjusted*100)/100,forecastTotal:Math.round((adjusted*term+shock)*100)/100,changeVsBaseline:Math.round(((adjusted-baseline)*term+shock)*100)/100,months:term,illustrative:true};
}
export const VACATION_CHECKLIST=[
 'Verificare porte, finestre e dispositivi elettrici non necessari',
 'Controllare eventuali scadenze e addebiti durante l’assenza',
 'Registrare contatti di emergenza e persona incaricata',
 'Indicare dove chiudere acqua e gas, senza divulgare codici di accesso',
 'Organizzare posta, piante e animali domestici',
 'Controllare al rientro perdite, impianti e contatori'
];
export function tallyVotes(votes=[],decisionId){const result={yes:0,no:0,abstain:0,total:0};const seen=new Set();for(const row of votes){if(decisionId&&row.decision_id!==decisionId)continue;if(!row.user_id||seen.has(row.user_id)||!['yes','no','abstain'].includes(row.choice))continue;seen.add(row.user_id);result[row.choice]++;result.total++;}return result;}
export function inventorySummary(items=[]){const valid=(items||[]).map(x=>safeMoney(x.estimated_value)).filter(x=>x!==null);return {count:items.length,documented:items.filter(x=>!!x.document_id).length,estimatedTotal:Math.round(valid.reduce((a,b)=>a+b,0)*100)/100};}
export function safePropertyPassport({property,assets=[],contracts=[],documents=[],events=[],includeAddress=false,includeSerials=false}={}){
 if(!property?.id)return null;
 const belongs=x=>x.property_id===property.id;
 return {generated_at:new Date().toISOString(),notice:'Riepilogo informativo: non sostituisce certificazioni ufficiali.',property:{label:String(property.label||'Immobile').slice(0,120),kind:property.kind, ...(includeAddress?{address:String(property.address||'').slice(0,350)}:{})},
  assets:assets.filter(belongs).map(a=>({name:a.name,category:a.category,model:a.model||'',warranty_until:a.warranty_until||null,next_service_on:a.next_service_on||null,...(includeSerials?{serial:a.serial_number||''}:{})})),
  contracts:contracts.filter(belongs).map(c=>({supplier:c.supplier,service:c.service,renewal_on:c.renewal_on||null})),
  documents:documents.filter(belongs).map(d=>({name:d.name,doc_type:d.doc_type})),
  maintenance:events.filter(e=>assets.some(a=>belongs(a)&&a.id===e.asset_id)).map(e=>({done_on:e.done_on,description:e.description,cost:Number(e.cost)||0}))};
}
export function buildFiveMinuteBriefing({bills=[],assets=[],contracts=[],tasks=[],decisions=[],inventory=[],today}={}){
 if(!iso(today))return [];
 const issues=[];const push=(id,weight,label,detail,section)=>issues.push({id,weight,label,detail,section});
 for(const b of bills){if(b.paid_at||!iso(b.due_date))continue;const delta=days(b.due_date,today);if(delta<0)push('bill-'+b.id,100+Math.min(30,-delta),`Bolletta scaduta: ${b.title||b.supplier}`,b.due_date,'bills');else if(delta<=3)push('bill-'+b.id,85,`Pagamento entro ${delta} giorni: ${b.title||b.supplier}`,b.due_date,'bills');}
 for(const a of assets){if(iso(a.next_service_on)&&days(a.next_service_on,today)<=14)push('asset-'+a.id,65,`Manutenzione: ${a.name}`,a.next_service_on,'maintenance');}
 for(const c of contracts){if(iso(c.renewal_on)&&days(c.renewal_on,today)<=30)push('contract-'+c.id,55,`Rinnovo contratto: ${c.supplier}`,c.renewal_on,'contracts');}
 for(const t of tasks){if(!t.done_at&&iso(t.due_date)&&days(t.due_date,today)<=7)push('task-'+t.id,40,`Attività da completare: ${t.title}`,t.due_date,'tasks');}
 for(const d of decisions){if(d.status==='open'&&(!d.closes_on||days(d.closes_on,today)<=7))push('decision-'+d.id,35,`Decisione familiare: ${d.title}`,d.closes_on||'Da valutare','decisions');}
 for(const item of inventory){if(!item.document_id&&safeMoney(item.estimated_value)>200)push('inventory-'+item.id,10,`Aggiungi una prova d'acquisto: ${item.name}`,'Nessuna ricevuta collegata','inventory');}
 return issues.sort((a,b)=>b.weight-a.weight||a.id.localeCompare(b.id)).slice(0,5);
}
export function assetQrUrl(origin,id){if(!/^https:\/\/[^/?#]+$/i.test(origin)||!(/^[0-9a-f-]{36}$/i.test(id)))return null;return `${origin}/?asset=${encodeURIComponent(id)}`;}
