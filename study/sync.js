(function(root){
  'use strict';
  const S=root.TijianStudyStore,V=root.TijianStudySchema;
  let running=null,syncAgain=false;
  const supported=()=>Boolean(root.TijianSync?.api);
  async function enabled(space){return (await S.read(space,'meta')).some(r=>r.id==='sync-pref'&&r.enabled);}
  async function setEnabled(space,value){await S.write(space,[{table:'meta',value:{id:'sync-pref',enabled:!!value}}]);}
  async function status(space){return (await S.read(space,'meta')).find(r=>r.id==='sync-state')?.status||'';}
  async function exchange(space){
    if(!supported()||!navigator.onLine)return {status:'等待联网，本机记录仍可用'};
    if(!await enabled(space))return {status:'新模块同步未开启'};
    const initial=root.TIJIAN_PROFILE;
    if(initial.id!==space)return {status:'学习空间已切换'};
    let p=initial;
    try{
      p=await root.TijianSync.ensureDevice();
      if(p.id!==space||root.TIJIAN_PROFILE.id!==space)return {status:'学习空间已切换'};
      const auth=root.TijianSync.auth(p),snapshot=await S.snapshot(space),all=new Map(snapshot.events.map(e=>[e.id,e]));
      const meta=new Map(snapshot.meta.map(r=>[r.id,r]));
      let cursor=meta.get('sync-state')?.cursor||0;
      const pending=snapshot.events.filter(e=>!meta.has('ack:'+e.id));let offset=0,more=true,received=0;
      while(more||offset<pending.length){
        if(root.TIJIAN_PROFILE.id!==space||!await enabled(space))return {status:'同步已暂停'};
        const list=pending.slice(offset,offset+12);
        const response=await root.TijianSync.api('/api/study/v1/sync',{version:1,since:cursor,events:list},auth);
        if(response.version!==1||!Array.isArray(response.events)||!response.events.every(V.event)||!Array.isArray(response.acknowledged)||!list.every(e=>response.acknowledged.includes(e.id))||!Number.isSafeInteger(response.cursor)||response.cursor<cursor||response.hasMore&&response.cursor===cursor)throw Error('同步服务协议不兼容');
        const ops=[];
        for(const e of response.events){
          const old=all.get(e.id);
          if(old&&V.canonical(old)!==V.canonical(e))throw Error('同一个事件 ID 对应两份记录，已保留本地数据');
          if(!old){ops.push({table:'events',value:e,method:'ensure'});all.set(e.id,e);received++;}
          ops.push({table:'meta',value:{id:'ack:'+e.id}});
        }
        for(const id of response.acknowledged)ops.push({table:'meta',value:{id:'ack:'+id}});
        offset+=list.length;more=response.hasMore;cursor=response.cursor;
        const status=more||offset<pending.length?'正在同步':'已同步';
        ops.push({table:'meta',value:{id:'sync-state',cursor,status}});
        await S.write(space,ops);
      }
      return {status:'已同步',received};
    }catch(e){
      return {status:'同步暂未完成，本机记录已保留：'+(e?.message||'连接异常')};
    }
  }
  async function sync(space){
    if(running){syncAgain=true;return running;}
    running=(async()=>{let result;do{syncAgain=false;result=await exchange(space);}while(syncAgain&&root.TIJIAN_PROFILE.id===space);return result;})();
    try{return await running;}finally{running=null;}
  }
  root.TijianStudySync={supported,enabled,setEnabled,status,sync};
})(globalThis);
