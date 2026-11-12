(function(root){
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const variantKey=v=>`${v.answer}|${v.deviceId}|${v.at}`;
  function variants(record,i){
    const items=copy(record.answerVariants?.[i]||[]);
    const answer=record.answers[i];
    if(answer!==null&&!items.some(v=>v.answer===answer))items.push({answer,deviceId:'legacy',at:record.updatedAt||record.createdAt||0});
    return items;
  }
  function compare(a,b){return a.at-b.at||a.deviceId.localeCompare(b.deviceId)||a.answer-b.answer}
  function mergeSession(left,right){
    if(!left)left={...right,answers:right.answers.map(()=>null),answerVariants:{}};
    if(left.questionIds.length!==right.questionIds.length||left.questionIds.some((id,i)=>id!==right.questionIds[i]))throw Error('这轮题目的内容不同，无法作为同一轮合并');
    const rank=right.updatedAt-left.updatedAt||(right.updatedBy||'').localeCompare(left.updatedBy||'')||right.index-left.index;
    const newer=rank>=0?right:left,older=newer===right?left:right;
    const result={...copy(older),...copy(newer),answers:[],answerVariants:{},createdAt:Math.min(left.createdAt,right.createdAt),updatedAt:Math.max(left.updatedAt,right.updatedAt),status:left.status==='finished'||right.status==='finished'?'finished':'active'};
    for(let i=0;i<right.questionIds.length;i++){
      const byKey=new Map([...variants(left,i),...variants(right,i)].map(v=>[variantKey(v),v]));
      const list=[...byKey.values()].sort(compare);
      if(list.length)result.answerVariants[i]=list;
      result.answers[i]=list.at(-1)?.answer??null;
    }
    if(left.timerCounters||right.timerCounters){
      result.timerCounters={};
      for(const device of new Set([...Object.keys(left.timerCounters||{}),...Object.keys(right.timerCounters||{})]))result.timerCounters[device]=right.questionIds.map((_,i)=>Math.max(left.timerCounters?.[device]?.[i]||0,right.timerCounters?.[device]?.[i]||0));
    }
    result.markedQuestionIds=[...new Set([...(left.markedQuestionIds||[]),...(right.markedQuestionIds||[])])].sort();
    result.finishedAt=left.finishedAt&&right.finishedAt?Math.min(left.finishedAt,right.finishedAt):left.finishedAt||right.finishedAt;
    // Cached scores describe a single branch, not necessarily the merged answers.
    if(JSON.stringify(left.answers)!==JSON.stringify(right.answers)){delete result.score;delete result.correctCount}
    return result;
  }
  function conflicts(record){
    return Object.entries(record.answerVariants||{}).filter(([,items])=>new Set(items.map(v=>v.answer)).size>1).map(([index,items])=>({index:Number(index),items}));
  }
  function mergeSnapshots(target,source){
    const events=new Map((target.events||[]).map(e=>[e.id,copy(e)]));
    for(const event of source.events||[]){const {seq,...item}=event;if(!events.has(item.id))events.set(item.id,item)}
    const sessions=new Map((target.sessions||[]).map(s=>[s.id,copy(s)]));
    for(const record of source.sessions||[]){const merged=mergeSession(sessions.get(record.id),record);merged.dirty=true;sessions.set(record.id,merged)}
    const added=new Map([...(target.added||[]),...(source.added||[])].map(q=>[q.id,q]));
    const custom=new Map([...(target.custom||[]),...(source.custom||[])].map(q=>[q.id,q]));
    // Keep bundled questions available if either space previously used the bundled bank.
    const mergedCustom=target.custom?.length&&source.custom?.length?[...custom.values()]:[];
    if(!mergedCustom.length)for(const q of custom.values())added.set(q.id,q);
    for(const q of mergedCustom)added.delete(q.id);
    return {...copy(target),events:[...events.values()],sessions:[...sessions.values()],added:[...added.values()],custom:mergedCustom,memoryCards:{}};
  }
  root.TijianMerge={mergeSession,mergeSnapshots,conflicts};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.TijianMerge;
})(globalThis);
