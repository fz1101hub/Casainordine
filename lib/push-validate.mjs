const trustedHosts=new Set(['fcm.googleapis.com','android.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com','web.push.apple.com','push.apple.com']);
export function validPushSubscription(body){
 if(!body||typeof body!=='object')return null;
 let url;try{url=new URL(body.endpoint);}catch{return null;}
 const host=url.hostname.toLowerCase();
 if(url.protocol!=='https:'||url.username||url.password||url.port||(!trustedHosts.has(host)&&!host.endsWith('.push.apple.com'))||body.endpoint.length>2048)return null;
 if(!/^[-_a-zA-Z0-9]{40,200}$/.test(body.keys?.p256dh||'')||!/^[-_a-zA-Z0-9]{15,100}$/.test(body.keys?.auth||''))return null;
 return {endpoint:url.href,p256dh:body.keys.p256dh,auth_secret:body.keys.auth};
}
