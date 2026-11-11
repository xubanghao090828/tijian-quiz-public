(function(){
  const ENDPOINT='https://tijian-sync-20261101.lilas-xbh.chatgpt.site/api/sync';
  let busy=false,status='尚未同步';
  const profile=()=>window.TIJIAN_PROFILE;
  const code=()=>profile().id+'.'+profile().secret;
  function ensureEvents(){
    if(Array.isArray(state.events))return;
    state.events=[];
    Object.entries(state.attempts).forEach(([questionId,attempt])=>state.events.push({
      id:crypto.randomUUID(),deviceId:profile().deviceId,questionId,kind:'seed',
      total:attempt.total||0,correct:attempt.correct||0,mistakeAction:null,createdAt:Date.now()
    }));
    for(const [mistakeMode,group] of Object.entries(state.mistakeGroups)){
      for(const [questionId,item] of Object.entries(group))state.events.push({
        id:crypto.randomUUID(),deviceId:profile().deviceId,questionId,kind:item.marked?'seed':'answer',
        total:0,correct:0,mistakeAction:'add',mistakeMode,createdAt:Date.now()
      });
    }
    save();
  }
  function rebuild(){
    const attempts={};
    const ordered=[...state.events].sort((a,b)=>(a.seq??Number.MAX_SAFE_INTEGER)-(b.seq??Number.MAX_SAFE_INTEGER)||a.createdAt-b.createdAt);
    for(const event of ordered){
      const attempt=attempts[event.questionId]||{total:0,correct:0};
      attempt.total+=event.total;attempt.correct+=event.correct;attempts[event.questionId]=attempt;
    }
    state.attempts=attempts;
    rebuildMistakeGroups(ordered);
    rebuildMemoryCards();
    save();
  }
  function record(questionId,kind,total,correct,mistakeAction,mistakeMode=null,memoryRating=null){
    ensureEvents();state.events.push({id:crypto.randomUUID(),deviceId:profile().deviceId,questionId,kind,total,correct,mistakeAction,mistakeMode,memoryRating,createdAt:Date.now()});rebuildMemoryCards();save();
    if(navigator.onLine)sync();
  }
  function mergeRemoteSessions(items){
    for(const remote of items||[]){
      const local=state.sessions.find(s=>s.id===remote.id);
      if(!local){state.sessions.push({...remote,dirty:false});continue}
      const markedQuestionIds=[...new Set([...(local.markedQuestionIds||[]),...(remote.markedQuestionIds||[])])];
      if(local.dirty){
        remote.answers.forEach((answer,i)=>{if(local.answers[i]===null&&answer!==null)local.answers[i]=answer});
        if(remote.status==='finished'&&local.answers.every(answer=>answer!==null)){local.status='finished';local.finishedAt=remote.finishedAt;if(Number.isFinite(remote.score))local.score=remote.score;if(Number.isInteger(remote.correctCount))local.correctCount=remote.correctCount}
      }else Object.assign(local,remote,{dirty:false});
      if(local.markedQuestionIds||remote.markedQuestionIds)local.markedQuestionIds=markedQuestionIds;
      if(currentSession===local&&view==='practice'){
        answers=[...local.answers];selected=answers[index];
        sessionCorrect=answers.reduce((count,answer,i)=>count+(answer!==null&&answer===session[i]?.answer?1:0),0);
      }
    }
  }
  async function sync(){
    if(busy||!navigator.onLine)return;
    busy=true;status='同步中…';if(view==='sync')render();
    try{
      ensureEvents();let since=Number(state.cursor)||0,sessionSince=Number(state.sessionCursor)||0,more=true;
      while(more){
        const pending=state.events.filter(e=>!e.seq).slice(0,100);
        const pendingSessions=state.sessions.filter(s=>s.dirty).slice(0,5),sent=pendingSessions.map(s=>({id:s.id,updatedAt:s.updatedAt}));
        const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+code()},body:JSON.stringify({since,events:pending,sessionSince,sessionUpdates:pendingSessions.map(({dirty,...record})=>record),create:true})});
        if(!response.ok)throw Error(response.status===401?'配对码无效':'网络暂时不可用');
        const data=await response.json(),byId=new Map(state.events.map(e=>[e.id,e]));
        if(!Number.isInteger(data.sessionCursor))throw Error('同步服务正在更新，请稍后重试');
        data.events.forEach(e=>byId.set(e.id,{...byId.get(e.id),...e}));
        state.events=[...byId.values()];since=data.cursor;state.cursor=since;mergeRemoteSessions(data.sessions);rebuild();
        sent.forEach(item=>{const local=state.sessions.find(s=>s.id===item.id);if(local&&local.updatedAt===item.updatedAt)local.dirty=false});
        sessionSince=data.sessionCursor??sessionSince;state.sessionCursor=sessionSince;save();
        more=data.hasMore||data.sessionHasMore||state.events.some(e=>!e.seq)||state.sessions.some(s=>s.dirty);
      }
      status='已同步 · '+new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit'}).format(new Date());
    }catch(err){status='同步未完成：'+err.message}finally{busy=false;if(['sync','home','history','practice','mistakes'].includes(view))render()}
  }
  function viewHtml(){return `<div class="sync-hero"><div class="eyebrow">YOUR SPACE</div><h1>我的学习空间</h1><p>这台设备可离线刷题。联网后，用配对码让手机和网页使用同一份学习记录。</p><button class="secondary sync-settings-link" data-settings>⚙ 打开设置</button></div><div class="sync-grid"><div class="card sync-card"><div class="sync-symbol">↗</div><h2>同步状态</h2><p>${esc(status)}</p><button class="primary" data-sync-now>立即同步</button></div><div class="card sync-card"><div class="sync-symbol blue">⌘</div><h2>我的配对码</h2><p>在另一台设备的“我的空间”中输入，就能同步这份记录。请妥善保存，知道配对码的人可以查看你的学习记录。</p><button class="secondary" data-copy-code>复制配对码</button></div></div><div class="card sync-join"><h2>连接已有学习空间</h2><p>换设备时，把旧设备的配对码粘贴到这里。</p><div class="join-row"><input id="pairing-input" type="text" autocomplete="off" placeholder="粘贴配对码"><button class="primary" data-join>连接</button></div><p id="join-message" class="muted"></p></div>`}
  async function join(){const input=document.querySelector('#pairing-input'),value=input.value.trim(),m=value.match(/^([a-f0-9-]{36})\.([A-Za-z0-9_-]{32,100})$/);if(!m){document.querySelector('#join-message').textContent='配对码格式不正确';return}if(value===code()){document.querySelector('#join-message').textContent='当前已经连接这个学习空间';return}
    try{const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+value},body:JSON.stringify({since:0,events:[],create:false})});if(!response.ok)throw Error('配对码无效或暂时无法连接');
      const next={id:m[1],secret:m[2],deviceId:crypto.randomUUID()};localStorage.setItem('tijian-active-profile',JSON.stringify(next));location.reload();
    }catch(err){document.querySelector('#join-message').textContent=err.message}
  }
  window.TijianSync={record,sync,viewHtml,bind(){document.querySelector('[data-sync-now]')?.addEventListener('click',sync);document.querySelector('[data-copy-code]')?.addEventListener('click',async()=>{await navigator.clipboard.writeText(code());status='配对码已复制';render()});document.querySelector('[data-join]')?.addEventListener('click',join)}};
  ensureEvents();window.addEventListener('online',sync);setTimeout(sync,700);
  if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
})();
