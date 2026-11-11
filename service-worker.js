const CACHE='tijian-offline-20261111-modes';
const ASSETS=['./','./index.html','./styles.css','./redesign.css','./terminal.css','./arcade.css','./cnc-banner.png','./questions.js','./explain.js','./xlsx.full.min.js','./identity.js','./question-import.js','./question-template.csv','./mistake-book.js','./session-review.js','./app.js','./sync.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
async function fetchAndCache(request){const response=await fetch(request);if(response.ok){const cache=await caches.open(CACHE);await cache.put(request,response.clone())}return response}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  const fallback=()=>caches.match(request,{ignoreSearch:true});
  if(request.mode==='navigate'||request.destination==='script'||request.destination==='style'){
    event.respondWith(fetchAndCache(request).catch(fallback));
  }else{
    event.respondWith(fallback().then(cached=>cached||fetchAndCache(request)));
  }
});







