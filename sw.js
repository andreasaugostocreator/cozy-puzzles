// Offline support: network first (so updates land right away), cache as fallback. Bump VERSION on each release.
const VERSION='v6';
const FILES=["./", "index.html", "manifest.webmanifest", "campsite/", "campsite/index.html", "campsite/manifest.webmanifest", "slide-out/", "slide-out/index.html", "slide-out/manifest.webmanifest", "assets/style.css", "assets/game.js", "assets/icon-all-180.png", "assets/icon-all-192.png", "assets/icon-all-512.png", "assets/icon-campsite-180.png", "assets/icon-campsite-192.png", "assets/icon-campsite-512.png", "assets/icon-slide-out-180.png", "assets/icon-slide-out-192.png", "assets/icon-slide-out-512.png", "assets/slide-out.js", "assets/slide-out.css", "laser-paws/", "laser-paws/index.html", "laser-paws/manifest.webmanifest", "assets/laser-core.js", "assets/laser-paws.js", "assets/laser-paws.css", "assets/laser-levels.json", "assets/icon-laser-paws-180.png", "assets/icon-laser-paws-192.png", "assets/icon-laser-paws-512.png", "assets/laser-daily.json", "assets/icon-laser-paws-1024.png"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok||r.type==='opaque'){const copy=r.clone();caches.open(VERSION).then(c=>c.put(e.request,copy))}return r})
    .catch(()=>caches.match(e.request,{ignoreSearch:true})));
});
