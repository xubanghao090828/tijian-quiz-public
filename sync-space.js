(function(){
  'use strict';
  const S=window.TijianSync,B=window.TijianBackup;
  let devices=[],backups=[],message='',working=false,preview=null,flow=null;
  let joinInput='',deviceInput=S.deviceName(),pollBusy=false,lastPoll=0;
  try{flow=JSON.parse(sessionStorage.getItem('tijian-pair-flow'))}catch{flow=null}
  function saveFlow(){if(flow)sessionStorage.setItem('tijian-pair-flow',JSON.stringify(flow));else sessionStorage.removeItem('tijian-pair-flow')}
  function draw(){if(view==='sync')render()}
  const date=value=>value?new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'尚未连接';
  const answerCount=data=>(data.events||[]).reduce((total,event)=>total+event.total,0);
  async function run(action){
    if(working)return;working=true;message='正在处理…';draw();
    try{await action()}catch(error){message=error.message||'操作失败，请稍后重试'}finally{working=false;draw()}
  }
  async function refreshLists(){
    backups=await B.list();
    if(navigator.onLine){await S.ensureDevice();devices=(await S.api('/api/devices/list')).devices}
  }
  async function createInvite(){
    if(!navigator.onLine)throw Error('添加设备需要联网；离线刷题不受影响');
    await S.sync();if(!S.getStatus().startsWith('已同步'))throw Error(S.getStatus());await S.ensureDevice();
    flow={kind:'invite',...await S.api('/api/pair/create')};preview=null;saveFlow();message='在另一台设备扫码或输入下方临时码，再回来确认。';
  }
  function parseCode(value){
    value=value.trim();
    try{const url=new URL(value);if(url.hash.startsWith('#pair='))value=decodeURIComponent(url.hash.slice(6))}catch{}
    return value.replace(/[\s-]/g,'').toUpperCase();
  }
  async function startJoin(value){
    if(!navigator.onLine)throw Error('配对需要联网；已有记录可以继续离线使用');
    const local=S.snapshot();await B.create(S.profile(),local,'连接前的本机记录');backups=await B.list();
    const legacy=value.trim().match(/^([a-f0-9-]{36})\.([A-Za-z0-9_-]{32,100})$/);
    const newProfile={id:'',deviceId:crypto.randomUUID(),deviceToken:B.secret(),name:deviceInput.trim().slice(0,60)||S.deviceName()};
    if(legacy){
      if(legacy[1]===S.profile().id){message='这台设备已经属于这个学习空间。';return}
      const registered=await S.api('/api/devices/register',{deviceId:newProfile.deviceId,deviceToken:newProfile.deviceToken,name:newProfile.name,create:false},value.trim());
      newProfile.id=registered.profileId;flow={kind:'join',status:'approved',profile:newProfile,legacy:true};saveFlow();await preparePreview();return;
    }
    const code=parseCode(value);
    if(!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/.test(code))throw Error('请输入完整的 10 位临时配对码，也可以粘贴配对链接或旧版长配对码。');
    if(flow?.kind==='invite'&&flow.code===code)throw Error('这是当前设备生成的码，请在另一台设备输入');
    flow={kind:'join',code,claimSecret:B.secret(),profile:newProfile,status:'claiming'};saveFlow();
    const result=await S.api('/api/pair/claim',{code,claimSecret:flow.claimSecret,deviceId:newProfile.deviceId,deviceToken:newProfile.deviceToken,name:newProfile.name,summary:{sessions:local.sessions.length,answers:answerCount(local)}},'');
    Object.assign(flow,result);saveFlow();message='请在原设备核对下面的四位确认数字，再允许连接。';
  }
  async function reconcileQuestionIds(target,source){
    const cloned=JSON.parse(JSON.stringify(source)),targetQuestions=new Map([...(window.BUNDLED_QUESTIONS||[]),...(target.custom||[]),...(target.added||[])].map(q=>[q.id,q]));
    const fingerprint=q=>JSON.stringify([q.question,q.options,q.answer]);
    const hex=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');
    const remap=new Map();
    for(const question of [...(cloned.custom||[]),...(cloned.added||[])]){
      const existing=targetQuestions.get(question.id);
      if(existing&&fingerprint(existing)!==fingerprint(question)){
        const id='merged-'+(await hex(question.id+fingerprint(question))).slice(0,32);remap.set(question.id,id);question.id=id;
      }
    }
    if(remap.size){
      for(const event of cloned.events||[])event.questionId=remap.get(event.questionId)||event.questionId;
      for(const record of cloned.sessions||[]){
        record.questionIds=record.questionIds.map(id=>remap.get(id)||id);record.markedQuestionIds=record.markedQuestionIds?.map(id=>remap.get(id)||id);
        const existing=target.sessions.find(s=>s.id===record.id);
        if(existing&&JSON.stringify(existing.questionIds)!==JSON.stringify(record.questionIds)){
          const id=(await hex(record.id+JSON.stringify(record.questionIds))).slice(0,32);record.id=`${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`;
        }
      }
    }
    return cloned;
  }
  async function preparePreview(){
    if(!flow?.profile?.id)throw Error('配对尚未完成');
    message='正在读取两边的学习记录…';draw();
    const cloud=await S.readCloud(flow.profile),stored=B.read('tijian-v1-'+flow.profile.id);
    const target=stored?TijianMerge.mergeSnapshots(cloud,stored):cloud;
    const local=await reconcileQuestionIds(target,S.snapshot());
    const merged=TijianMerge.mergeSnapshots(target,local);
    preview={target,local,merged,conflicts:merged.sessions.reduce((n,s)=>n+TijianMerge.conflicts(s).length,0)};
    message='连接已获准。下面是合并预览，确认后才会切换学习空间。';
  }
  async function commitMerge(){
    if(!preview||!flow?.profile?.id)throw Error('请先完成配对和合并预览');
    await S.pause();
    try{
      const source=S.snapshot();await B.create(S.profile(),source,'合并前的本机记录');
      const targetKey='tijian-v1-'+flow.profile.id,oldTarget=B.read(targetKey);
      const latest=await S.readCloud(flow.profile);
      let target=oldTarget?TijianMerge.mergeSnapshots(latest,oldTarget):latest;
      await B.create(flow.profile,target,'合并前的另一空间记录');
      const merged=TijianMerge.mergeSnapshots(target,await reconcileQuestionIds(target,source));
      localStorage.setItem(targetKey,JSON.stringify(merged));
      S.persistProfile(flow.profile);flow=null;saveFlow();location.hash='';location.reload();
    }catch(error){S.resume();throw error}
  }
  async function cancelPairing(){
    if(flow?.kind==='invite')await S.api('/api/pair/reject',{id:flow.id});
    if(flow?.kind==='join'&&!flow.legacy)await S.api('/api/pair/withdraw',{code:flow.code,claimSecret:flow.claimSecret},'').catch(error=>{if(error.code!=='pairing_expired')throw error});
    if(flow?.kind==='join'&&flow.profile.id){try{await S.api('/api/devices/revoke',{deviceId:flow.profile.deviceId},S.auth(flow.profile))}catch{}}
    flow=null;preview=null;saveFlow();message='已取消，本机记录保持原样。';
  }
  async function poll(){
    if(pollBusy||working||!flow||!navigator.onLine||view!=='sync'||Date.now()-lastPoll<3500)return;
    if(preview)return;
    pollBusy=true;lastPoll=Date.now();
    try{
      if(flow.kind==='invite'){
        const result=await S.api('/api/pair/status',{id:flow.id});
        if(JSON.stringify(result)!==JSON.stringify(flow.last)){flow.last=result;flow.status=result.status;saveFlow();draw()}
      }else if(flow.status==='approved'&&flow.profile.id){await preparePreview();draw()}
      else{
        const result=await S.api('/api/pair/check',{code:flow.code,claimSecret:flow.claimSecret},'');Object.assign(flow,result);
        if(result.status==='approved'){flow.profile.id=result.profileId;saveFlow();await preparePreview()}
        else if(result.status==='rejected')message='原设备已拒绝或取消连接，可以重新输入新配对码。';
        saveFlow();draw();
      }
    }catch(error){message=error.message;if(error.code==='pairing_expired'){flow=null;saveFlow()}draw()}finally{pollBusy=false}
  }
  function flowHtml(){
    if(preview){
      const p=preview;
      return `<section class="card sync-panel merge-preview" aria-label="合并预览"><span class="eyebrow">MERGE / 保留两边</span><h2>连接成功，先看合并预览</h2><div class="merge-columns"><div><small>本机已有</small><strong>${p.local.sessions.length} 轮</strong><span>${answerCount(p.local)} 次作答</span></div><b>＋</b><div><small>另一空间已有</small><strong>${p.target.sessions.length} 轮</strong><span>${answerCount(p.target)} 次作答</span></div></div><p>合并后保留 <strong>${p.merged.sessions.length} 轮</strong>、<strong>${answerCount(p.merged)} 次作答</strong>。重复记录只算一次。</p><p>${p.conflicts?`有 ${p.conflicts} 道题存在不同答案，两个版本都会保留，可在“同步冲突”中查看。`:'暂未发现同题答案冲突。'}旧记录没有精确答题时间时，会使用该轮更新时间作为参考。</p><p class="muted">合并前会备份两份记录。字体、震动等设置仍按各设备自己的设置保留；自导入题库保留在当前设备，暂不自动传至其他设备。</p><div class="button-row"><button class="primary" data-merge-confirm ${working?'disabled':''}>备份并合并记录</button><button class="secondary" data-pair-cancel>取消</button></div></section>`;
    }
    if(flow?.kind==='invite'){
      const pending=flow.last?.status==='pending',expired=flow.expiresAt<Date.now();
      return `<section class="card sync-panel pairing-ticket"><span class="eyebrow">LINK / 临时配对</span><h2>${pending?'有设备请求连接':'在另一台设备扫码'}</h2>${!pending&&!expired&&flow.status==='open'?`<div class="pair-qr" data-pair-qr></div><div class="pair-code">${flow.code.slice(0,5)} ${flow.code.slice(5)}</div><p>10 分钟内有效 · 仅用于本次配对</p><button class="secondary" data-pair-copy>复制配对链接</button>`:''}${pending?`<div class="pair-request"><strong>${esc(flow.last.name)}</strong><p>已有 ${flow.last.summary?.sessions||0} 轮、${flow.last.summary?.answers||0} 次作答</p><p>两边显示的确认数字应一致</p><b class="pair-verify">${esc(flow.last.verifyCode)}</b></div><div class="button-row"><button class="primary" data-pair-approve>允许连接</button><button class="secondary" data-pair-cancel>拒绝</button></div>`:flow.status==='approved'?'<p>已允许连接，请在另一台设备查看并确认合并。</p>':expired?'<p>配对码已过期，请重新生成。</p>':''}<p class="muted">有效至 ${date(flow.expiresAt)}。二维码中不包含永久同步密钥。</p><button class="secondary" data-pair-cancel>关闭本次配对</button></section>`;
    }
    if(flow?.kind==='join')return `<section class="card sync-panel"><h2>等待原设备确认</h2><p>请在原设备“我的空间”中允许连接，并核对数字：</p><b class="pair-verify">${esc(flow.verifyCode||'…')}</b><p>本机记录已备份，尚未切换空间。</p><button class="secondary" data-pair-cancel>取消连接</button></section>`;
    return '';
  }
  function conflictsHtml(){
    const records=state.sessions.flatMap(record=>TijianMerge.conflicts(record).map(conflict=>({record,...conflict}))),questions=new Map(bank().map(q=>[q.id,q]));
    return `<details class="card sync-panel sync-conflicts"><summary>同步冲突 <span>${records.length} 道</span></summary><p class="muted">保留双方作答；本轮展示按每题较新的答题时间选择。旧版记录使用整轮更新时间。这里只查看，不会重复计入答题次数。</p>${records.map(({record,index,items})=>{const q=questions.get(record.questionIds[index]);return `<article class="conflict-item"><small>${esc(sessionTitle(record.mode))} · 第 ${sessionQuestionNumber(record,index)} 题</small><h3>${esc(q?.question||'题目不在当前设备题库中')}</h3>${items.map(item=>`<p><b>${String.fromCharCode(65+item.answer)}</b> ${esc(q?.options[item.answer]||'选项 '+(item.answer+1))}<small>${date(item.at)} · ${item.deviceId==='legacy'?'旧版记录':esc(devices.find(d=>d.id===item.deviceId)?.name||'另一台设备')}${record.answers[index]===item.answer?' · 当前展示':''}</small></p>`).join('')}<button class="secondary" data-sync-review="${record.id}" data-sync-question="${index}">打开本轮回顾</button></article>`}).join('')||'<p>没有发现同题不同答案。</p>'}</details>`;
  }
  function viewHtml(){
    return `<div class="sync-hero"><div class="eyebrow">YOUR SPACE / DEVICE LINK</div><h1>我的学习空间</h1><p>免登录 · 各自离线刷题 · 联网合并记录</p><button class="secondary sync-settings-link" data-settings>打开设置</button></div><p class="sync-message" role="status" aria-busy="${working}">${esc(message||S.getStatus())}</p>${flowHtml()}<div class="sync-grid"><section class="card sync-panel"><h2>同步状态</h2><p>${esc(S.getStatus())}</p><div class="button-row"><button class="primary" data-sync-now ${working?'disabled':''}>立即同步</button><button class="secondary" data-sync-backup>备份本机记录</button></div></section><section class="card sync-panel"><h2>添加另一台设备</h2><p>让另一台设备输入临时码或扫描二维码，然后在这里确认。</p><button class="primary" data-pair-create ${working||flow?'disabled':''}>生成临时配对码</button></section></div><section class="card sync-panel"><h2>连接已有设备</h2><p>输入另一台设备的临时码，也支持旧版长配对码。已有记录会先备份，再展示合并预览。</p><label for="device-name">这台设备的名称</label><input id="device-name" maxlength="60" value="${esc(deviceInput)}"><label for="pairing-input">临时配对码 / 配对链接</label><div class="join-row"><input id="pairing-input" autocomplete="off" value="${esc(joinInput)}" placeholder="例如 ABCDE 23456"><button class="primary" data-join ${working||flow?'disabled':''}>连接</button></div><div class="button-row"><button class="secondary" data-pair-scan ${working||flow?'disabled':''}>扫码连接</button><button class="secondary" data-pair-image ${working||flow?'disabled':''}>从二维码图片读取</button></div></section><section class="card sync-panel"><div class="sync-section-head"><h2>我的设备</h2><button class="secondary" data-devices-refresh>刷新</button></div><p class="muted">每台新版设备有独立凭证。旧版设备升级并同步后才会出现在这里。</p>${devices.map(device=>`<div class="device-row"><div><strong>${esc(device.name)}${device.id===S.profile().deviceId?' · 本机':''}</strong><small>${device.revokedAt?'已解绑':'最近连接 '+date(device.lastSeen)}</small></div>${!device.revokedAt&&device.id!==S.profile().deviceId?`<button class="secondary" data-device-revoke="${device.id}">解绑</button>`:''}</div>`).join('')||'<p>联网同步后显示已连接设备。</p>'}<button class="secondary" data-device-rename>保存本机名称</button></section>${conflictsHtml()}<details class="card sync-panel"><summary>本机安全备份 <span>${backups.length} 份</span></summary><p class="muted">备份保存在这台设备，卸载或清除网站数据会删除；可下载到文件。恢复会新建独立学习空间，不回退其他设备的云端记录。</p><button class="secondary" data-backup-import>从备份文件恢复副本</button>${backups.map(item=>`<div class="backup-row"><div><strong>${esc(item.label)}</strong><small>${date(item.createdAt)} · ${item.state.sessions?.length||0} 轮</small></div><div class="button-row"><button class="secondary" data-backup-download="${item.id}">下载</button><button class="secondary" data-backup-restore="${item.id}">恢复副本</button></div></div>`).join('')||'<p>连接或合并前会自动创建备份。</p>'}</details>`;
  }
  function bind(){
    if(view!=='sync'){window.TijianScanner?.stop();return}
    const on=(selector,action)=>document.querySelector(selector)?.addEventListener('click',()=>run(action));
    document.querySelector('#pairing-input')?.addEventListener('input',event=>joinInput=event.target.value);
    document.querySelector('#device-name')?.addEventListener('input',event=>deviceInput=event.target.value);
    on('[data-sync-now]',async()=>{await S.sync();await refreshLists();message=S.getStatus()});
    on('[data-pair-create]',createInvite);on('[data-join]',()=>startJoin(joinInput));
    on('[data-pair-cancel]',cancelPairing);on('[data-merge-confirm]',commitMerge);
    on('[data-pair-copy]',async()=>{await navigator.clipboard.writeText('https://xubanghao090828.github.io/tijian-quiz-public/#pair='+flow.code);message='已复制临时配对链接'});
    on('[data-pair-approve]',async()=>{await S.api('/api/pair/approve',{id:flow.id,deviceId:flow.last.deviceId,verifyCode:flow.last.verifyCode});flow.status='approved';flow.last=null;saveFlow();message='已允许连接，请在另一台设备确认合并。';await refreshLists()});
    on('[data-devices-refresh]',async()=>{await refreshLists();message='设备列表已刷新'});
    on('[data-device-rename]',async()=>{await S.ensureDevice();await S.api('/api/devices/rename',{name:deviceInput});S.persistProfile({...S.profile(),name:deviceInput.trim().slice(0,60)||S.deviceName()});await refreshLists();message='设备名称已更新'});
    on('[data-sync-backup]',async()=>{await B.create(S.profile(),S.snapshot(),'手动备份');backups=await B.list();message='本机记录已备份，可在下方下载'});
    on('[data-backup-import]',()=>{const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=()=>{if(input.files?.[0])run(()=>B.importFile(input.files[0],S.profile(),S.snapshot()))};input.click()});
    on('[data-pair-scan]',()=>window.TijianScanner.start(value=>{joinInput=value;run(()=>startJoin(value))}));
    on('[data-pair-image]',()=>window.TijianScanner.image(value=>{joinInput=value;run(()=>startJoin(value))}));
    document.querySelectorAll('[data-device-revoke]').forEach(button=>button.onclick=()=>{if(confirm('解绑这台设备？它将停止同步，已保存在它本机的记录不会被远程删除。'))run(async()=>{await S.api('/api/devices/revoke',{deviceId:button.dataset.deviceRevoke});await refreshLists();message='设备已解绑'})});
    document.querySelectorAll('[data-backup-download]').forEach(button=>button.onclick=()=>run(()=>B.download(button.dataset.backupDownload)));
    document.querySelectorAll('[data-backup-restore]').forEach(button=>button.onclick=()=>{if(confirm('恢复为独立学习空间？当前记录会先备份，其他设备的记录保持原样。'))run(()=>B.restore(button.dataset.backupRestore,S.profile(),S.snapshot()))});
    document.querySelectorAll('[data-sync-review]').forEach(button=>button.onclick=()=>{historySessionId=button.dataset.syncReview;historyQuestionIndex=Number(button.dataset.syncQuestion);setView('history')});
    const qr=document.querySelector('[data-pair-qr]');if(qr&&window.qrcodegen){
      const code=qrcodegen.QrCode.encodeText('https://xubanghao090828.github.io/tijian-quiz-public/#pair='+flow.code,qrcodegen.QrCode.Ecc.MEDIUM),border=4,size=code.size+8;
      let path='';for(let y=0;y<code.size;y++)for(let x=0;x<code.size;x++)if(code.getModule(x,y))path+=`M${x+border},${y+border}h1v1h-1z`;
      qr.innerHTML=`<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="临时配对二维码" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
    }
    if(!pollBusy&&!working&&Date.now()-lastPoll>3500)queueMicrotask(poll);
    if(!backups.length)B.list().then(items=>{if(items.length){backups=items;draw()}}).catch(()=>{});
  }
  S.viewHtml=viewHtml;S.bind=bind;
  window.addEventListener('tijian-sync-complete',()=>{if(view==='sync')refreshLists().then(draw).catch(()=>{})});
  setInterval(poll,4000);
  let previousView=null;
  new MutationObserver(()=>{if(view==='sync'&&previousView!=='sync'){previousView=view;refreshLists().then(draw).catch(error=>{message=error.message;draw()})}else previousView=view}).observe(document.querySelector('#app'),{childList:true});
  if(location.hash.startsWith('#pair=')){joinInput=decodeURIComponent(location.hash.slice(6));history.replaceState(null,'',location.pathname+location.search);setView('sync');message='已读取配对码，请点“连接”并在原设备确认。';draw()}
})();


