// Offline support: serve from cache, refresh in the background. Bump VERSION on each release.
const VERSION='v1';
const FILES=["./", "index.html", "manifest.webmanifest", "campsite/", "campsite/index.html", "campsite/manifest.webmanifest", "slide-out/", "slide-out/index.html", "slide-out/manifest.webmanifest", "assets/style.css", "assets/game.js", "assets/icon-all-180.png", "assets/icon-all-192.png", "assets/icon-all-512.png", "assets/icon-campsite-180.png", "assets/icon-campsite-192.png", "assets/icon-campsite-512.png", "assets/icon-slide-out-180.png", "assets/icon-slide-out-192.png", "assets/icon-slide-out-512.png"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.open(VERSION).then(async c=>{
    const hit=await c.match(e.request,{ignoreSearch:true});
    const net=fetch(e.request).then(r=>{if(r.ok||r.type==='opaque')c.put(e.request,r.clone());return r}).catch(()=>hit);
    return hit||net;
  }));
});
