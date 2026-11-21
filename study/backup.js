(function(root){
  'use strict';
  const S=root.TijianStudyStore,V=root.TijianStudySchema;
  const pack=async id=>{const {schemaVersion,content,events,drafts}=await S.snapshot(id);return {schemaVersion,content,events,drafts};};
  const has=data=>Boolean(data&&(data.content.length||data.events.length||data.drafts.length));
  async function restore(id,data){
    if(!data)return;
    if(!V.validateBackup(data))throw Error('新学习模块的备份无效，未切换空间');
    await S.write(id,['content','events','drafts'].flatMap(table=>data[table].map(value=>({table,value,method:table==='events'?'ensure':'put'}))));
  }
  function mergeLocal(target,source){
    const keep=new Map(target.content.map(x=>[x.id,x])),events=new Map(target.events.map(x=>[x.id,x]));
    for(const x of source.content){
      const old=keep.get(x.id);
      if(!old){keep.set(x.id,x);continue;}
      if(old.module!==x.module)throw Error('学习内容 ID 冲突，请先导出两边备份');
      const a=x.module==='short'?old.rubricVersion:old.version,b=x.module==='short'?x.rubricVersion:x.version;
      if(a===b&&V.canonical(x)!==V.canonical(old))throw Error('同一学习内容版本不同，请先导出两边备份并处理冲突');
      if(b>a)keep.set(x.id,x);
    }
    for(const e of source.events){
      const old=events.get(e.id);
      if(old&&V.canonical(old)!==V.canonical(e))throw Error('学习事件 ID 内容冲突，请先导出两边备份');
      events.set(e.id,e);
    }
    const drafts=new Map(target.drafts.map(x=>[x.id,x]));
    for(const d of source.drafts){
      if(!drafts.has(d.id))drafts.set(d.id,d);
      else if(V.canonical(drafts.get(d.id))!==V.canonical(d))throw Error('两边都有同类未结束的练习；请先备份并结束一边的本轮练习后再配对');
    }
    return {schemaVersion:1,content:[...keep.values()],events:[...events.values()],drafts:[...drafts.values()]};
  }
  async function transfer(from,to){
    if(from===to)return;
    const [a,b]=await Promise.all([pack(to),pack(from)]);
    if(!has(b))return;
    await restore(to,mergeLocal(a,b));
    // Target cursor is independent; copied events are never marked uploaded on this space.
  }
  root.TijianStudyBackup={pack,has,restore,transfer};
})(globalThis);
