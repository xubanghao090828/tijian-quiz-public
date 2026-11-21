(function(root){
  'use strict';
  const name='tijian-study-v1',keys=['content','drafts','events','meta'];
  let opening=null;
  function open(){
    if(opening)return opening;
    opening=new Promise((resolve,reject)=>{
      const req=indexedDB.open(name,1);
      req.onupgradeneeded=()=>{
        for(const t of keys){
          const s=req.result.createObjectStore(t,{keyPath:['space','id']});
          s.createIndex('space','space');
        }
      };
      req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
      req.onerror=()=>reject(req.error);
      req.onblocked=()=>reject(Error('请关闭正在使用题间的其他页面后重试'));
    }).catch(e=>{opening=null;throw e;});
    return opening;
  }
  async function read(space,table){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(table).objectStore(table).index('space').getAll(space);
      req.onsuccess=()=>resolve(req.result.map(({space,...v})=>v));req.onerror=()=>reject(req.error);
    });
  }
  async function write(space,operations){
    if(!space||!operations.length)return;
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction([...new Set(operations.map(o=>o.table))],'readwrite');
      tx.oncomplete=()=>resolve();
      tx.onabort=()=>reject(tx.error||Error('保存没有完成'));
      try{
        for(const {table,value,method='put',id} of operations){
          const s=tx.objectStore(table);
          if(method==='delete')s.delete([space,id]);
          else if(method==='ensure'){
            const read=s.get([space,value.id]);
            read.onsuccess=()=>{
              const row=read.result;
              if(!row){s.add({...value,space});return;}
              const {space:ignored,...stored}=row;
              if(TijianStudySchema.canonical(stored)!==TijianStudySchema.canonical(value))tx.abort();
            };
          }else s[method]({...value,space});
        }
      }catch(e){tx.abort();reject(e);}
    });
  }
  async function snapshot(space){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(keys,'readonly'),out={schemaVersion:1};
      for(const t of keys){const r=tx.objectStore(t).index('space').getAll(space);r.onsuccess=()=>{out[t]=r.result.map(({space,...v})=>v);};}
      tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);
    });
  }
  root.TijianStudyStore={read,write,snapshot};
})(globalThis);
