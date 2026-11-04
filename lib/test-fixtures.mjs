// Synthetic data for Casa in Ordine's isolated, no-login test drive.
// Never written to Supabase; all edits happen only in the visitor's browser.
import {addDaysISO,todayRome} from './dates.mjs';

export const DEMO_STORAGE_KEY='casainordine-prova-dati-v1';
const plus=(today,n)=>addDaysISO(today,n);
export function createDemoFixtures(today=todayRome()){
  return {
    bills:[
      {id:'bill-electric',title:'Bolletta luce',supplier:'Energia Esempio',category:'Luce',amount:86.40,due_date:plus(today,3),paid_at:null},
      {id:'bill-gas',title:'Bolletta gas',supplier:'Gas di Prova',category:'Gas',amount:112.70,due_date:plus(today,-2),paid_at:null},
      {id:'bill-internet',title:'Fibra internet',supplier:'Rete Demo',category:'Internet',amount:29.90,due_date:plus(today,9),paid_at:null},
      {id:'bill-water',title:'Acqua e fognatura',supplier:'Acquedotto Esempio',category:'Acqua',amount:43.20,due_date:plus(today,13),paid_at:null},
      {id:'bill-condo',title:'Condominio',supplier:'Amministrazione Demo',category:'Condominio',amount:165,due_date:plus(today,24),paid_at:null},
      {id:'bill-mobile',title:'Telefonia mobile',supplier:'Mobile Esempio',category:'Telefono',amount:14.99,due_date:plus(today,-8),paid_at:today+'T10:00:00Z'}
    ],
    tasks:[
      {id:'task-boiler',title:'Controllare la caldaia',due_date:plus(today,1),done_at:null},
      {id:'task-filter',title:'Pulire il filtro del climatizzatore',due_date:plus(today,4),done_at:null},
      {id:'task-bins',title:'Portare fuori la raccolta differenziata',due_date:plus(today,2),done_at:null},
      {id:'task-windows',title:'Verificare le guarnizioni delle finestre',due_date:plus(today,11),done_at:null},
      {id:'task-meter',title:'Comunicare la lettura dell’acqua',due_date:plus(today,-5),done_at:today+'T09:00:00Z'}
    ],
    shopping:[
      {id:'shop-milk',title:'Latte',quantity:'2 litri',checked:false},
      {id:'shop-bread',title:'Pane',quantity:'1 confezione',checked:false},
      {id:'shop-pasta',title:'Pasta',quantity:'2 pacchi',checked:false},
      {id:'shop-detergent',title:'Detersivo piatti',quantity:'1 flacone',checked:false},
      {id:'shop-fruit',title:'Frutta di stagione',quantity:'1 kg',checked:false},
      {id:'shop-rice',title:'Riso',quantity:'1 pacco',checked:true}
    ],
    assets:[{id:'asset-boiler',name:'Caldaia',next_service_on:plus(today,6)}],
    contracts:[{id:'contract-internet',supplier:'Rete Demo',renewal_on:plus(today,25)}],
    decisions:[{id:'decision-paint',title:'Scegliere il colore della cucina',status:'open',closes_on:plus(today,6)}],
    inventory:[]
  };
}
// Reject invalid locally stored state instead of trusting data from old versions.
export function restoreDemoFixtures(data,today=todayRome()){
  const baseline=createDemoFixtures(today);
  if(!data||typeof data!=='object')return baseline;
  const restore=(key)=>Array.isArray(data[key])
    ? baseline[key].map(item=>{
       const stored=data[key].find(x=>x&&x.id===item.id);
       if(!stored)return item;
       if(key==='bills')return {...item,paid_at:stored.paid_at===null||typeof stored.paid_at==='string'?stored.paid_at:item.paid_at};
       if(key==='tasks')return {...item,done_at:stored.done_at===null||typeof stored.done_at==='string'?stored.done_at:item.done_at};
       if(key==='shopping')return {...item,checked:typeof stored.checked==='boolean'?stored.checked:item.checked};
       return item;
      })
    : baseline[key];
  return {...baseline,bills:restore('bills'),tasks:restore('tasks'),shopping:restore('shopping')};
}
