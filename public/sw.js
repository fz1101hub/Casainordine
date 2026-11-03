// Only static app assets and the offline capture page are cached. No user/API data.
const CACHE='casa-shell-v21';const STATIC=['/offline.html','/offline-standalone.js','/sos-private.js','/icon-192.png','/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',event=>{
 const r=event.request;if(r.method!=='GET'||new URL(r.url).origin!==self.location.origin)return;
 const url=new URL(r.url);
 if(r.mode==='navigate'){event.respondWith(fetch(r).catch(()=>caches.match('/offline.html')));return;}
 if(STATIC.includes(url.pathname)){event.respondWith(caches.match(r).then(hit=>hit||fetch(r)));}
});
self.addEventListener('push',event=>{let data={};try{data=event.data?.json()||{}}catch{};
 const title=typeof data.title==='string'&&data.title.length<100?data.title:'Casa in Ordine';
 const body=typeof data.body==='string'&&data.body.length<200?data.body:'Controlla le scadenze';
 event.waitUntil(self.registration.showNotification(title,{body,icon:'/icon-192.png',badge:'/icon-192.png',tag:'casa-in-ordine',data:{url:'/'}}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(c=>c.find(x=>new URL(x.url).origin===self.location.origin)?.focus()||self.clients.openWindow('/')))});
