(function(root){
  'use strict';
  const id=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const time=n=>Number.isSafeInteger(n)&&n>=0&&n<=8640000000000000;
  const str=(v,max)=>typeof v==='string'&&v.length<=max;
  const rating=v=>[1,2,3].includes(v);
  const version=v=>Number.isSafeInteger(v)&&v>=1;
  const list=(v,n,fn)=>Array.isArray(v)&&v.length<=n&&v.every(fn);
  const bounded=(v,max)=>Number.isFinite(v)&&v>=0&&v<=max&&Math.abs(v*100-Math.round(v*100))<1e-7;
  const key=v=>str(v,120)&&!!v&&!['__proto__','prototype','constructor'].includes(v);
  const only=(v,keys)=>Object.keys(v).every(k=>keys.includes(k));
  const contentFields=['id','module','externalId','tags','importOrder'];
  const item=v=>{
    if(!v||!id(v.id)||!str(v.externalId,300)||!list(v.tags,150,x=>str(x,300)))return false;
    if(v.module==='vocab')return only(v,[...contentFields,'version','en','zh','spellings','pos','example'])&&version(v.version)&&str(v.en,1000)&&!!v.en&&list(v.zh,100,s=>str(s,3000))&&v.zh.length>0&&list(v.spellings,100,s=>str(s,1000))&&str(v.pos,300)&&str(v.example,12000);
    return v.module==='short'&&only(v,[...contentFields,'rubricVersion','stem','reference','source','points','ready'])&&version(v.rubricVersion)&&str(v.stem,12000)&&!!v.stem&&str(v.reference,12000)&&str(v.source,12000)&&typeof v.ready==='boolean'&&
      list(v.points,50,p=>p&&only(p,['pointId','label','maxScore','critical','aliases','conditions','partialRule'])&&key(p.pointId)&&str(p.label,500)&&!!p.label&&bounded(p.maxScore,10000)&&typeof p.critical==='boolean'&&list(p.aliases,120,s=>str(s,300))&&str(p.conditions,12000)&&str(p.partialRule,12000))&&
      new Set(v.points.map(p=>p.pointId)).size===v.points.length&&v.ready===Boolean(v.reference&&v.points.some(p=>p.maxScore>0));
  };
  function event(e){
    if(!e||!id(e.id)||!id(e.attemptId)||!id(e.deviceId)||!['short','vocab'].includes(e.module)||!time(e.createdAt))return false;
    const base=['id','attemptId','module','type','deviceId','createdAt'];
    if(e.type==='submitted')return only(e,[...base,'itemId','answeredAt','raw','hinted','snapshot','direction','rating'])&&e.attemptId===e.id&&id(e.itemId)&&time(e.answeredAt)&&str(e.raw,12000)&&!!e.raw&&typeof e.hinted==='boolean'&&item(e.snapshot)&&e.snapshot.id===e.itemId&&e.snapshot.module===e.module&&
      (e.module==='short'?e.direction===null&&e.snapshot.ready&&e.rating===null:e.direction==='en2zh'?e.rating===null:e.direction==='zh2en'&&rating(e.rating));
    if(e.type==='corrected')return only(e,[...base,'raw'])&&str(e.raw,12000)&&!!e.raw;
    if(e.type==='suggested')return only(e,[...base,'requestId','provider','model','rubricVersion','points'])&&e.module==='short'&&id(e.requestId)&&str(e.provider,100)&&str(e.model,200)&&version(e.rubricVersion)&&list(e.points,50,p=>p&&only(p,['pointId','score','reason','evidence','missing','contradiction','needsReview'])&&key(p.pointId)&&bounded(p.score,10000)&&str(p.reason,800)&&str(p.evidence,1500)&&typeof p.missing==='boolean'&&typeof p.contradiction==='boolean'&&typeof p.needsReview==='boolean');
    if(!rating(e.rating)||!['confirmed','revised','resolved'].includes(e.type))return false;
    if(e.module==='vocab')return only(e,[...base,'rating','selfAssessment'])&&e.type==='confirmed'&&rating(e.selfAssessment)&&e.rating<=e.selfAssessment;
    const parents=e.parents;
    return only(e,[...base,'parents','rubricVersion','manual','scores','score','maxScore','rating'])&&list(parents,20,id)&&!parents.includes(e.id)&&new Set(parents).size===parents.length&&
      (e.type==='confirmed'?parents.length===0:e.type==='revised'?parents.length===1:parents.length>=2)&&version(e.rubricVersion)&&
      (e.manual===null||rating(e.manual))&&e.scores&&typeof e.scores==='object'&&!Array.isArray(e.scores)&&Object.keys(e.scores).length<=50&&
      Object.entries(e.scores).every(([k,v])=>key(k)&&bounded(v,10000))&&bounded(e.score,500000)&&bounded(e.maxScore,500000)&&e.maxScore>0&&e.score<=e.maxScore;
  }
  function validateBackup(data){
    if(!data||data.schemaVersion!==1||!list(data.content,50000,item)||!list(data.events,200000,event)||!list(data.drafts,2,d=>d&&['short','vocab'].includes(d.id)&&list(d.queue,30,id)&&d.queue.length>0&&d.index>=0&&d.index<d.queue.length&&Number.isInteger(d.index)&&item(d.item)&&d.item.id===d.queue[d.index]&&d.item.module===d.id&&id(d.attemptId)&&['learn','answer','grade','result'].includes(d.phase)&&str(d.input,12000)&&str(d.correction,12000)))return false;
    return [data.content,data.events,data.drafts].every(items=>new Set(items.map(x=>x.id)).size===items.length);
  }
  function canonical(value){
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
    return JSON.stringify(value);
  }
  root.TijianStudySchema={id,time,item,event,validateBackup,canonical};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.TijianStudySchema;
})(globalThis);
