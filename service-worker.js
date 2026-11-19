const CACHE='tijian-offline-20261119-grade129';
const ASSETS=['./practice-tools.js','./practice-tools.css','./tools/perspective-deck.js','./tools/deck-gestures.js','./tools/perspective-deck.css','./highlight-model.js','./keyword-highlights.js','./keyword-settings.css','./vendor/web-highlighter-0.8.0.js','./vendor/web-highlighter-LICENSE.txt','./vendor/web-highlighter.min.js.LICENSE.txt','./vendor/highlighter-SOURCE.txt','./','./index.html','./styles.css','./redesign.css','./terminal.css','./arcade.css','./cnc-banner.png','./questions.js','./explain.js','./xlsx.full.min.js','./identity.js','./question-import.js','./question-template.csv','./vendor/ts-fsrs-6.0.0.umd.js','./vendor/fsrs-LICENSE.txt','./memory-scheduler.js','./mistake-book.js','./session-review.js','./sequential-progress.js','./question-motion.js','./haptic-settings.js','./app-font.js','./app-font.css','./study-controls.css','./practice-layout.css','./practice-layout.js','./vendor/motion-14.12.0.js','./vendor/motion-LICENSE.txt','./vendor/motion-SOURCE.txt','./study-timer.js','./question-attempts.js','./practice-gestures.js','./vendor/hammer-2.0.8.js','./vendor/hammer-LICENSE.txt','./fonts/inpin-hongmengti.ttf','./app.js','./sync-core.js','./sync-space.js','./sync-space.css','./sync-backup.js','./sync-merge.js','./sync-scanner.js','./vendor/qrcodegen.js','./vendor/qrcodegen-LICENSE.txt','./vendor/jsQR-1.4.0.js','./vendor/jsQR-LICENSE.txt','./vendor/pairing-SOURCE.txt','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
const GRADE_ASSETS = ['S', 'A', 'B', 'X'].flatMap(grade =>
  ['scene.mp4', 'poster.jpg', 'ambient.webp'].map(file => `./assets/grades/grade_${grade}_${file}`));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([...ASSETS, './result-grade.js', './result-grade.css', ...GRADE_ASSETS])).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
async function fetchAndCache(request){const response=await fetch(request);if(response.ok){const cache=await caches.open(CACHE);await cache.put(request,response.clone())}return response}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  const fallback=()=>caches.match(request,{ignoreSearch:true});
  const range = request.headers.get('Range');
  if (range && /\/assets\/grades\/grade_[SABX]_scene\.mp4$/.test(url.pathname)) {
    event.respondWith(gradeVideoRange(request, range));
    return;
  }
  if(request.mode==='navigate'||request.destination==='script'||request.destination==='style'){
    event.respondWith(fetchAndCache(request).catch(fallback));
  }else{
    event.respondWith(fallback().then(cached=>cached||fetchAndCache(request)));
  }
});








// Media elements can issue byte-range requests even when the complete MP4 is cached.
async function gradeVideoRange(request, range) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request.url, { ignoreSearch: true });
  if (!cached) return fetch(request);
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range);
  if (!match || (!match[1] && !match[2])) return cached;
  const file = await cached.blob();
  const start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
  if (start > end || start >= file.size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.size}` } });
  }
  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${file.size}`
    }
  });
}
