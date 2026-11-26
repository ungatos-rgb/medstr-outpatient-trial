const cacheName='medstr-trial-v8';
const assets=['./','./index.html','./style.css','./app.js','./data.json','./manifest.webmanifest','./icon-192.png','./icon-512.png','./mascot.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(assets))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('medstr-trial-')&&k!==cacheName).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||!event.request.url.startsWith(self.registration.scope))return;
  event.respondWith(fetch(event.request).catch(async()=>{
    const cache=await caches.open(cacheName);
    return await cache.match(event.request.mode==='navigate'?'./index.html':event.request)||Response.error();
  }));
});
