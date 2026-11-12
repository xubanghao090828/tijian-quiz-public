const CACHE='tijian-offline-20261112-pairing';
const ASSETS=['./','./index.html','./styles.css','./redesign.css','./terminal.css','./arcade.css','./cnc-banner.png','./questions.js','./explain.js','./xlsx.full.min.js','./identity.js','./question-import.js','./question-template.csv','./vendor/ts-fsrs-6.0.0.umd.js','./vendor/fsrs-LICENSE.txt','./memory-scheduler.js','./mistake-book.js','./session-review.js','./sequential-progress.js','./question-motion.js','./haptic-settings.js','./app-font.js','./app-font.css','./study-controls.css','./practice-layout.css','./practice-layout.js','./vendor/motion-14.12.0.js','./vendor/motion-LICENSE.txt','./vendor/motion-SOURCE.txt','./study-timer.js','./question-attempts.js','./practice-gestures.js','./vendor/hammer-2.0.8.js','./vendor/hammer-LICENSE.txt','./fonts/inpin-hongmengti.ttf','./app.js','./sync-core.js','./sync-space.js','./sync-space.css','./sync-backup.js','./sync-merge.js','./sync-scanner.js','./vendor/qrcodegen.js','./vendor/qrcodegen-LICENSE.txt','./vendor/jsQR-1.4.0.js','./vendor/jsQR-LICENSE.txt','./vendor/pairing-SOURCE.txt','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
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







