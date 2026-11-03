const CACHE="organize-v6";
const ASSETS=["./","./index.html","./style.css","./app.js","./manifest.json","./icon-192.png","./icon-512.png"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  const req=e.request,url=new URL(req.url);
  /* Solo archivos de la propia página; Firebase y otros servicios van directos a la red */
  if(req.method!=="GET"||url.origin!==location.origin)return;
  /* Primero la red (para ver siempre la última versión) y, si no hay conexión, la copia guardada */
  e.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res}).catch(()=>caches.match(req)));
});
