// Preferenze delle notifiche push: tipo acceso o spento e orario silenzioso (ora di Roma).
// Separate da extra-alerts.mjs perché le usano anche le push rinviate (lib/push-deferred.mjs).
export function quietTimeRome(preferences,instant=new Date()){
 const from=preferences?.quiet_from?.slice(0,5),to=preferences?.quiet_until?.slice(0,5);
 if(!from||!to||from===to)return false;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant);
 const time=parts.find(p=>p.type==='hour').value+':'+parts.find(p=>p.type==='minute').value;
 return from<to?time>=from&&time<to:time>=from||time<to;
}
const PUSH_PROPERTY={contract:'push_contracts',maintenance:'push_maintenance',warranty:'push_maintenance',meter:'push_maintenance',bill:'push_bills',digest:'push_digest',missing_bill:'push_monitor',mail_sync:'push_monitor',fraud:'push_monitor',move:'push_digest',savings:'push_digest',automation:'push_automations',garden:'push_garden',pet:'push_pets'};
// Il tipo di notifica è acceso (senza guardare l'orario silenzioso).
export function pushKindAllowed(pref,kind){const property=PUSH_PROPERTY[kind];return Boolean(property)&&pref?.[property]!==false;}
export function pushAllowed(pref,kind,instant){
 return pushKindAllowed(pref,kind)&&!quietTimeRome(pref,instant);
}
