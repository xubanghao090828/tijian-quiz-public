(function(){
  'use strict';
  const modules=Promise.all([import('./tools/perspective-deck.js?v=cards130'),import('./tools/deck-gestures.js?v=cards130')]);
  modules.catch(()=>{});
  let surface=null,deck=null,gestures=null,questionKey=null,cardOrder=null,page=0,loadingKey=null,observer=null,scrollPositions=null,focusedControl=null;
  const parking=document.createDocumentFragment(),size=24;
  const ids=['nav','records','highlight','overview'];
  const paths={nav:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 3v18M16 3v18M3 8h18M3 16h18"/>',records:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',highlight:'<path d="m5 15 10-10 4 4L9 19H5zM4 21h16M13 7l4 4"/>',overview:'<path d="M4 20V4M4 20h17M8 15v-4M13 15V7M18 15V4"/>'};
  const icon=id=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[id]}</svg>`;
  const chevron=direction=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction===1?'m7 14 5-5 5 5':'m7 10 5 5 5-5'}"/></svg>`;
  const grip='<svg class="tool-rail-grip" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 3-3 3 3M9 17l3 3 3-3M7 12h10"/></svg>';
  const key=()=>view==='practice'&&currentSession?.status==='active'&&session[index]?`${currentSession.id}:${index}:${session[index].id}`:null;
  const cards=[{id:'nav',title:'题号导航',label:'01 / NAV'},{id:'records',title:'本题记录',label:'02 / LOG'},{id:'highlight',title:'题干高亮',label:'03 / MARK'},{id:'overview',title:'本轮概况',label:'04 / RUN'}];
  function renderCard(card){
    const node=document.createElement('div');node.className='tool-card-content';
    node.innerHTML=`<header class="tool-card-top" data-card-rail tabindex="-1"><span>${icon(card.id)}${card.title}</span><div class="tool-rail-tag">${card.label}${grip}</div><div class="tool-rail-steps"><button type="button" data-card-step="-1" aria-label="上一张卡片">${chevron(-1)}</button><button type="button" data-card-step="1" aria-label="下一张卡片">${chevron(1)}</button></div></header><section class="tool-card-body" data-tools-${card.id}-host aria-label="${card.title}" tabindex="0"></section>`;
    return node;
  }
  function navHtml(){
    const pages=Math.max(1,Math.ceil(session.length/size));page=Math.max(0,Math.min(page,pages-1));const start=page*size,end=Math.min(session.length,start+size);
    return `<form data-tools-jump><label for="tools-jump">跳到第</label><input id="tools-jump" name="number" type="number" min="1" max="${session.length}" value="${index+1}" inputmode="numeric" required><span>题</span><button type="submit">跳转</button><small>已答 ${answeredCount()}/${session.length}</small></form><div class="tool-number-legend"><span>当前</span><span>已答</span><span>未答</span></div><div class="tool-question-grid">${session.slice(start,end).map((_,n)=>{const i=n+start;return `<button type="button" class="${i===index?'is-current':answers[i]!==null?'is-done':''}" data-tools-jump-index="${i}" aria-label="第 ${i+1} 题，${answers[i]!==null?'已答':'未答'}" ${i===index?'aria-current="step"':''}>${i+1}</button>`}).join('')}</div><div class="tool-number-pages"><button type="button" data-tools-page="${page-1}" ${page===0?'disabled':''}>上一组</button><span>${start+1}–${end} / ${session.length}</span><button type="button" data-tools-page="${page+1}" ${page===pages-1?'disabled':''}>下一组</button></div>`;
  }
  function overviewHtml(){
    const done=answeredCount(),correct=answers.reduce((n,a,i)=>n+(a!==null&&a===session[i]?.answer?1:0),0),marked=new Set(currentSession.markedQuestionIds||[]).size;
    return `<p class="tool-face-intro">${esc(sessionTitle(mode))} · 已答 ${done} / ${session.length}</p><div class="tool-stats"><div><small>答对</small><strong>${correct}</strong></div><div><small>答错</small><strong>${done-correct}</strong></div><div><small>标记</small><strong>${marked}</strong></div><div><small>正确率</small><strong>${done?Math.round(correct/done*100):0}<small>%</small></strong></div></div><div class="tool-time"><span>本轮用时<strong data-study-total>${formatStudyTime(studyTimeMs(currentSession))}</strong></span><span>本题用时<strong data-study-question>${formatStudyTime(studyTimeMs(currentSession,index))}</strong></span></div><button type="button" class="tool-summary" data-tools-summary>查看阶段总结</button>`;
  }
  function expandHighlight(){const settings=surface?.querySelector('.keyword-settings');if(settings&&!settings.open)settings.open=true;}
  function refresh(){
    if(!surface||key()!==questionKey)return;
    const nav=surface.querySelector('[data-tools-nav-host]');
    if(!nav.contains(document.activeElement)||!document.activeElement.matches("input")){const top=nav.scrollTop;nav.innerHTML=navHtml();nav.scrollTop=top;}
    const records=surface.querySelector('[data-tools-records-host]'),scroll=records.scrollTop;
    records.innerHTML=questionAttemptsHtml(session[index].id);records.scrollTop=scroll;
    surface.querySelector('[data-tools-overview-host]').innerHTML=overviewHtml();expandHighlight();
  }
  function dispose(){
    loadingKey=null;observer?.disconnect();observer=null;gestures?.destroy();gestures=null;deck?.destroy();deck=null;surface?.remove();surface=null;questionKey=null;scrollPositions=null;focusedControl=null;
  }
  function beforeRender(){
    if(!surface){if(loadingKey!==key())loadingKey=null;return;}
    if(key()!==questionKey){dispose();return;}
    gestures?.cancel();
    scrollPositions=[...surface.querySelectorAll('.tool-card-body')].map(node=>[node,node.scrollTop]);
    focusedControl=surface.contains(document.activeElement)?document.activeElement:null;
    // Preserve native timelines, scroll positions and controls on same-question renders.
    parking.append(surface);
  }
  async function mount(){
    const slot=document.querySelector('[data-practice-cards]'),requestedKey=key();if(!slot||!requestedKey)return;
    if(surface&&questionKey===requestedKey){
      if(surface.parentNode!==slot)slot.append(surface);
      focusedControl?.focus({preventScroll:true});focusedControl=null;
      refresh();for(const [node,top] of scrollPositions||[])node.scrollTop=top;scrollPositions=null;return;
    }
    if(loadingKey===requestedKey)return;loadingKey=requestedKey;
    let loaded;try{loaded=await modules}catch{if(loadingKey===requestedKey){loadingKey=null;slot.innerHTML='<p class="tool-load-error">卡片加载失败，请重新打开应用。</p>';}return;}
    if(key()!==requestedKey||loadingKey!==requestedKey)return;loadingKey=null;
    const currentSlot=document.querySelector('[data-practice-cards]');if(!currentSlot)return;
    questionKey=requestedKey;page=Math.floor(index/size);
    surface=document.createElement('section');surface.className='practice-card-deck';surface.setAttribute('aria-label','题号、记录、高亮和本轮概况');
    surface.innerHTML=`<div data-tools-deck></div><p class="tool-deck-hint">滑动卡片标题翻动 · 点标题直达</p>`;
    currentSlot.replaceChildren(surface);
    const root=surface.querySelector('[data-tools-deck]');
    const ordered=cardOrder?cardOrder.map(id=>cards.find(card=>card.id===id)):cards;
    deck=new loaded[0].PerspectiveCardDeck(root,{cards:ordered,renderCard,gap:34,cardHeight:360,compact:true,duration:620,elasticity:.50,clearance:12,extraction:.40,animate:motionEnabled});
    // This hit surface exists only in flight, so a quick second swipe can start
    // where the rails were while their faces are moving or temporarily inert.
    const catchRail=document.createElement('div');catchRail.className='tool-rail-catch';catchRail.dataset.cardRail='';catchRail.setAttribute('aria-hidden','true');root.append(catchRail);
    gestures=new loaded[1].DeckGestures(deck);
    deck.addEventListener('change',event=>{if(event.detail.reason==='complete'){cardOrder=event.detail.order;haptic('tap');}});
    surface.addEventListener('click',event=>{
      const target=event.target.closest('button');if(!target)return;
      if(target.dataset.toolsPage!==undefined){page=Number(target.dataset.toolsPage);refresh();}
      else if(target.dataset.toolsJumpIndex!==undefined)goToQuestion(Number(target.dataset.toolsJumpIndex));
      else if(target.hasAttribute('data-tools-summary'))openResult(currentSession.id);
    });
    surface.addEventListener('submit',event=>{if(!event.target.matches('[data-tools-jump]'))return;event.preventDefault();const field=event.target.elements.number;if(field.reportValidity())goToQuestion(Number(field.value)-1);});
    const host=surface.querySelector('[data-tools-highlight-host]'),stored=document.querySelector('.practice-tools-store .keyword-settings');if(stored)host.append(stored);
    observer=new MutationObserver(expandHighlight);observer.observe(host,{childList:true});
    window.TijianHighlighter?.mountSettings();refresh();
  }
  async function open(id='nav'){
    if(!ids.includes(id)||!key())return;
    // Selecting a live card must not rebuild its controls or detach its scroller.
    if(!deck||questionKey!==key()||!surface?.isConnected)await mount();
    if(!deck)return;
    surface.scrollIntoView({block:'start',behavior:motionEnabled&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'auto'});
    await deck.select(id);
  }
  function bind(){mount();}
  window.TijianTools={open,bind,beforeRender,isOpen:()=>false,close:()=>{},toggle:open,snapshot:()=>({open:false,inline:!!surface?.isConnected,selected:deck?.order[0]||cardOrder?.[0]||'nav',deck:deck?.snapshot()||null})};
})();
