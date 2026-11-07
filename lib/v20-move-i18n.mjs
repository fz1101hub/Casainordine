// Localized moving checklist titles; offsets and scheduling remain in v20-core.
const TITLES={
 it:['Fotografare le letture finali dei contatori','Contattare fornitori per voltura o subentro','Verificare disdetta o trasferimento internet','Aggiornare domicilio e recapiti','Controllare TARI e regolamento comunale','Verificare depositi, conguagli e ultime bollette','Archiviare contratti, ricevute e verbale di consegna'],
 en:['Photograph final meter readings','Contact utility providers about transfers or new contracts','Check internet cancellation or transfer','Update address and contact details','Check local waste tax and municipal rules','Review deposits, adjustments and final bills','Archive contracts, receipts and handover report'],
 es:['Fotografiar las lecturas finales de los contadores','Contactar con proveedores para cambiar titularidad o contratar servicios','Comprobar la baja o el traslado de internet','Actualizar domicilio y datos de contacto','Revisar la tasa de residuos y la normativa municipal','Comprobar depósitos, ajustes y últimas facturas','Archivar contratos, recibos y acta de entrega'],
 fr:['Photographier les relevés finaux des compteurs','Contacter les fournisseurs pour transférer ou ouvrir les contrats','Vérifier la résiliation ou le transfert internet','Mettre à jour adresse et coordonnées','Vérifier la taxe déchets et les règles municipales','Vérifier dépôts, régularisations et dernières factures','Archiver contrats, reçus et état des lieux'],
 de:['Abschließende Zählerstände fotografieren','Versorger wegen Vertragsübernahme oder Neuanschluss kontaktieren','Internetkündigung oder Umzug prüfen','Adresse und Kontaktdaten aktualisieren','Abfallgebühren und kommunale Regeln prüfen','Kautionen, Nachzahlungen und Schlussrechnungen prüfen','Verträge, Belege und Übergabeprotokoll archivieren'],
 pt:['Fotografar as leituras finais dos contadores','Contactar fornecedores para transferência ou novos contratos','Verificar cancelamento ou transferência da internet','Atualizar morada e contactos','Verificar taxa de resíduos e regras municipais','Conferir cauções, acertos e últimas faturas','Arquivar contratos, recibos e auto de entrega']
};
export function localizedMoveChecklist(checklist,language='it'){
 const lang=typeof language==='string'?language.trim().toLowerCase().split(/[-_]/)[0]:'it';
 const titles=TITLES[lang]||TITLES.it;
 return checklist.map((step,index)=>({...step,title:titles[index]||step.title}));
}
