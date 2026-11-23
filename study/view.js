(function(root){
  'use strict';
  const C=root.TijianStudyCore,V=root.TijianStudySchema,S=root.TijianStudyStore,Y=root.TijianStudySync,A=root.TijianStudyAI,I=root.TijianStudyImport;
  const labels={vocab:'英语背默',short:'简答练习'};
  const directions={zh2en:'看中文拼英文',en2zh:'看英文写中文'};
  const space=()=>root.TIJIAN_PROFILE.id;
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let pendingPanel=null,aiRequest=null,aiMode=null,historyEdit=null,model=null,serial=0,entry=null,busy=false,pendingWrite=Promise.resolve(),problem='',message='',importer=null;
  const op=(table,value,method)=>({table,value,method});
  const draft=()=>model?.drafts.find(d=>d.id===model.kind);
  const commands=(cmd,label,primary=false,disabled=false)=>`<button type="button" class="${primary?'primary':'secondary'}" data-study-do="${cmd}" ${disabled?'disabled':''}>${escape(label)}</button>`;
  function write(ops){
    const id=space();
    const task=pendingWrite.catch(()=>{}).then(()=>S.write(id,ops));
    pendingWrite=task;
    return task;
  }
  function redraw(){if(document.querySelector('[data-study-view]'))draw(document.querySelector('[data-study-view]'));}
  async function reload(){
    const {content,events,drafts}=await S.snapshot(space());
    return {content,events,drafts,projection:C.project(events)};
  }
  function queue(kind,dir,what){
    const now=Date.now(), lookup=new Map(model.content.filter(i=>i.module===kind&&(kind==='vocab'||i.ready)).map(i=>[i.id,i]));
    const rows=[...lookup.values()].map(i=>({id:i.id,importOrder:i.importOrder||0,card:model.cards.get(C.cardKey(kind,i.id,dir))}));
    return rows.filter(r=>what==='new'?!r.card:r.card&&+new Date(r.card.dueAt)<=now).sort((a,b)=>(+new Date(a.card?.dueAt||0))-(+new Date(b.card?.dueAt||0))||a.importOrder-b.importOrder||a.id.localeCompare(b.id)).slice(0,30).map(r=>r.id);
  }
  function queueSize(kind,dir,what){
    let n=0;for(const i of model.content){if(i.module!==kind||kind==='short'&&!i.ready)continue;const c=model.cards.get(C.cardKey(kind,i.id,dir));if(what==='new'?!c:c&&+new Date(c.dueAt)<=Date.now())n++;}return n;
  }
  let engine;
  async function rebuild(){
    const active=model;
    const scheduler=await (engine||=FSRS.DefaultScheduler({version:'FSRS-7',desiredRetention:.9,enableShortTerm:true,learningSteps:['1m','10m'],relearningSteps:['1m','10m'],allowModelOverride:false,enableFuzz:false,maximumInterval:365}));
    if(active!==model)return;
    const projection=C.project(active.events);
    active.projection=projection;active.cards=C.schedule(scheduler,projection.reviews);
  }
  async function mount(kind){
    const el=document.querySelector('[data-study-view]');if(!el)return;
    if(model?.kind===kind&&model.space===space()&&model.cards){if(pendingPanel){model.panel=pendingPanel;pendingPanel=null;}draw(el);if(model.syncOn)syncInBackground();return;}
    const request=++serial,spaceId=space();
    problem=message='';importer=null;entry=null;historyEdit=null;aiMode=null;
    el.innerHTML='<p class="card study-pane">正在读取本机学习记录…</p>';
    try{
      await pendingWrite.catch(()=>{});const data=await reload();
      if(request!==serial||spaceId!==space()||!el.isConnected)return;
      model={...data,kind,space:spaceId,panel:kind==='short'&&pendingPanel?pendingPanel:'home',dir:'zh2en'};pendingPanel=null;
      model.syncOn=await Y.enabled(spaceId);
      model.ai=A?.load(spaceId)||null;
      await rebuild();if(request===serial&&el.isConnected)draw(el);
      if(model.syncOn)syncInBackground();
    }catch(e){if(request===serial&&el.isConnected)el.innerHTML=`<section class="card study-pane" role="alert"><p>无法读取本机学习记录：${escape(e.message)}</p><button data-go="home" class="secondary">返回总览</button></section>`,el.querySelector('button').onclick=()=>setView('home');}
  }
  function syncInBackground(){
    if(!model?.syncOn)return;
    const active=model;
    Y.sync(active.space).then(async result=>{
      if(active!==model)return;
      model.syncStatus=result.status;
      if(result.received){
        const pulled=await S.read(active.space,'events');
        if(active!==model)return;
        const combined=new Map(pulled.map(e=>[e.id,e]));for(const e of model.events)combined.set(e.id,e);
        model.events=[...combined.values()];
        await rebuild();
      }
      const banner=document.querySelector('[data-study-sync-status]');
      if(banner)banner.textContent=model.syncStatus;
    }).catch(()=>{});
  }
  function show(el){
    const {kind,panel,dir}=model,d=draft(), list=model.content.filter(i=>i.module===kind);
    const heading=`<header class="study-heading"><div><div class="eyebrow">${kind==='vocab'?'VOCABULARY':'SHORT ANSWER'}</div><h1>${labels[kind]}</h1></div>${commands('home','返回总览')}</header>`;
    const navigation=`<div class="study-actions">${commands('landing','练习',panel==='home')}${commands('library',kind==='vocab'?'词表管理':'简答题库',panel==='library')}${commands('history','作答记录',panel==='history')}${kind==='short'&&A?commands('ai','AI 设置',panel==='ai'):''}</div>`;
    const banner=`<p role="alert" class="study-error" data-study-error${problem?'':' hidden'}>${escape(problem)}</p><p role="status" class="study-status" data-study-status${message?'':' hidden'}>${escape(message)}</p>`;
    if(panel==='practice'&&d)return heading+banner+exercise(d);
    if(panel==='ai')return heading+navigation+banner+aiConfig();
    if(panel==='library')return heading+navigation+banner+library(kind,list);
    if(panel==='history')return heading+navigation+banner+history(kind);
    const newCount=queueSize(kind,dir,'new'),dueCount=queueSize(kind,dir,'due');
    return heading+navigation+banner+`<section class="card study-pane"><h2>${kind==='vocab'?'选择背默方向':'简答练习与复习'}</h2>
      <p>本机离线可用 · 两类练习各有独立复习计划</p>
      ${kind==='vocab'?`<label>练习方向 <select data-study-dir><option value="zh2en" ${dir==='zh2en'?'selected':''}>${directions.zh2en}</option><option value="en2zh" ${dir==='en2zh'?'selected':''}>${directions.en2zh}</option></select></label>`:''}
      <div class="study-actions">${d?commands('continue','继续上次练习',true):''}${commands('new',`学新${kind==='vocab'?'词':'题'} · ${newCount}`,!d,!newCount||!!d)}${commands('due','到期复习 · '+dueCount,false,!dueCount||!!d)}</div>
      ${d?`<p>已保存第 ${d.index+1} / ${d.queue.length} ${kind==='vocab'?'词':'题'}的进度${d.direction?' · '+directions[d.direction]:''}。</p>${commands('end','结束本轮')}`:''}
      <details class="study-sync"><summary>设备同步</summary><p>新作答可通过原有配对同步，包含原始输入和评分。题库仍通过导入、备份或配对合并。</p><div class="study-actions">${commands('sync-toggle',model.syncOn?'关闭新模块同步':'启用新模块同步')}${model.syncOn?commands('sync-now','立即同步'):''}</div><p data-study-sync-status>${escape(model.syncStatus||'')}</p></details>
      ${!list.length?`<p>先导入自己的${kind==='vocab'?'词表':'简答题库'}，或者用示例表体验。</p>${commands('library','前往导入',true)}`:''}</section>`;
  }
  function aiConfig(){
    const settings=A.settings(space()),type=aiMode||settings.active,config=settings.profiles[type];
    const info={
      ollama:{url:'http://127.0.0.1:11434',model:'qwen3.5:9b',desc:'电脑上启动 Ollama。手机连接电脑时，填写电脑的局域网 IP，不能填手机自己的 127.0.0.1。'},
      cloud:{url:'https://api.deepseek.com',model:'deepseek-flash',desc:'使用自己的 DeepSeek API Key。密钥只保存在本次应用会话，关闭或刷新后需重新输入。联网批改可能产生服务费用。'},
      phone:{url:'http://127.0.0.1:11434/v1',model:'可留空，测试连接时读取',desc:'在荣耀上单独打开 Thinai 或 AiPaca，加载模型并启动本机 API，再按运行器实际端口填写。推荐在题间 APK 里使用。'}
    }[type];
    const hasKey=config&&A.hasKey(space(),config);
    return `<section class="card study-pane"><h2>AI 连接</h2><p>一次只使用选中的连接。可随时改用本题离线自评。</p>
      <label>连接方式<select data-study-ai-mode>${Object.entries(A.types).map(([id,name])=>`<option value="${id}" ${id===type?'selected':''}>${escape(name)}${settings.active===id&&settings.profiles[id]?'（当前）':''}</option>`).join('')}</select></label>
      <p>${escape(info.desc)}</p>
      ${type==='ollama'?`<details><summary>电脑连接帮助</summary><p>使用网页时，电脑 Ollama 需允许当前来源 <code>${escape(location.origin)}</code>。手机连电脑还需同一局域网和允许的监听地址。</p></details>`:type==='phone'?'<p><a href="https://github.com/Abhinivesh2729/Thinai" target="_blank" rel="noopener noreferrer">Thinai</a> · <a href="https://github.com/dojekon/AIPaca" target="_blank" rel="noopener noreferrer">AiPaca</a></p>':''}
      <form data-study-form="ai"><label>服务地址<input name="href" required type="url" placeholder="${info.url}" value="${escape(config?.href||(type==='cloud'?info.url:''))}"></label>
      <label>模型名称<input name="model" ${type==='phone'?'maxlength="1024"':'required maxlength="100"'} value="${escape(config?.model)}" placeholder="${info.model}"></label>
      ${type!=='ollama'?`<label>${type==='cloud'?'DeepSeek API Key':'运行器令牌（若运行器要求）'}<input type="password" name="key" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="${hasKey?'本次会话已设置，留空沿用':''}"></label>` : ''}
      ${hasKey?`<label class="study-check"><input type="checkbox" name="clearKey"> 清除本次会话中的密钥</label>`:''}
      <label class="study-check"><input name="enabled" type="checkbox" ${config?.enabled?'checked':''}> 提交后使用此连接批改${type==='cloud'?'（题干、评分标准和作答会发送给 DeepSeek）':''}</label>
      <div class="study-actions"><button type="submit" class="primary">保存并选用</button>${commands('ai-test','测试连接')}</div></form></section>`;
  }
  function readAIForm(form){
    const data=new FormData(form),type=aiMode||A.settings(space()).active;
    const key=String(data.get('key')||'').trim();
    if(key.length>512||/[\x00-\x20\x7f]/.test(key))throw Error('密钥格式不正确，请检查是否含空格');
    return {space:space(),type,href:data.get('href'),model:String(data.get('model')||'').trim(),enabled:data.get('enabled')==='on',key:key||undefined,clearKey:data.get('clearKey')==='on'};
  }
  function stopAI(id){
    if(aiRequest&&(!id||aiRequest.attemptId===id)){
      clearTimeout(aiRequest.timer);aiRequest.controller.abort();aiRequest=null;
    }
  }
  function aiStatus(){const n=document.querySelector('[data-study-ai-status]');if(n)n.textContent=aiRequest?.status||'';}
  function easyAI(d){
    const attempt=responseFor(d)?.submit,config=model.ai;
    if(!A||!attempt||!config?.enabled||d.revising)return;
    stopAI();const request={attemptId:d.attemptId,id:C.uuid(),controller:new AbortController(),status:'AI 正在批改，可先核对得分点。'};
    aiRequest=request;
    request.timer=setTimeout(()=>{if(aiRequest!==request)return;request.status='已超过 5 秒，可继续等待、离线自评或重试。';aiStatus();},5000);
    const owner=model,signal=AbortSignal.any([request.controller.signal,AbortSignal.timeout(60000)]);
    void A.suggest(config,request.id,attempt,signal).then(async result=>{
      const live=draft(),grade=model?.projection.attempts.get(request.attemptId)?.status?.grade;
      if(aiRequest!==request||owner!==model||live?.attemptId!==request.attemptId||live.phase!=='grade'||live.revising||grade)return;
      const event=makeEvent(live,'suggested',result);
      await write([op('events',event,'add')]);
      if(owner!==model)return;
      model.events.push(event);await rebuild();syncInBackground();
      if(aiRequest===request){request.status='AI 建议已到，可一键接受或调整分项。';renderAIPanel(live);}
    }).catch(e=>{
      if(aiRequest!==request)return;
      request.status=(signal.aborted?'本次批改已超时。':e.message)+' 可离线自评或重试。';renderAIPanel(d);
    }).finally(()=>clearTimeout(request.timer));
    renderAIPanel(d);
  }
  function renderAIPanel(d){const n=document.querySelector('[data-study-ai-panel]');if(n&&draft()?.attemptId===d.attemptId)n.innerHTML=aiPanel(d);}
  function aiPanel(d){
    if(!A||!model.ai?.enabled||d.revising)return '';
    if(d.aiOffline)return commands('ai-retry','重新启用 AI 批改');
    const owner=responseFor(d),last=owner?.suggestions?.filter(e=>{try{return e.rubricVersion===currentItem(d).rubricVersion&&A.verify({points:e.points},owner.submit);}catch{return false;}}).sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)).at(-1);
    const pending=aiRequest?.attemptId===d.attemptId?aiRequest.status:'';
    return `<p data-study-ai-status role="status">${escape(pending||(!last?'可请求 AI 逐题批改。':''))}</p>
      ${last?`<details open><summary>AI 建议 · ${escape(last.provider)} / ${escape(last.model)}</summary><ul class="study-items">${last.points.map(p=>`<li><strong>${escape(currentItem(d).points.find(x=>x.pointId===p.pointId)?.label)} · ${p.score} 分</strong><p>${escape(p.reason)}</p>${p.evidence?`<blockquote>${escape(p.evidence)}</blockquote>`:''}<small>${p.missing?'有遗漏 ':''}${p.contradiction?'有矛盾 ':''}${p.needsReview?'请复核':''}</small></li>`).join('')}</ul></details>`:''}
      <div class="study-actions">${last?commands('ai-accept:'+last.id,'接受该建议',true)+commands('ai-fill:'+last.id,'用建议填分后修改'):''}${commands('ai-retry',pending||last?'重试批改':'请求批改')}${commands('ai-offline','离线自评')}</div>`;
  }
  function library(kind,items){
    const short=kind==='short', options=importer&&importer.kind===kind?importer:null;
    return `<section class="card study-pane"><h2>${short?'导入简答题与得分点':'导入单词表'}</h2>
      <p>${short?'选择包含两张表的 .xlsx，或同时选题目 CSV 和得分点 CSV。参考答案或评分点不全时存为草稿。':'支持 UTF-8 CSV 和 XLSX。预览后才写入词表。'}</p>
      <p class="study-links">${short?'<a href="study/templates/short_questions.csv" download>题目 CSV</a> <a href="study/templates/scoring_points.csv" download>得分点 CSV</a>':'<a href="study/templates/vocab.csv" download>词表 CSV 模板</a>'}</p>
      <label>选择文件 <input type="file" data-study-files accept=".csv,.xlsx" ${short?'multiple':''}></label>
      ${options?previewHtml(options,items):''}</section>
      <section class="card study-pane"><h2>本机${short?'简答题':'词表'} · ${items.length}</h2>
      ${items.length?`<ul class="study-items">${items.slice(0,60).map(i=>`<li><strong>${escape(short?i.stem:i.en)}</strong><small>${short?(i.ready?'评分标准 v'+i.rubricVersion:'待完善草稿'):escape(i.zh.join('；'))}</small>${short?commands('edit:'+i.id,'查看／编辑评分标准'):''}</li>`).join('')}</ul>${items.length>60?'<p>这里只预览前 60 条，练习和复习会使用完整题库。</p>':''}`:'<p>还没有导入内容。</p>'}</section>
      ${entry?editRubric(entry):''}`;
  }
  function previewHtml(options,items){
    const {tables,mapping,duplicate,result:r}=options;
    return `<div class="study-preview"><p>待导入 ${r.items.length} 条 · 错误 ${r.errors.length} · 提醒 ${r.warnings.length}</p>
      ${options.kind==='vocab'?`<label>重复英文 <select data-study-duplicate><option value="skip">跳过</option><option value="merge" ${duplicate==='merge'?'selected':''}>合并可接受释义</option><option value="separate" ${duplicate==='separate'?'selected':''}>另建词条</option></select></label>`:''}
      <details><summary>查看字段映射</summary>${tables.map((t,i)=>{
        const headers=(t.rows.find(r=>r.cells.some(v=>String(v??'').trim()))?.cells||[]).map(v=>String(v??'').trim()).filter(Boolean),type=t.type||'vocab';
        return `<fieldset><legend>${escape(t.source)}</legend>${options.kind==='short'?`<label>表用途 <select data-study-table="${i}"><option value="questions">题目表</option><option value="points" ${type==='points'?'selected':''}>得分点表</option></select></label>`:''}
        ${[...I.requirements[type],...I.optional[type]].map(k=>`<label>${k} <select data-study-map="${k}" data-table="${i}"><option value="">默认同名列</option>${headers.map(h=>`<option value="${escape(h)}" ${mapping[t.source]?.[k]===h?'selected':''}>${escape(h)}</option>`).join('')}</select></label>`).join('')}</fieldset>`;
      }).join('')}</details>
      ${r.errors.length||r.warnings.length?`<ul class="study-report">${[...r.errors,...r.warnings].slice(0,80).map(i=>`<li>${escape(i)}</li>`).join('')}</ul>`:''}
      <ul class="study-items">${r.items.slice(0,8).map(i=>`<li>${escape(i.en||i.stem)} <small>${i.module==='short'?(i.ready?'可练习':'草稿'):escape(i.zh.join('；'))}</small></li>`).join('')}</ul>
      ${commands('import',r.errors.length?'修正错误后导入':`确认导入 ${r.items.length} 条`,true,!!r.errors.length||!r.items.length)}</div>`;
  }
  function editRubric(item){
    return `<section class="card study-pane" data-study-rubric><h2>编辑评分标准</h2><p>${escape(item.stem)}</p><form data-study-form="rubric">
      <label>参考答案<textarea name="reference" rows="3" maxlength="12000">${escape(item.reference)}</textarea></label>
      ${(item.points.length?item.points:[{pointId:'p1',label:'',maxScore:1,critical:false,aliases:[]}]).map((p,i)=>`<fieldset data-rubric-point="${escape(p.pointId)}"><legend>得分点 ${i+1}</legend><label>名称<input name="label" required maxlength="500" value="${escape(p.label)}"></label><label>满分<input name="maxScore" type="number" min="0" max="10000" step=".01" required value="${p.maxScore}"></label><label class="study-check"><input name="critical" type="checkbox" ${p.critical?'checked':''}> 关键点</label><label>关键词（用 | 分隔）<input name="aliases" maxlength="3000" value="${escape(p.aliases.join('|'))}"></label><label>得分条件<textarea name="conditions" rows="2" maxlength="12000">${escape(p.conditions)}</textarea></label><label>部分得分说明<textarea name="partialRule" rows="2" maxlength="12000">${escape(p.partialRule)}</textarea></label>${commands('remove-point:'+i,'移除该点')}</fieldset>`).join('')}
      <div class="study-actions">${commands('add-point','添加得分点')}<button class="primary" type="submit">保存新的评分版本</button>${commands('cancel-edit','关闭')}</div></form></section>`;
  }
  function currentItem(d){return d.item||model.content.find(i=>i.id===d.queue[d.index]);}
  function responseFor(d){return model.projection.attempts.get(d.attemptId);}
  function exercise(d){
    const item=currentItem(d);
    if(!item)return `<section class="card study-pane"><p>缺少当前题目内容，作答记录已保留。</p>${commands('end','结束本轮')}</section>`;
    const isWord=d.id==='vocab',at=responseFor(d),submitted=at?.submit,grade=at?.status?.grade;
    const prompt=isWord?(d.direction==='zh2en'?item.zh.join('；'):item.en):item.stem;
    const top=`<div class="study-progress"><span>${d.queueKind==='due'?'到期复习':'新内容训练'} · ${d.index+1}/${d.queue.length}</span>${commands('landing','退出并保留进度')}</div>`;
    let body='';
    if(d.phase==='learn'){
      body=`<p class="study-answer">${escape(item.en)} <small>${escape(item.pos)}</small></p><p>${escape(item.zh.join('；'))}</p>${item.example?`<p>${escape(item.example)}</p>`:''}${commands('remember','遮住答案，开始默写',true)}`;
    }else if(d.phase==='answer'){
      body=`<h2>${escape(prompt)}</h2><form data-study-form="answer">
      <label>${isWord?(d.direction==='zh2en'?'输入英文拼写':'输入中文释义'):'输入你的答案'}
      ${isWord?`<input name="answer" required maxlength="1000" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="done" value="${escape(d.input)}">`:`<textarea name="answer" rows="6" maxlength="12000" required>${escape(d.input)}</textarea>`}</label>
      <div class="study-actions"><button class="primary" type="submit">${isWord?'检查答案':'提交并批改'}</button>${commands('hint',d.hinted?'收起／查看提示':'查看提示')}</div></form>
      ${d.showHint?`<p class="study-note">提示：${escape(isWord?(d.direction==='zh2en'?item.en:item.zh.join('；')):item.reference)}</p>`:''}`;
    }else if(d.phase==='grade'&&submitted){
      if(isWord)body=`<h2>${escape(item.en)}</h2><p>你的作答：${escape(submitted.raw)}</p><p>参考释义：${escape(item.zh.join('；'))}</p>
        <div class="study-actions">${commands('vgrade:3','正确',true)}${commands('vgrade:2','部分正确')}${commands('vgrade:1','错误')}</div>`;
      else body=gradingForm(item,submitted,d);
    }else if(d.phase==='result'&&submitted){
      const rating=submitted.rating??grade?.rating;
      if(rating==null)return `<section class="card study-pane">${top}<p>这份作答等待评分或冲突处理。</p>${commands('history','查看作答记录')}</section>`;
      if(isWord){
        const reference=d.direction==='zh2en'?[item.en,...item.spellings].join(' / '):item.zh.join('；');
        const wrong=d.direction==='zh2en'&&!C.checkSpelling(item,submitted.raw), correct=d.direction==='zh2en'?!wrong:grade?.selfAssessment===3;
        const correction=Boolean(at.corrections.length);
        body=`<h2>${correct?'答对了':'核对并订正'}</h2><p>首次作答：${escape(submitted.raw)}</p>${wrong?difference(submitted.raw,item.en):''}
          ${d.hideReference?'':`<p>参考答案：${escape(reference)}</p>`}
          ${!correct&&!correction?(d.hideReference?`<form data-study-form="correction"><label>重输答案<input name="correction" required maxlength="1000" autocomplete="off" autocapitalize="none" spellcheck="false" value="${escape(d.correction)}"></label><button class="primary" type="submit">保存订正</button></form>${commands('show-ref','再看一眼参考答案')}`:commands('hide-ref','隐藏答案后重输',true)):''}
          ${correction?'<p>订正已保存；首次作答结果不变。</p>':''}
          ${correct||correction?commands('next','下一项',true):''}`;
      }else{
        body=`<h2>已确认成绩 · ${grade?.score}/${grade?.maxScore}</h2><p>你的原答案</p><blockquote>${escape(submitted.raw)}</blockquote><p>参考答案</p><blockquote>${escape(item.reference)}</blockquote>
          <ul class="study-items">${item.points.map(p=>`<li>${escape(p.label)} <small>${grade?.scores[p.pointId]}/${p.maxScore}</small></li>`).join('')}</ul>
          <form data-study-form="correction"><label>订正（可选）<textarea name="correction" rows="3" maxlength="12000">${escape(d.correction)}</textarea></label><div class="study-actions"><button class="secondary" type="submit">保存订正</button>${commands('revise','修订评分')}${commands('next','下一题',true)}</div></form>`;
      }
      const schedule=model.cards.get(C.cardKey(d.id,item.id,d.direction));
      body+=`<p class="study-note">记忆评级：${C.ratingText[rating]||'待核对'}${schedule?' · 下次复习 '+escape(new Date(schedule.dueAt).toLocaleString('zh-CN')):''}</p>`;
    }else body='<p>这次作答尚未恢复，退出后可重新打开查看。</p>';
    return `<section class="card study-pane">${top}${body}</section>`;
  }
  function difference(raw,target){
    const a=Array.from(C.normalizeEn(raw)),b=Array.from(C.normalizeEn(target));let i=0;
    while(i<a.length&&i<b.length&&a[i]===b[i])i++;
    if(i>=b.length)return '<p>提示：末尾多了字符。</p>';
    return `<p>从第 ${i+1} 个字符开始与标准拼写不同。</p>`;
  }
  function gradingForm(item,submitted,d,editingHistory=false){
    const matches=new Map(C.keywordHints(item,submitted.raw).map(v=>[v.pointId,v.matches]));
    return `<h2>${escape(item.stem)}</h2><p>你的原答案</p><blockquote>${escape(submitted.raw)}</blockquote>
    <details><summary>对照参考答案</summary><blockquote>${escape(item.reference)}</blockquote></details>
    <p class="study-note">词语匹配只提示可能覆盖的内容。请核对句意、否定和得分条件，再填各项分数。</p>
    <div data-study-ai-panel>${editingHistory?'':aiPanel(d)}</div><form data-study-form="${editingHistory?'history-grade':'grade'}">${item.points.map(p=>`<fieldset><legend>${escape(p.label)}${p.critical?' · 关键点':''}</legend>
      <p>${matches.get(p.pointId).length?'可能相关：'+escape(matches.get(p.pointId).join('、')):'没有直接匹配，请人工判断。'}</p>
      ${p.conditions?`<p>${escape(p.conditions)}</p>`:''}${p.partialRule?`<p>${escape(p.partialRule)}</p>`:''}
      <label>得分（满分 ${p.maxScore}）<input name="point" data-point="${escape(p.pointId)}" type="number" min="0" max="${p.maxScore}" step=".01" required value="${escape(d.scores?.[p.pointId])}"></label></fieldset>`).join('')}
      <label>本次回忆难度 <select name="manual"><option value="">按分项结果</option><option value="2" ${d.manual===2?'selected':''}>困难</option><option value="1" ${d.manual===1?'selected':''}>重来</option></select></label>
      <button class="primary" type="submit">${d.revising?'确认修订':'确认得分'}</button></form>`;
  }
  function history(kind){
    const list=[...model.projection.attempts.values()].filter(e=>e.submit?.module===kind).sort((a,b)=>b.submit.answeredAt-a.submit.answeredAt);
    return `<section class="card study-pane"><h2>作答历史 · ${list.length}</h2>${list.length?`<p>按时间由新到旧显示最近 60 条，全部练习均保留在本机及备份中。</p>${list.slice(0,60).map(a=>`<details class="study-history"><summary>${escape(kind==='vocab'?a.submit.snapshot.en:a.submit.snapshot.stem)} · ${escape(new Date(a.submit.answeredAt).toLocaleString('zh-CN'))}</summary><p>原作答：${escape(a.submit.raw)}</p>${!model.content.some(x=>x.id===a.submit.itemId)?`<p>待关联题库：可以从这次作答的参考快照恢复该词或题。</p>${commands('link-item:'+a.submit.attemptId,'恢复这条题库内容')}`:''}${a.status?.heads?.length>1?`<p>评分有冲突，保留了两边的记录。${a.status.grade?'复习计划暂按共同的上一版。':'解决后才计入复习。'}</p>${kind==='short'?a.status.heads.map(h=>`<div class="study-note"><p>${escape(new Date(h.createdAt).toLocaleString('zh-CN'))} · ${escape(h.deviceId.slice(-6))} · ${h.score}/${h.maxScore}</p>${a.submit.snapshot.points.map(p=>`<p>${escape(p.label)}：${h.scores[p.pointId]}/${p.maxScore}</p>`).join('')}${commands('resolve:'+h.id,'采用这份评分')}</div>`).join(''):''}`:''}${a.status?.grade?.score!==undefined?`<p>得分：${a.status.grade.score}/${a.status.grade.maxScore} · 评分标准 v${a.submit.snapshot.rubricVersion}</p>${a.submit.snapshot.points.map(p=>`<p>${escape(p.label)}：${a.status.grade.scores[p.pointId]}/${p.maxScore}</p>`).join('')}`:''}<p>记忆评级：${C.ratingText[a.submit.rating??a.status?.grade?.rating]||'待确认'}</p>${a.corrections.map(c=>`<p>订正：${escape(c.raw)}</p>`).join('')}${kind==='short'&&a.status.grade&&a.status.heads.length===1?commands('history-revise:'+a.submit.attemptId,'修订这次评分'):''}</details>`).join('')}`:'<p>还没有作答记录。</p>'}</section>`+(historyEdit?`<section class="card study-pane" data-study-history-edit><h2>保留原作答，修订评分</h2>${gradingForm(historyEdit.submit.snapshot,historyEdit.submit,{scores:historyEdit.grade.scores,manual:historyEdit.grade.manual,revising:true},true)}${commands('history-cancel','取消修订')}</section>`:'');
  }
  function draw(el){el.innerHTML=show(el);el.onclick=onClick;el.onchange=onChange;el.oninput=onInput;el.onsubmit=onSubmit;el.onkeydown=e=>{if(e.key==='Enter'&&(e.isComposing||e.keyCode===229))e.preventDefault();};}
  function say(text,error=false){if(error)problem=text;else message=text;const node=document.querySelector(error?'[data-study-error]':'[data-study-status]');if(node){node.textContent=text;node.hidden=!text;}}
  function run(fn){if(busy)return;busy=true;say('',true);return Promise.resolve().then(fn).catch(e=>say(e.message||'操作没有完成，请稍后重试',true)).finally(()=>{busy=false;});}
  async function updateDraft(value,extras=[]){
    await write([op('drafts',value),...extras]);
    const i=model.drafts.findIndex(x=>x.id===value.id);
    if(i>=0)model.drafts[i]=value;else model.drafts.push(value);
    model.events.push(...extras.filter(x=>x.table==='events').map(x=>x.value));if(extras.length){await rebuild();syncInBackground();}
  }
  function makeEvent(d,type,fields={}){
    const event={id:type==='submitted'?d.attemptId:C.uuid(),attemptId:d.attemptId,module:d.id,type,deviceId:root.TIJIAN_PROFILE.deviceId,createdAt:Date.now(),...fields};
    if(!V.event(event))throw Error('作答内容超出保存范围或格式不完整，请检查后重试');
    return event;
  }
  function setPanel(value){if(value!=='history')historyEdit=null;model.panel=value;message=problem='';redraw();if(value!=='practice')window.scrollTo(0,0);}
  function makeDraft(d,index,items){
    const item=items?.find(i=>i.id===d.queue[index])||model.content.find(i=>i.id===d.queue[index]);
    if(!item)throw Error('题库缺少本轮下一项内容；原作答记录仍保留');
    return {...d,index,item,attemptId:C.uuid(),input:'',correction:'',scores:{},manual:null,revising:false,hinted:false,showHint:false,hideReference:false,aiOffline:false,phase:d.id==='vocab'&&d.queueKind==='new'?'learn':'answer'};
  }
  async function finishDraft(d){
    await write([{table:'drafts',method:'delete',id:d.id}]);model.drafts=model.drafts.filter(x=>x.id!==d.id);setPanel('home');
  }
  function applyPreview(){
    importer.result=I.preview(importer.tables,importer.kind,model.content,{mapping:importer.mapping,duplicate:importer.duplicate});redraw();
  }
  function onClick(e){
    const b=e.target.closest('[data-study-do]');if(!b||b.disabled)return;
    const [cmd,arg]=b.dataset.studyDo.split(':');
    run(async()=>{
      const d=draft();
      if(cmd==='home'){await pendingWrite;setView('home');}
      else if(cmd==='ai'){setPanel('ai');}
      else if(cmd==='ai-test'){
        const form=document.querySelector('[data-study-form=ai]');if(!form.reportValidity())return;const cfg=readAIForm(form);
        say('正在测试连接…');
        try{
          if(cfg.type==='phone'){
            const id=await A.detect(cfg);
            form.elements.model.value=id;
            say('连接成功，已填入本机模型 ID。请点「保存并选用」。');
          }else{await A.test(cfg);say('连接成功，模型已找到。');}
        }catch(error){say('');throw error;}
      }else if(cmd==='ai-retry'&&d?.phase==='grade'){
        if(d.aiOffline)await updateDraft({...d,aiOffline:false});easyAI(draft());return;
      }else if(cmd==='ai-offline'&&d?.phase==='grade'){
        stopAI(d.attemptId);await updateDraft({...d,aiOffline:true});renderAIPanel(d);return;
      }else if((cmd==='ai-accept'||cmd==='ai-fill')&&d?.phase==='grade'){
        const a=responseFor(d),proposal=a?.suggestions.find(x=>x.id===arg);
        if(!proposal||d.revising||proposal.rubricVersion!==currentItem(d).rubricVersion)return;
        const scores=Object.fromEntries(A.verify({points:proposal.points},a.submit).map(x=>[x.pointId,x.score]));
        stopAI(d.attemptId);
        if(cmd==='ai-fill')await updateDraft({...d,scores});
        else await confirmGrade(d,currentItem(d),scores,null);
        redraw();return;
      }
      else if(cmd==='sync-toggle'){
        if(!model.syncOn&&!confirm('开启后，新模块的原始作答、评分和当前题目的参考快照会保存到本学习空间的同步服务。继续？'))return;
        model.syncOn=!model.syncOn;await Y.setEnabled(space(),model.syncOn);model.syncStatus='';redraw();if(model.syncOn)syncInBackground();
      }else if(cmd==='sync-now'){syncInBackground();}
      else if(cmd==='history-revise'){
        const at=model.projection.attempts.get(arg);
        if(at?.submit?.module!=='short'||!at.status.grade||at.status.heads.length!==1)return;
        historyEdit={submit:at.submit,grade:at.status.grade};redraw();
        document.querySelector('[data-study-history-edit]')?.scrollIntoView({block:'start'});
      }else if(cmd==='history-cancel'){historyEdit=null;redraw();}
      else if(cmd==='resolve'){
        const at=[...model.projection.attempts.values()].find(a=>a.status?.heads?.some(h=>h.id===arg)),heads=at?.status.heads;
        if(!heads||heads.length<2||heads.length>20||at.submit.module!=='short')return;
        const h=heads.find(x=>x.id===arg);
        const event=makeEvent({id:'short',attemptId:h.attemptId},'resolved',{parents:heads.map(x=>x.id),scores:h.scores,score:h.score,maxScore:h.maxScore,rating:h.rating,manual:h.manual,rubricVersion:h.rubricVersion});
        await write([op('events',event,'add')]);model.events.push(event);await rebuild();syncInBackground();say('已保留两份原评分并追加冲突解决记录。');redraw();
      }
      else if(cmd==='link-item'){
        const at=model.projection.attempts.get(arg),item=at?.submit?.snapshot;
        if(!item||!V.item(item)||model.content.some(x=>x.id===item.id))return;
        await write([op('content',item,'add')]);model.content.push(item);redraw();
      }
      else if(['landing','library','history','continue'].includes(cmd)){await pendingWrite;entry=null;setPanel(cmd==='landing'?'home':cmd==='continue'?'practice':cmd);}
      else if(['new','due'].includes(cmd)&&!d){
        const ids=queue(model.kind,model.dir,cmd);if(!ids.length)return;
        await updateDraft(makeDraft({id:model.kind,queue:ids,queueKind:cmd,direction:model.kind==='vocab'?model.dir:null},0));setPanel('practice');
      }else if(cmd==='end'&&d){
        if(confirm('结束本轮？已提交的作答会保留，未提交的草稿将丢弃。'))await finishDraft(d);
      }else if(cmd==='import'&&importer&&!importer.result.errors.length){
        const result=I.preview(importer.tables,importer.kind,model.content,{mapping:importer.mapping,duplicate:importer.duplicate});
        if(result.errors.length||!result.items.length){applyPreview();return;}
        const lastOrder=model.content.reduce((max,x)=>Math.max(max,x.importOrder||0),0);
        const items=result.items.map(({replace,...v},i)=>({...v,importOrder:model.content.find(x=>x.id===v.id)?.importOrder??lastOrder+i+1}));
        if(!items.every(V.item))throw Error('题库内有字段过长或格式不支持，请拆分内容后重试');
        await write(items.map(v=>op('content',v)));
        for(const v of items){const i=model.content.findIndex(x=>x.id===v.id);if(i>=0)model.content[i]=v;else model.content.push(v);}
        importer=null;message=`已导入 ${items.length} 条。`;redraw();
      }else if(cmd==='edit'){entry=structuredClone(model.content.find(x=>x.id===arg));redraw();document.querySelector('[data-study-rubric]')?.scrollIntoView({block:'start'});}
      else if(cmd==='cancel-edit'){entry=null;redraw();}
      else if(cmd==='add-point'&&entry&&entry.points.length<50){captureRubric();entry.points.push({pointId:C.uuid(),label:'',maxScore:1,critical:false,aliases:[]});redraw();}
      else if(cmd==='remove-point'&&entry){captureRubric();entry.points.splice(Number(arg),1);redraw();}
      else if(d){
        if(cmd==='remember'&&d.phase==='learn')await updateDraft({...d,phase:'answer'});
        else if(cmd==='hint'&&d.phase==='answer')await updateDraft({...d,hinted:true,showHint:!d.showHint});
        else if(cmd==='vgrade'&&d.phase==='grade'&&d.id==='vocab'){
          const selfAssessment=+arg,rating=d.hinted?Math.min(2,selfAssessment):selfAssessment;
          await updateDraft({...d,phase:'result'},[op('events',makeEvent(d,'confirmed',{rating,selfAssessment}),'add')]);
        }else if(cmd==='hide-ref')await updateDraft({...d,hideReference:true});
        else if(cmd==='show-ref')await updateDraft({...d,hideReference:false});
        else if(cmd==='revise'&&d.phase==='result'&&d.id==='short'){
          const grade=responseFor(d).status.grade;
          if(!grade)throw Error('请先在作答记录中处理评分冲突');
          await updateDraft({...d,phase:'grade',revising:true,scores:{...grade.scores},manual:grade.manual??null});
        }else if(cmd==='next'&&d.phase==='result'){
          if(d.correction?.trim()&&d.id==='short'&&d.correction.trim()!==responseFor(d).corrections.at(-1)?.raw){
            await updateDraft(d,[op('events',makeEvent(d,'corrected',{raw:d.correction.trim()}),'add')]);
          }
          if(d.index+1>=d.queue.length){await finishDraft(d);say('本轮练习已完成。可在作答记录中回看。');return;}
          await updateDraft(makeDraft(d,d.index+1));
        }
        redraw();
      }
    });
  }
  function onChange(e){
    const t=e.target;
    if(t.matches('[data-study-ai-mode]')){aiMode=t.value;say('',true);say('');redraw();return;}
    if(t.matches('[data-study-files]'))run(async()=>{
      if(!t.files.length)return;
      const tables=await I.sheets([...t.files]),kind=model.kind;
      if(!tables.length)throw Error('没有可读取的工作表');
      if(kind==='short')for(const x of tables)x.type=x.rows.find(r=>r.cells.some(v=>String(v??'').trim()))?.cells.map(v=>String(v).trim()).includes('point_id')?'points':'questions';
      importer={tables,kind,mapping:Object.create(null),duplicate:'skip'};applyPreview();
    });
    else if(t.matches('[data-study-dir]')){model.dir=t.value;redraw();}
    else if(t.matches('[data-study-duplicate]')){importer.duplicate=t.value;applyPreview();}
    else if(t.matches('[data-study-table]')){const table=importer.tables[+t.dataset.studyTable];table.type=t.value;delete importer.mapping[table.source];applyPreview();document.querySelector('.study-preview details').open=true;}
    else if(t.matches('[data-study-map]')){
      const table=importer.tables[+t.dataset.table];(importer.mapping[table.source]??=Object.create(null))[t.dataset.studyMap]=t.value||t.dataset.studyMap;
      applyPreview();document.querySelector('.study-preview details').open=true;
    }
  }
  function onInput(e){
    const t=e.target,d=draft();if(!d||model.panel!=='practice'||busy)return;
    if(t.name==='answer')d.input=t.value;
    else if(t.name==='correction')d.correction=t.value;
    else if(t.name==='point')(d.scores??={})[t.dataset.point]=t.value;
    else if(t.name==='manual')d.manual=t.value?Number(t.value):null;
    else return;
    const copy=structuredClone(d);
    write([op('drafts',copy)]).catch(()=>say('草稿未能保存，请重试或检查设备剩余空间。',true));
  }
  function captureRubric(){
    const form=document.querySelector('[data-study-form=rubric]');if(!form||!entry)return;
    entry.reference=form.elements.reference.value;
    entry.points=[...form.querySelectorAll('[data-rubric-point]')].map(p=>{
      const val=n=>p.querySelector('[name="'+n+'"]').value.trim();
      return {pointId:p.dataset.rubricPoint,label:val('label'),maxScore:val('maxScore'),critical:p.querySelector('[name="critical"]').checked,aliases:val('aliases').split('|').map(s=>s.trim()).filter(Boolean),conditions:val('conditions'),partialRule:val('partialRule')};
    });
  }
  async function confirmGrade(d,item,inputs,manual){
    const graded=C.gradeShort(item,inputs,d.hinted,manual),at=responseFor(d);
    const parents=d.revising?[at.status.grade.id]:[];
    stopAI(d.attemptId);
    await updateDraft({...d,scores:graded.scores,manual,revising:false,phase:'result'},[op('events',makeEvent(d,d.revising?'revised':'confirmed',{parents,...graded,manual,rubricVersion:item.rubricVersion}),'add')]);
  }
  function onSubmit(e){
    const form=e.target;if(!form.matches('[data-study-form]'))return;e.preventDefault();
    run(async()=>{
      const d=draft(),item=d&&currentItem(d),type=form.dataset.studyForm,data=new FormData(form);
      if(type==='ai'&&A){
        const cfg=readAIForm(form),prior=A.settings(space()).profiles.cloud;
        if(cfg.type==='cloud'&&cfg.enabled&&!prior?.enabled&&!confirm('允许将你提交的简答题、得分标准和原始作答发送到 DeepSeek 批改？离线自评始终可用。'))return;
        model.ai=A.save(space(),cfg);say('已保存本机配置。');
      }else if(type==='history-grade'&&historyEdit){
        const {submit,grade}=historyEdit, latest=model.projection.attempts.get(submit.attemptId)?.status;
        if(latest?.grade?.id!==grade.id||latest.heads.length!==1)throw Error('评分已被另一台设备修改，请重新打开该条记录再修订');
        const inputs=Object.fromEntries([...form.querySelectorAll('[data-point]')].map(x=>[x.dataset.point,x.value]));
        const manual=data.get('manual')?Number(data.get('manual')):null,graded=C.gradeShort(submit.snapshot,inputs,submit.hinted,manual);
        const event=makeEvent({id:'short',attemptId:submit.attemptId},'revised',{parents:[grade.id],...graded,manual,rubricVersion:submit.snapshot.rubricVersion});
        await write([op('events',event,'add')]);model.events.push(event);await rebuild();syncInBackground();
        historyEdit=null;message='已修订原评分和复习计划，此次作答仍只计一次。';
      }else if(type==='rubric'&&entry){
        captureRubric();
        if(entry.points.some(p=>!p.label||p.maxScore===''||!Number.isFinite(+p.maxScore)||+p.maxScore<0))throw Error('请填写全部得分点名称及分值');
        const points=entry.points.map(p=>({...p,maxScore:+p.maxScore})),reference=entry.reference.trim(),ready=!!(reference&&points.some(p=>p.maxScore>0));
        if(entry.ready&&!ready)throw Error('正式题需保留参考答案和有效得分点');
        const v={...entry,reference,points,ready,rubricVersion:entry.rubricVersion+1};
        if(!V.item(v))throw Error('评分标准有字段不符合保存范围');
        await write([op('content',v)]);model.content[model.content.findIndex(x=>x.id===v.id)]=v;entry=null;say('已保存新评分标准。此前作答保留原版本。');
      }else if(type==='answer'&&d?.phase==='answer'){
        const raw=String(data.get('answer')||'');if(!raw.trim())throw Error('先输入你的答案');
        const auto=d.id==='vocab'&&d.direction==='zh2en',rating=auto?(C.checkSpelling(item,raw)?(d.hinted?2:3):1):null;
        const now=Date.now(),last=model.events.reduce((t,x)=>x.type==='submitted'&&x.itemId===item.id&&x.direction===d.direction?Math.max(t,x.answeredAt):t,0);
        if(now<last)throw Error('设备时间早于上次作答，请校准时间后提交。草稿已保留。');
        const submitted=makeEvent(d,'submitted',{itemId:item.id,direction:d.direction,raw,snapshot:item,rating,answeredAt:now,hinted:d.hinted});
        await updateDraft({...d,input:raw,item,phase:auto?'result':'grade'},[op('events',submitted,'add')]);
        if(d.id==='short')easyAI(draft());
      }else if(type==='grade'&&d?.phase==='grade'&&d.id==='short'){
        const inputs=Object.fromEntries([...form.querySelectorAll('[data-point]')].map(x=>[x.dataset.point,x.value]));
        const manual=data.get('manual')?Number(data.get('manual')):null;
        await confirmGrade(d,item,inputs,manual);
      }else if(type==='correction'&&d?.phase==='result'){
        const raw=String(data.get('correction')||'').trim();if(!raw)throw Error('先输入订正内容');
        if(d.id==='vocab'&&d.direction==='zh2en'&&!C.checkSpelling(item,raw))throw Error('拼写还不匹配。可以再看参考答案，然后重新默写。');
        await updateDraft({...d,correction:raw},[op('events',makeEvent(d,'corrected',{raw}),'add')]);message='订正已保存';
      }
      redraw();
    });
  }
  window.addEventListener('online',()=>{if(document.querySelector('[data-study-view]'))syncInBackground();});
  setInterval(()=>{if(!document.hidden&&document.querySelector('[data-study-view]'))syncInBackground();},30000);
  root.TijianStudy={mount,preparePanel(id){pendingPanel=id==='ai'?'ai':null;if(!pendingPanel&&model)model.panel='home';},flush:()=>pendingWrite.catch(()=>{}),reset(){serial++;model=null;entry=importer=null;},view:kind=>`<div class="study-view" data-study-view="${kind}" tabindex="-1"></div>`};
})(globalThis);
