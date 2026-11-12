(function(root){
  const database=new Promise((resolve,reject)=>{
    const request=indexedDB.open('tijian-safety-backups',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('backups',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(Error('无法打开本机备份，已停止合并'));
  });
  async function transaction(mode,run){
    const db=await database;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('backups',mode),request=run(tx.objectStore('backups'));
      tx.oncomplete=()=>resolve(request.result);
      tx.onabort=tx.onerror=()=>reject(Error('本机备份保存失败，已停止操作。请检查剩余存储空间。'));
    });
  }
  const read=key=>{try{return JSON.parse(localStorage.getItem(key))}catch{return null}};
  async function create(profile,data,label){
    const backup={id:crypto.randomUUID(),createdAt:Date.now(),label,profile:JSON.parse(JSON.stringify(profile)),state:JSON.parse(JSON.stringify(data))};
    await transaction('readwrite',store=>store.add(backup));
    return backup;
  }
  async function list(){return (await transaction('readonly',store=>store.getAll())).sort((a,b)=>b.createdAt-a.createdAt)}
  async function get(id){return transaction('readonly',store=>store.get(id))}
  const secret=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  async function restore(id,currentProfile,currentState){
    const backup=await get(id);if(!backup)throw Error('找不到这份备份');
    await create(currentProfile,currentState,'恢复前的学习记录');
    // Restore as an independent space; a restore never rolls back shared cloud data.
    const profile={id:crypto.randomUUID(),deviceId:crypto.randomUUID(),secret:secret(),name:currentProfile.name};
    const data={...backup.state,cursor:0,sessionCursor:0,events:(backup.state.events||[]).map(({seq,...event})=>event),sessions:(backup.state.sessions||[]).map(record=>({...record,dirty:true}))};
    localStorage.setItem('tijian-v1-'+profile.id,JSON.stringify(data));
    localStorage.setItem('tijian-active-profile',JSON.stringify(profile));
    location.reload();
  }
  async function download(id){
    const backup=await get(id);if(!backup)throw Error('找不到这份备份');
    const contents=JSON.stringify({format:'tijian-backup-v1',createdAt:backup.createdAt,label:backup.label,state:backup.state},null,2);
    const fileName='题间备份-'+new Date(backup.createdAt).toISOString().slice(0,10)+'.json';
    if(window.Capacitor?.isNativePlatform?.()){
      const plugin=Capacitor.Plugins?.QuizBackup||Capacitor.registerPlugin('QuizBackup');await plugin.save({fileName,contents});return;
    }
    const blob=new Blob([contents],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function importFile(file,currentProfile,currentState){
    if(file.size>20000000)throw Error('备份文件过大，请使用小于 20 MB 的题间备份');
    let backup;try{backup=JSON.parse(await file.text())}catch{throw Error('不是有效的备份文件')}
    const data=backup.state;
    if(backup.format!=='tijian-backup-v1'||!data||!Array.isArray(data.sessions)||!Array.isArray(data.events)
      ||!data.sessions.every(s=>s&&/^[a-f0-9-]{36}$/.test(s.id)&&Array.isArray(s.questionIds)&&Array.isArray(s.answers)&&s.answers.length===s.questionIds.length)
      ||!data.events.every(e=>e&&/^[a-f0-9-]{36}$/.test(e.id)&&Number.isInteger(e.total)&&e.total>=0&&Number.isInteger(e.correct)&&e.correct>=0&&e.correct<=e.total&&Number.isFinite(e.createdAt)))throw Error('备份内容不完整，已保留当前记录');
    if(!confirm(`文件中有 ${data.sessions.length} 轮记录，恢复为独立学习空间？当前记录会先备份。`))return;
    const saved=await create(currentProfile,data,'从文件导入的备份');
    await restore(saved.id,currentProfile,currentState);
  }
  root.TijianBackup={create,list,get,restore,download,importFile,read,secret};
})(window);
