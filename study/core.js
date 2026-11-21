(function(root){
  'use strict';
  const directions=['zh2en','en2zh'];
  const normalizeEn=s=>String(s).trim().toLowerCase();
  const checkSpelling=(item,raw)=>[item.en,...item.spellings].some(s=>normalizeEn(s)===normalizeEn(raw));
  const ratingText={1:'重来',2:'困难',3:'良好'};
  const uuid=()=>crypto.randomUUID();
  const cmp=(a,b)=>a===b?0:a<b?-1:1;
  const logicalOrder=(a,b)=>a.answeredAt-b.answeredAt||cmp(a.id,b.id);
  const cardKey=(module,id,direction)=>module==='vocab'?`vocab:${id}:${direction}`:`short:${id}`;
  const pointUnits=n=>Math.round(Number(n)*100);
  function gradeShort(rubric,pointScores,hinted=false,manualRating=null) {
    const total=rubric.points.reduce((n,p)=>n+pointUnits(p.maxScore),0);
    if(total<=0)throw Error('评分标准没有有效总分');
    let earned=0,missedCritical=false,partial=false;
    const scores=Object.create(null);
    for(const p of rubric.points){
      const raw=pointScores[p.pointId],value=Number(raw),units=pointUnits(raw),max=pointUnits(p.maxScore);
      if(raw==null||String(raw).trim()===''||!Number.isFinite(value)||value<0||Math.abs(value*100-units)>1e-7||units>max)throw Error('请为每个得分点填写有效分值，最多两位小数');
      scores[p.pointId]=units/100;earned+=units;if(units<max){partial=true;missedCritical||=p.critical;}
    }
    const computed=missedCritical||earned*5<total*3?1:partial||hinted?2:3;
    if(manualRating!==null&&(![1,2,3].includes(manualRating)||manualRating>computed))throw Error('回忆难度只能调得更保守');
    return {scores,score:earned/100,maxScore:total/100,rating:manualRating??computed};
  }
  function keywordHints(rubric,raw){
    const answer=String(raw).normalize('NFKC').toLowerCase();
    return rubric.points.map(p=>({pointId:p.pointId,matches:p.aliases.filter(s=>answer.includes(s.normalize('NFKC').toLowerCase()))}));
  }
  function effectiveGrade(events){
    // A grade is active only when all its referenced predecessors exist.
    // Competing branches share the last grade that is an ancestor of every head.
    const all=new Map(events.map(e=>[e.id,e])),valid=new Map(),working=new Set();
    function visit(e){
      if(valid.has(e.id))return true;
      if(working.has(e.id))return false;
      const parents=e.parents||[];
      if(e.type==='confirmed'?parents.length!==0:e.type==='revised'?parents.length!==1:parents.length<2)return false;
      working.add(e.id);
      const ok=parents.every(id=>all.has(id)&&visit(all.get(id)));
      working.delete(e.id);
      if(ok)valid.set(e.id,e);
      return ok;
    }
    for(const e of all.values())visit(e);
    const referenced=new Set([...valid.values()].flatMap(e=>e.parents||[]));
    const heads=[...valid.values()].filter(e=>!referenced.has(e.id)).sort((a,b)=>cmp(a.id,b.id));
    if(heads.length<2)return {grade:heads[0]||null,heads,pending:all.size-valid.size};
    const ancestors=e=>{const seen=new Set(),stack=[e.id];while(stack.length){const id=stack.pop();if(seen.has(id))continue;seen.add(id);stack.push(...(valid.get(id)?.parents||[]));}return seen;};
    const sets=heads.map(ancestors);
    const common=[...sets[0]].filter(id=>sets.every(s=>s.has(id))).map(id=>valid.get(id));
    const notLatest=new Set(common.flatMap(e=>e.parents||[]));
    const last=common.filter(e=>!notLatest.has(e.id));
    return {grade:last.length===1?last[0]:null,heads,pending:all.size-valid.size};
  }
  function project(events){
    const attempts=new Map(),byId=new Map(),collisions=new Set();
    for(const e of events){if(byId.has(e.id)&&(root.TijianStudySchema?.canonical||JSON.stringify)(byId.get(e.id))!==(root.TijianStudySchema?.canonical||JSON.stringify)(e))collisions.add(e.id);else byId.set(e.id,e);}
    for(const e of byId.values()){
      if(collisions.has(e.id))continue;
      let branch=attempts.get(e.attemptId);
      if(!branch){branch={submit:null,grades:[],corrections:[],suggestions:[],duplicate:false};attempts.set(e.attemptId,branch);}
      if(e.type==='submitted'){if(branch.submit)branch.duplicate=true;else branch.submit=e;}
      else if(['confirmed','revised','resolved'].includes(e.type))branch.grades.push(e);
      else if(e.type==='corrected')branch.corrections.push(e);
      else if(e.type==='suggested')branch.suggestions.push(e);
    }
    const reviews=[],pending=[];
    for(const [attemptId,at] of attempts){
      if(!at.submit||at.duplicate){pending.push(attemptId);continue;}
      const q=at.submit;
      at.status=effectiveGrade(at.grades.filter(g=>{
        if(g.module!==q.module)return false;
        if(q.module==='vocab')return q.direction==='en2zh'&&g.type==='confirmed'&&g.rating===(q.hinted?Math.min(2,g.selfAssessment):g.selfAssessment);
        if(g.rubricVersion!==q.snapshot?.rubricVersion)return false;
        try{
          const verified=gradeShort(q.snapshot,g.scores,q.hinted,g.manual);
          return Object.keys(g.scores).length===q.snapshot.points.length&&g.score===verified.score&&g.maxScore===verified.maxScore&&g.rating===verified.rating;
        }catch{return false;}
      }));
      const rating=q.rating??at.status.grade?.rating;
      if(at.status.pending||!q.snapshot||!Number.isFinite(q.answeredAt)){pending.push(attemptId);continue;}
      if([1,2,3].includes(rating))reviews.push({id:q.id,cardId:cardKey(q.module,q.itemId,q.direction),rating,answeredAt:q.answeredAt});
    }
    return {attempts,reviews:reviews.sort(logicalOrder),pending};
  }
  function schedule(scheduler,reviews,only=null){
    const cards=new Map();
    for(const r of reviews){
      if(only&&!only.has(r.cardId))continue;
      const now=new Date(r.answeredAt);
      let card=cards.get(r.cardId);
      if(!card)card={...scheduler.newCard({now}),cardId:r.cardId};
      cards.set(r.cardId,scheduler.review({card,grade:r.rating,now}).card);
    }
    return cards;
  }
  root.TijianStudyCore={directions,uuid,cardKey,normalizeEn,checkSpelling,ratingText,gradeShort,keywordHints,project,schedule};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.TijianStudyCore;
})(globalThis);
