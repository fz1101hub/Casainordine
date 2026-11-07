import {normalizeLanguage,formatDate} from './i18n.mjs';

// Recipient-specific copy; identifiers and original source records remain unchanged.
const COPY={
 it:{contract:'Contratto',contractBody:'{service} scade o si rinnova il {date}. Verifica le condizioni.',meter:'Autolettura',meterBody:"Comunicare l’autolettura entro il {date}.",maintenance:'Manutenzione',maintenanceBody:'Intervento previsto il {date}.',warranty:'Garanzia',warrantyBody:'Scade il {date}. Controlla la copertura.'},
 en:{contract:'Contract',contractBody:'{service} expires or renews on {date}. Check the terms.',meter:'Meter reading',meterBody:'Submit the meter reading by {date}.',maintenance:'Maintenance',maintenanceBody:'Service scheduled for {date}.',warranty:'Warranty',warrantyBody:'Expires on {date}. Check your coverage.'},
 es:{contract:'Contrato',contractBody:'{service} vence o se renueva el {date}. Revisa las condiciones.',meter:'Lectura del contador',meterBody:'Comunica la lectura antes del {date}.',maintenance:'Mantenimiento',maintenanceBody:'Intervención prevista para el {date}.',warranty:'Garantía',warrantyBody:'Vence el {date}. Comprueba la cobertura.'},
 fr:{contract:'Contrat',contractBody:'{service} expire ou se renouvelle le {date}. Vérifiez les conditions.',meter:'Relevé du compteur',meterBody:'Transmettez le relevé avant le {date}.',maintenance:'Entretien',maintenanceBody:'Intervention prévue le {date}.',warranty:'Garantie',warrantyBody:'Expire le {date}. Vérifiez la couverture.'},
 de:{contract:'Vertrag',contractBody:'{service} läuft am {date} ab oder verlängert sich. Bedingungen prüfen.',meter:'Zählerstand',meterBody:'Zählerstand bis zum {date} melden.',maintenance:'Wartung',maintenanceBody:'Wartung geplant für den {date}.',warranty:'Garantie',warrantyBody:'Läuft am {date} ab. Deckung prüfen.'},
 pt:{contract:'Contrato',contractBody:'{service} termina ou renova-se em {date}. Verifique as condições.',meter:'Leitura do contador',meterBody:'Comunique a leitura até {date}.',maintenance:'Manutenção',maintenanceBody:'Intervenção prevista para {date}.',warranty:'Garantia',warrantyBody:'Termina em {date}. Verifique a cobertura.'}
};
const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g,' ').replace(/\s+/g,' ').trim().slice(0,160).trim();
export function extraAlertCopy(event,language='it'){
 const lang=normalizeLanguage(language),c=COPY[lang],kind=event?.kind;
 if(!['contract','meter','maintenance','warranty'].includes(kind))throw new TypeError('Invalid alert kind');
 const source=event.source||{};
 const name=clean(kind==='contract'?source.supplier:kind==='meter'?source.meter_name:source.name);
 if(!name)throw new TypeError('Missing alert name');
 const dateValue=kind==='contract'?source.renewal_on:kind==='meter'?source.next_due_on:kind==='maintenance'?source.next_service_on:source.warranty_until;
 if(typeof dateValue!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateValue))throw new TypeError('Invalid alert date');
 const date=formatDate(dateValue,lang);
 if(date==='—')throw new TypeError('Invalid alert date');
 const service=kind==='contract'?clean(source.service):'';
 const body=c[kind+'Body'].replace('{date}',date).replace('{service}',service||name);
 return {title:c[kind]+': '+name,body};
}
