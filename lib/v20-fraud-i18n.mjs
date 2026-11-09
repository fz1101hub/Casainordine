// Render fraud signals by stable ID; preserve historical labels only for unknown IDs.
const LABELS={
 high_amount:{it:'Importo elevato rispetto alla mediana ({amount})',en:'Amount unusually high compared with the median ({amount})',es:'Importe elevado respecto a la mediana ({amount})',fr:'Montant élevé par rapport à la médiane ({amount})',de:'Betrag deutlich über dem Median ({amount})',pt:'Valor elevado face à mediana ({amount})'},
 failed_auth:{it:'Controlli di autenticazione del mittente non superati',en:'Sender authentication checks failed',es:'Fallaron las comprobaciones de autenticación del remitente',fr:"Échec des contrôles d’authentification de l’expéditeur",de:'Authentifizierungsprüfungen des Absenders fehlgeschlagen',pt:'Falha nas verificações de autenticação do remetente'},
 new_sender:{it:'Mittente non ancora confermato',en:'Sender not yet verified',es:'Remitente aún no confirmado',fr:'Expéditeur pas encore confirmé',de:'Absender noch nicht bestätigt',pt:'Remetente ainda não confirmado'},
 iban_change:{it:'IBAN diverso da quelli precedentemente verificati',en:'IBAN differs from previously verified accounts',es:'IBAN distinto de los verificados anteriormente',fr:'IBAN différent de ceux vérifiés auparavant',de:'IBAN weicht von zuvor geprüften Konten ab',pt:'IBAN diferente dos anteriormente verificados'}
};
export function localizedFraudFlag(flag,language='it',baseline=null,locale='it-IT'){
 const id=flag?.id;
 if(!Object.hasOwn(LABELS,id))return String(flag?.label||'');
 const template=LABELS[id][language]||LABELS[id].it;
 if(id!=='high_amount')return template;
 const value=Number(baseline);
 if(!Number.isFinite(value)||value<0)return template.replace(' ({amount})','').replace(' ({amount})','').replace(' ({amount})','');
 let amount;
 try{amount=new Intl.NumberFormat(locale,{style:'currency',currency:'EUR'}).format(value)}
 catch{amount=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(value)}
 return template.replace('{amount}',amount);
}
