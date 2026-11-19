(function(){
  'use strict';
  const modules=Promise.all([import('./tools/perspective-deck.js?v=tools126'),import('./tools/deck-gestures.js?v=tools126')]);
  // Keep loader failure observable without blocking offline practice startup.
  modules.catch(()=>{});
  let sheet=null,deck=null,gestures=null,questionKey=null,lastTool='nav',page=0,opening=false,closing=false,opener=null,scrollYBefore=0,highlightObserver=null,sheetAnimation=null;
  const ids=['nav','records','highlight','overview'];
  const paths={nav:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 3v18M16 3v18M3 8h18M3 16h18"/>',records:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',highlight:'<path d="m5 15 10-10 4 4L9 19H5zM4 21h16M13 7l4 4"/>',overview:'<path d="M4 20V4M4 20h17M8 15v-4M13 15V7M18 15V4"/>'};
  const icon=id=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[id]}</svg>`;
  const key=()=>view==='practice'&&currentSession?.status==='active'&&session[index]?`${currentSession.id}:${index}:${session[index].id}`:null;
  const cardData=()=>[
    {id:'nav',title:'题号导航',subtitle:`第 ${index+1} / ${session.length} 题`,meta:`已答 ${answeredCount()} 道`,label:'NAVIGATION'},
    {id:'records',title:'本题记录',subtitle:`做过 ${questionAttemptData(session[index].id).total} 次`,meta:`答错 ${questionAttemptData(session[index].id).wrong} 次`,label:'ANSWER HISTORY'},
    {id:'highlight',title:'题干高亮',subtitle:'颜色、保存与历史',meta:'直接划选题干文字',label:'HIGHLIGHT'},
    {id:'overview',title:'本轮概况',subtitle:`已答 ${answeredCount()} / ${session.length}`,meta:'用时、标记与阶段总结',label:'TRAINING REPORT'}
  ];
  function renderCard(card){const node=document.createElement('div');node.className='tool-card-content';node.innerHTML=`<div class="tool-card-top"><span>${icon(card.id)}${esc(card.title)}</span><small>题间</small></div><div class="tool-card-main"><strong>${esc(card.subtitle)}</strong><span class="tool-card-icon">${icon(card.id)}</span></div><div class="tool-card-bottom"><span>${esc(card.meta)}</span><small>${card.label}</small></div>`;return node;}
  function navHtml(){
    const size=48,pages=Math.max(1,Math.ceil(session.length/size));page=Math.max(0,Math.min(page,pages-1));const start=page*size,end=Math.min(session.length,start+size);
    return `<div class="tool-panel-title"><h3>题号导航</h3><span>已答 ${answeredCount()} / ${session.length}</span></div><form data-tools-jump><label for="tools-jump">跳到第</label><input id="tools-jump" name="number" type="number" min="1" max="${session.length}" value="${index+1}" inputmode="numeric" required><span>题</span><button type="submit">跳转</button></form><div class="tool-number-legend"><span>当前</span><span>已答</span><span>未答</span></div><div class="tool-question-grid">${session.slice(start,end).map((_,n)=>{const i=n+start;return `<button type="button" class="${i===index?'is-current':answers[i]!==null?'is-done':''}" data-tools-jump-index="${i}" aria-label="第 ${i+1} 题，${answers[i]!==null?'已答':'未答'}" ${i===index?'aria-current="step"':''}>${i+1}</button>`}).join('')}</div><div class="tool-number-pages"><button type="button" data-tools-page="${page-1}" ${page===0?'disabled':''}>上一组</button><span>${start+1}–${end} / ${session.length}</span><button type="button" data-tools-page="${page+1}" ${page===pages-1?'disabled':''}>下一组</button></div>`;
  }
  function overviewHtml(){
    const done=answeredCount(),correct=answers.reduce((n,a,i)=>n+(a!==null&&a===session[i]?.answer?1:0),0),marked=new Set(currentSession.markedQuestionIds||[]).size;
    return `<div class="tool-panel-title"><h3>本轮概况</h3><span>${esc(sessionTitle(mode))}</span></div><div class="tool-stats"><div><small>答对</small><strong>${correct}</strong></div><div><small>答错</small><strong>${done-correct}</strong></div><div><small>标记</small><strong>${marked}</strong></div><div><small>已答正确率</small><strong>${done?Math.round(correct/done*100):0}<small>%</small></strong></div></div><div class="tool-time"><span>本轮用时<strong data-study-total>${formatStudyTime(studyTimeMs(currentSession))}</strong></span><span>本题用时<strong data-study-question>${formatStudyTime(studyTimeMs(currentSession,index))}</strong></span></div><button type="button" class="tool-summary" data-tools-summary>查看阶段总结</button>`;
  }
  function highlightHost(){return sheet?.querySelector('[data-tools-highlight-host]');}
  function expandHighlight(){const settings=highlightHost()?.querySelector('.keyword-settings');if(settings&&!settings.open)settings.open=true;}
  function refresh(){
    if(!sheet?.open||!key())return;
    const nav=sheet.querySelector('[data-tools-nav-host]');if(!nav.contains(document.activeElement))nav.innerHTML=navHtml();
    sheet.querySelector('[data-tools-records-host]').innerHTML=`<div class="tool-panel-title"><h3>本题记录</h3><span>全部逐次结果</span></div>${questionAttemptsHtml(session[index].id)}`;
    sheet.querySelector('[data-tools-overview-host]').innerHTML=overviewHtml();
    for(const card of cardData()){
      const node=deck?.elements.get(card.id)?.querySelector('.tool-card-content');if(!node)continue;
      node.querySelector('.tool-card-main>strong').textContent=card.subtitle;node.querySelector('.tool-card-bottom>span').textContent=card.meta;
    }
    expandHighlight();
  }
  function selectPanel(id){
    lastTool=id;
    for(const panel of sheet.querySelectorAll('[data-tool-panel]')){const show=panel.dataset.toolPanel===id;panel.hidden=!show;panel.inert=!show;}
    sheet.querySelector('.tool-content-scroll').scrollTop=0;
    sheet.querySelector('[data-tools-active-name]').textContent=cardData().find(card=>card.id===id)?.title||'练习工具';
  }
  async function open(id=lastTool){
    if(!key()||opening||closing)return;
    if(sheet?.open){if(ids.includes(id))deck.select(id);return;}
    opening=true;const requestedKey=key();opener=document.activeElement;
    let loaded;try{loaded=await modules}catch{opening=false;showGestureToast('工具暂未加载，请重新打开应用');return}
    opening=false;if(key()!==requestedKey)return;
    questionKey=requestedKey;page=Math.floor(index/48);lastTool=ids.includes(id)?id:'nav';scrollYBefore=window.scrollY;
    const dialog=sheet=document.createElement('dialog');dialog.className='practice-tools-sheet';dialog.setAttribute('aria-labelledby','practice-tools-title');
    dialog.innerHTML=`<div class="tool-sheet-handle" aria-hidden="true"></div><header class="tool-sheet-header"><div><small>INTER-KNOT / TOOLBOX</small><h2 id="practice-tools-title">练习工具</h2></div><button class="tool-sheet-close" type="button" data-tools-close aria-label="关闭练习工具"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><div class="tool-deck-zone"><div data-tools-deck></div><div class="tool-deck-caption"><span data-tools-active-name></span><span>上下滑动 · 露出的卡片可点选</span></div></div><div class="tool-content-scroll"><section data-tool-panel="nav" data-tools-nav-host></section><section data-tool-panel="records" data-tools-records-host hidden></section><section data-tool-panel="highlight" data-tools-highlight-host hidden></section><section data-tool-panel="overview" data-tools-overview-host hidden></section></div>`;
    document.body.append(dialog);
    const stored=document.querySelector('.practice-tools-store .keyword-settings');if(stored)highlightHost().append(stored);
    dialog.showModal();document.body.classList.add('practice-tools-open');
    const cards=cardData(),ordered=[cards.find(c=>c.id===lastTool),...cards.filter(c=>c.id!==lastTool)];
    deck=new loaded[0].PerspectiveCardDeck(dialog.querySelector('[data-tools-deck]'),{cards:ordered,renderCard,gap:18,aspectRatio:3,duration:700,elasticity:.40,clearance:10,animate:motionEnabled});
    gestures=new loaded[1].DeckGestures(deck);
    deck.addEventListener('change',event=>{if(event.detail.reason==='complete')selectPanel(event.detail.order[0]);});
    dialog.querySelector('[data-tools-close]').onclick=()=>close();
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('click',event=>{
      if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}
      const target=event.target.closest('button');if(!target)return;
      if(target.dataset.toolsPage!==undefined){page=Number(target.dataset.toolsPage);refresh();}
      else if(target.dataset.toolsJumpIndex!==undefined){const targetIndex=Number(target.dataset.toolsJumpIndex);close({immediate:true,restore:false});goToQuestion(targetIndex);}
      else if(target.hasAttribute('data-tools-summary')){const id=currentSession.id;close({immediate:true,restore:false});openResult(id);}
    });
    dialog.addEventListener('submit',event=>{if(!event.target.matches('[data-tools-jump]'))return;event.preventDefault();const field=event.target.elements.number;if(!field.reportValidity())return;const target=Number(field.value)-1;close({immediate:true,restore:false});goToQuestion(target);});
    highlightObserver=new MutationObserver(expandHighlight);highlightObserver.observe(highlightHost(),{childList:true});
    window.TijianHighlighter?.mountSettings();refresh();selectPanel(lastTool);haptic('tap');
    if(motionEnabled&&!matchMedia('(prefers-reduced-motion: reduce)').matches)sheetAnimation=dialog.animate([{transform:'translateY(28px)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});
    dialog.querySelector('[data-tools-close]').focus({preventScroll:true});
    for(const button of document.querySelectorAll('[data-open-practice-tools]'))button.setAttribute('aria-expanded','true');
  }
  function close({immediate=false,restore=true}={}){
    if(!sheet||closing)return;
    const old=sheet;closing=true;sheetAnimation?.cancel();sheetAnimation=null;gestures?.destroy();gestures=null;deck?.pause();
    const finish=()=>{
      deck?.destroy();deck=null;highlightObserver?.disconnect();highlightObserver=null;
      const settings=old.querySelector('.keyword-settings'),store=document.querySelector('.practice-tools-store');
      if(settings&&store){settings.open=false;store.append(settings);}
      old.close();old.remove();if(sheet===old)sheet=null;questionKey=null;closing=false;document.body.classList.remove('practice-tools-open');
      for(const button of document.querySelectorAll('[data-open-practice-tools]'))button.setAttribute('aria-expanded','false');
      const focusTarget=opener;opener=null;
      if(restore){window.scrollTo({top:scrollYBefore,behavior:'auto'});if(focusTarget?.isConnected)focusTarget.focus({preventScroll:true});}
    };
    if(immediate||!motionEnabled||matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}
    old.classList.add('is-closing');const animation=old.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(22px)',opacity:0}],{duration:120,easing:'ease-in',fill:'both'});animation.finished.then(finish).catch(finish);
  }
  function beforeRender(){if(sheet&&key()!==questionKey)close({immediate:true,restore:false});}
  function bind(){
    document.querySelectorAll('[data-open-practice-tools]').forEach(button=>button.onclick=()=>open());
    if(sheet?.open){if(key()!==questionKey)close({immediate:true,restore:false});else refresh();}
  }
  window.TijianTools={open,close,bind,beforeRender,isOpen:()=>!!sheet?.open,toggle:id=>sheet?.open&&lastTool===id?close():open(id),snapshot:()=>({open:!!sheet?.open,selected:lastTool,deck:deck?.snapshot()||null})};
})();
