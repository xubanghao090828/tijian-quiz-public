(function(){
  'use strict';
  const BASE='https://tijian-sync-20261101.lilas-xbh.chatgpt.site';
  let running=null,paused=false,status='尚未同步';
  const profile=()=>window.TIJIAN_PROFILE;
  const auth=p=>p.deviceToken?`d.${p.id}.${p.deviceId}.${p.deviceToken}`:`${p.id}.${p.secret}`;
  const persistProfile=p=>{localStorage.setItem('tijian-active-profile',JSON.stringify(p));window.TIJIAN_PROFILE=p;return p};
  const errors={device_access_revoked:'这台设备已解绑，本机记录仍可离线使用；重新配对后可继续同步',pairing_expired:'配对码已过期，请在原设备重新生成',pairing_already_claimed:'这份配对码已被使用，请重新生成',too_many_pair_attempts:'尝试过于频繁，请稍后重试',invalid_temporary_code:'请输入完整的 10 位临时配对码',pairing_request_changed:'配对请求已变化，请刷新后重试',pairing_code_not_found:'旧配对码不存在，请先在原设备同步一次',pairing_code_rejected:'旧配对码无效',invalid_sessions:'有一轮记录格式不完整，已保留本机数据，请先下载备份',session_question_mismatch:'同一轮题目内容不同，已停止同步并保留本机数据',session_busy_retry:'另一台设备正在更新这轮练习，请再同步一次'};
  async function api(path,data={},credential=auth(profile())){
    const response=await fetch(BASE+path,{method:'POST',headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)});
    let result;try{result=await response.json()}catch{throw Error('同步服务暂时不可用，请稍后重试')}
    if(!response.ok){const error=Error(errors[result.error]||`同步服务暂时不可用（${response.status}）`);error.code=result.error;throw error}
    return result;
  }
  function deviceName(){return profile().name||(window.Capacitor?.isNativePlatform?.()?'我的安卓手机':/Android/i.test(navigator.userAgent)?'手机浏览器':'我的电脑浏览器')}
  let registering=null;
  async function ensureDevice(){
    if(profile().deviceToken)return profile();
    if(registering)return registering;
    registering=(async()=>{
      const p=profile();
      if(!p.pendingDeviceToken){p.pendingDeviceToken=TijianBackup.secret();persistProfile(p)}
      await api('/api/devices/register',{deviceId:p.deviceId,deviceToken:p.pendingDeviceToken,name:deviceName(),create:true});
      return persistProfile({id:p.id,deviceId:p.deviceId,deviceToken:p.pendingDeviceToken,name:deviceName()});
    })();
    try{return await registering}finally{registering=null}
  }
  function ensureEvents(){
    if(Array.isArray(state.events))return;
    state.events=[];
    Object.entries(state.attempts).forEach(([questionId,item])=>state.events.push({id:crypto.randomUUID(),deviceId:profile().deviceId,questionId,kind:'seed',total:item.total||0,correct:item.correct||0,mistakeAction:null,createdAt:Date.now()}));
    for(const [mistakeMode,group] of Object.entries(state.mistakeGroups||{}))for(const [questionId,item] of Object.entries(group))state.events.push({id:crypto.randomUUID(),deviceId:profile().deviceId,questionId,kind:item.marked?'seed':'answer',total:0,correct:0,mistakeAction:'add',mistakeMode,createdAt:Date.now()});
    save();
  }
  function rebuild(){
    const attempts={};
    const ordered=[...state.events].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
    for(const event of ordered){const item=attempts[event.questionId]||{total:0,correct:0};item.total+=event.total;item.correct+=event.correct;attempts[event.questionId]=item}
    state.attempts=attempts;rebuildMistakeGroups(ordered);rebuildMemoryCards();save();
  }
  function rememberAnswer(record,i,answer){
    record.answerVariants||={};
    const list=record.answerVariants[i]||[];
    list.push({answer,at:Date.now(),deviceId:profile().deviceId});record.answerVariants[i]=list;
  }
  function record(questionId,kind,total,correct,mistakeAction,mistakeMode=null,memoryRating=null){
    ensureEvents();state.events.push({id:crypto.randomUUID(),deviceId:profile().deviceId,questionId,kind,total,correct,mistakeAction,mistakeMode,memoryRating,createdAt:Date.now()});rebuildMemoryCards();save();
    if(navigator.onLine)sync();
  }
  function mergeRemoteSessions(items){
    flushStudyTimer();
    for(const remote of items||[]){
      const local=state.sessions.find(s=>s.id===remote.id);
      if(!local){state.sessions.push({...TijianMerge.mergeSession(null,remote),dirty:false});continue}
      const dirty=local.dirty;Object.assign(local,TijianMerge.mergeSession(local,remote),{dirty});
      if(currentSession===local&&view==='practice'){answers=[...local.answers];selected=answers[index];sessionCorrect=answers.reduce((n,answer,i)=>n+(answer!==null&&answer===session[i]?.answer?1:0),0)}
    }
  }
  function refresh(){if(['sync','home','history','practice','mistakes'].includes(view))render()}
  function sync(){
    if(running)return running;
    if(paused||!navigator.onLine)return Promise.resolve();
    running=(async()=>{
      status='同步中…';refresh();
      try{
        ensureEvents();await ensureDevice();
        let since=Number(state.cursor)||0,sessionSince=Number(state.sessionCursor)||0,more=true;
        const attemptedSessions=new Set();
        while(more&&!paused){
          flushStudyTimer();
          const pending=state.events.filter(e=>!e.seq).slice(0,100),rounds=state.sessions.filter(s=>s.dirty&&!attemptedSessions.has(s.id)).slice(0,5),sent=rounds.map(s=>({id:s.id,updatedAt:s.updatedAt}));
          rounds.forEach(s=>attemptedSessions.add(s.id));
          const data=await api('/api/sync',{since,events:pending,sessionSince,sessionUpdates:rounds.map(({dirty,...record})=>record)});
          if(!Number.isInteger(data.sessionCursor))throw Error('同步服务正在更新，请稍后重试');
          const byId=new Map(state.events.map(e=>[e.id,e]));data.events.forEach(e=>byId.set(e.id,{...byId.get(e.id),...e}));state.events=[...byId.values()];
          since=data.cursor;state.cursor=since;mergeRemoteSessions(data.sessions);rebuild();
          sent.forEach(item=>{const local=state.sessions.find(s=>s.id===item.id);if(local&&local.updatedAt===item.updatedAt)local.dirty=false});
          sessionSince=data.sessionCursor;state.sessionCursor=sessionSince;save();
          more=data.hasMore||data.sessionHasMore||state.events.some(e=>!e.seq)||state.sessions.some(s=>s.dirty&&!attemptedSessions.has(s.id));
        }
        status=paused?'连接处理中，记录仍在本机保存':'已同步 · '+new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit'}).format(new Date());
      }catch(error){status='同步未完成：'+error.message}finally{running=null;refresh();window.dispatchEvent(new Event('tijian-sync-complete'))}
    })();return running;
  }
  async function readCloud(p){
    const result={events:[],sessions:[],added:[],custom:[],cursor:0,sessionCursor:0};
    let more=true;
    while(more){const page=await api('/api/sync',{since:result.cursor,sessionSince:result.sessionCursor},auth(p));result.events.push(...page.events);result.sessions.push(...page.sessions);result.cursor=page.cursor;result.sessionCursor=page.sessionCursor;more=page.hasMore||page.sessionHasMore}
    return result;
  }
  function snapshot(){flushStudyTimer();ensureEvents();save();return JSON.parse(JSON.stringify(state))}
  async function pause(){paused=true;if(running)await running}
  function resume(){paused=false;sync()}
  window.TijianSync={record,rememberAnswer,sync,api,profile,auth,ensureDevice,persistProfile,deviceName,rebuild,readCloud,snapshot,pause,resume,refresh,getStatus:()=>status,viewHtml:()=>'',bind:()=>{}};
  ensureEvents();rebuild();refresh();window.addEventListener('online',sync);setTimeout(sync,700);
  setInterval(()=>{if(!document.hidden)sync()},30000);
  if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
})();
