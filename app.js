const DEMO=[
  {id:'d1',question:'一个零件需要加工到 25.00 ± 0.05 mm，以下哪个尺寸符合要求？',options:['24.94 mm','24.96 mm','25.06 mm','25.10 mm'],answer:1,explanation:'合格范围是 24.95～25.05 mm，24.96 mm 落在范围内。',category:'示例题库'},
  {id:'d2',question:'在直角三角形中，两条直角边分别为 3 和 4，斜边长度是多少？',options:['5','6','7','8'],answer:0,explanation:'根据勾股定理，斜边为 √(3²+4²)=5。',category:'示例题库'},
  {id:'d3',question:'下列哪一种文件格式通常用于保存电子表格？',options:['.png','.xlsx','.mp3','.html'],answer:1,explanation:'.xlsx 是常见的 Excel 工作簿格式。',category:'示例题库'},
  {id:'d4',question:'一个物体每分钟移动 12 米，5 分钟共移动多少米？',options:['17 米','50 米','60 米','120 米'],answer:2,explanation:'距离 = 速度 × 时间 = 12 × 5 = 60 米。',category:'示例题库'},
  {id:'d5',question:'若一组数据为 2、4、6、8，它们的平均数是多少？',options:['4','5','6','7'],answer:1,explanation:'(2+4+6+8)÷4=5。',category:'示例题库'}
];
const KEY=window.TIJIAN_STATE_KEY||'tijian-v1';
let state=load(); let view='home'; let mode='order'; let session=[]; let answers=[]; let index=0; let selected=null; let sessionCorrect=0; let currentSession=null; let historySessionId=null; let historyQuestionIndex=null; let searchQuery=''; let searchType='全部题型'; let searchPage=0; let libraryDetailId=null; let mistakeSearchQuery=''; let mistakeDetailId=null; let importError=''; let sessionError=''; let category='全部分类'; let questionType='全部题型'; let homeTab='schedule'; let homePeriod='today'; let navOpen=false; let lastMotionKey=null; let answerMotion=false; let navMotion=false; let lastResultAnimatedId=null; let hapticsEnabled=localStorage.getItem('tijian-haptics')!=='off'; let motionEnabled=localStorage.getItem('tijian-motion')!=='off'; let fontSize=['standard','large','extra'].includes(localStorage.getItem('tijian-font-size'))?localStorage.getItem('tijian-font-size'):'standard';
function applyPreferences(){document.documentElement.dataset.motion=motionEnabled?'on':'off';document.body.dataset.fontSize=fontSize}
applyPreferences();
function load(){try{const s=JSON.parse(localStorage.getItem(KEY));return {custom:Array.isArray(s.custom)?s.custom:[],attempts:s.attempts||{},mistakes:s.mistakes||{},marked:s.marked||{},events:s.events,cursor:s.cursor||0,sessions:Array.isArray(s.sessions)?s.sessions.map(record=>({...record,dirty:record.dirty!==false})):[],sessionCursor:s.sessionCursor||0}}catch{return {custom:[],attempts:{},mistakes:{},marked:{},events:[],cursor:0,sessions:[],sessionCursor:0}}}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
let enrichedCustomSource=null,enrichedCustomCache=null;
function bank(){
  const bundled=window.BUNDLED_QUESTIONS||DEMO;
  if(!state.custom.length)return bundled;
  if(enrichedCustomSource===state.custom)return enrichedCustomCache;
  const byQuestionAndAnswer=new Map(bundled.map(q=>[`${q.question}|${q.options[q.answer]}`,q]));
  enrichedCustomCache=state.custom.map(q=>{
    const match=byQuestionAndAnswer.get(`${q.question}|${q.options?.[q.answer]}`);
    if(!match||q.options.length!==match.options.length||q.options.some(o=>!match.options.includes(o)))return q;
    if(q.optionExplanations?.length===q.options.length)return q;
    return {...q,type:q.type||match.type,explanation:match.explanation,
      optionExplanations:match.optionExplanations?.length===match.options.length?q.options.map(o=>match.optionExplanations[match.options.indexOf(o)]):[],
      reviewNote:q.reviewNote||match.reviewNote};
  });
  enrichedCustomSource=state.custom;
  return enrichedCustomCache;
}
function filtered(){return bank().filter(q=>(category==='全部分类'||q.category===category)&&(questionType==='全部题型'||q.type===questionType))}
function countAttempts(){return Object.values(state.attempts).reduce((n,x)=>n+x.total,0)}
function countCorrect(){return Object.values(state.attempts).reduce((n,x)=>n+x.correct,0)}
function esc(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dateLabel(){return new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date())}
function setView(v){if(v==='mistakes'&&view!==v)mistakeDetailId=null;view=v;document.body.dataset.view=v;document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===v||(v==='settings'&&el.dataset.view==='sync')));document.querySelector('#page-name').textContent=({home:'总览',practice:'开始刷题',mistakes:'错题本',library:'我的题库',history:'历史答题',sync:'我的空间',settings:'设置'})[v];render();window.scrollTo({top:0,behavior:'auto'})}
function render(){
  const navScroll=document.querySelector('.question-nav-scroll')?.scrollTop||0;
  const motionKey=view==='practice'?`${view}:${currentSession?.id||'setup'}:${index}:${session.length}`:view==='home'?`${view}:${homeTab}:${homePeriod}`:`${view}:${historySessionId||''}:${historyQuestionIndex??''}:${libraryDetailId||''}:${mistakeDetailId||''}`;
  const app=document.querySelector('#app');
  const showFinishDock=view==='practice'&&currentSession?.status==='active'&&session.length>0&&index<session.length&&answeredCount()===session.length;
  app.classList.toggle('has-finish-dock',showFinishDock);
  app.classList.toggle('motion-enter',motionKey!==lastMotionKey);
  app.classList.toggle('motion-answer',answerMotion);
  app.classList.toggle('motion-nav',navMotion);
  lastMotionKey=motionKey;answerMotion=false;navMotion=false;
  document.querySelector('#today-label').textContent=dateLabel();document.querySelector('#mistake-count').textContent=Object.keys(state.mistakes).length;
  app.innerHTML=({home:homeView,practice:practiceView,mistakes:mistakes,library:libraryView,history:historyView,sync:()=>window.TijianSync?.viewHtml()||'',settings:settingsView})[view]();
  if(showFinishDock)app.insertAdjacentHTML('beforeend',`<div class="finish-dock"><strong>${session.length} / ${session.length} 已答完</strong><button data-finish>查看结算 →</button></div>`);
  const nav=document.querySelector('.question-nav-scroll');if(nav)nav.scrollTop=navScroll;bind();window.TijianSync?.bind();animateResultScore()
}
function haptic(kind='tap'){
  if(!hapticsEnabled)return;
  const pattern=kind==='wrong'?[34,45,54]:kind==='correct'?34:14;
  const fallback=()=>{try{navigator.vibrate?.(pattern)}catch{}};
  const cap=window.Capacitor;
  if(!cap?.isNativePlatform?.()){fallback();return}
  try{
    const plugin=cap.Plugins?.Haptics||cap.registerPlugin?.('Haptics');
    if(!plugin){fallback();return}
    const call=kind==='tap'?plugin.impact({style:'LIGHT'}):plugin.notification({type:kind==='correct'?'SUCCESS':'ERROR'});
    Promise.resolve(call).catch(fallback);
  }catch{fallback()}
}
function home(){const total=countAttempts(),correct=countCorrect(),wrong=Object.keys(state.mistakes).length;return `<div class="hero"><div><div class="eyebrow">YOUR LEARNING SPACE</div><h1>今天，也来进步一点点。</h1><p>从一道题开始，把会的变熟，把不会的弄懂。</p></div><div class="hero-decoration">✳</div></div><div class="stats"><div class="stat"><div class="stat-icon green">▣</div><div class="stat-label">累计答题</div><div class="stat-value">${total}<small> 道</small></div></div><div class="stat"><div class="stat-icon peach">◇</div><div class="stat-label">待复习错题</div><div class="stat-value">${wrong}<small> 道</small></div></div><div class="stat"><div class="stat-icon blue">◎</div><div class="stat-label">累计正确率</div><div class="stat-value">${total?Math.round(correct/total*100):0}<small> %</small></div></div></div><div class="section-head"><div><h2>开始学习</h2><p>选一个入口，进入你的练习节奏</p></div></div><div class="course-grid"><div class="card course"><div class="course-top"><span class="course-icon">▤</span><span class="course-tag">${state.custom.length?'我的题库':'示例体验'}</span></div><h3>${state.custom.length?'我的题库':'基础练习'}</h3><p>共 ${bank().length} 道题 · 随时开始</p><div class="course-bottom"><span>顺序或随机练习</span><button class="round-arrow" data-go="practice" aria-label="开始练习">→</button></div></div><div class="card course"><div class="course-top"><span class="course-icon orange">◇</span><span class="course-tag">巩固提升</span></div><h3>错题回顾</h3><p>共 ${wrong} 道待复习 · 理清每个知识点</p><div class="course-bottom"><span>把不熟悉的变熟悉</span><button class="round-arrow" data-go="mistakes" aria-label="查看错题">→</button></div></div></div><div class="banner"><div><strong>有自己的题库？直接导入表格</strong><p>支持 Excel、CSV，题目会保存在这个浏览器里。</p></div><button class="primary" data-go="library">导入题库 →</button></div>`}
function missionRow(label, action, value, featured=false, icon='!'){
  return `<button class="mission-row ${featured?'featured':''}" ${action}="${esc(value)}"><span class="mission-alert ${featured?'':'blue'}">${icon}</span><strong>${label}</strong><span class="mission-arrow">${featured?'◎':'›'}</span></button>`;
}
function missionRow(label, action, value, featured=false, icon='!'){
  return `<button class="mission-row ${featured?'featured':''}" ${action}="${esc(value)}"><span class="mission-alert ${featured?'':'blue'}">${icon}</span><strong>${label}</strong><span class="mission-arrow">${featured?'◎':'›'}</span></button>`;
}
function homeView(){
  const total=countAttempts(),correct=countCorrect(),wrong=Object.keys(state.mistakes).length;
  const active=latestActive(),done=active?active.answers.filter(a=>a!==null).length:0;
  const tabNames={notices:'学习通知',schedule:'学习日程',level:'练习等级'};
  const tabs=`<div class="zzz-home-tabs" role="tablist" aria-label="首页栏目">${Object.entries(tabNames).map(([key,label])=>`<button role="tab" aria-selected="${homeTab===key}" class="${homeTab===key?'active':''}" data-home-tab="${key}">${label}</button>`).join('')}</div>`;
  const counters=`<div class="zzz-bottom"><div class="zzz-counter"><span>◎ 已答题</span><strong>${total}</strong><small>次</small></div><div class="zzz-counter"><span>✕ 错题</span><strong>${wrong}</strong><small>道</small></div><div class="zzz-counter"><span>✦ 正确率</span><strong>${total?Math.round(correct/total*100):0}</strong><small>%</small></div><span class="zzz-hint">题间 · 随时继续刷题</span></div>`;
  if(homeTab==='notices'){
    const notices=[
      missionRow(`[通知] 题库已就绪 · ${bank().length} 道题`,'data-go','library',true),
      active?missionRow(`[进度] ${sessionTitle(active.mode)} · ${done}/${active.questionIds.length}`,'data-resume',active.id,false,'↻'):missionRow('[进度] 开始第一轮随机模拟','data-start','exam',false,'↻'),
      missionRow(`[复习] 当前有 ${wrong} 道错题`,'data-go','mistakes',false,'✕'),
      missionRow('[同步] 查看设备联动与离线记录','data-go','sync',false,'◎')].join('');
    return `<div class="zzz-home">${tabs}<div class="commission-board home-info-board"><section class="commission-left"><div class="commission-caption">学习通知 <span>NOTICE BOARD</span></div><div class="commission-inset"><div class="home-info-mark">!</div><h2>你的学习终端已就绪</h2><p>题库、答题记录和解析保存在当前设备。下面的通知可以直接打开对应功能。</p><button class="tracking-bar tracking-action" data-go="sync"><span class="tracking-icon">◎</span><span><strong>查看我的空间</strong><small>离线可用 · 联网后同步</small></span><span class="tracking-dots">›</span></button></div></section><section class="commission-right"><div class="commission-caption">最新消息 <span>LATEST UPDATES</span></div><div class="mission-list">${notices}</div></section></div>${counters}</div>`;
  }
  if(homeTab==='level'){
    const rate=total?Math.round(correct/total*100):0;
    return `<div class="zzz-home">${tabs}<div class="commission-board home-info-board"><section class="commission-left"><div class="commission-caption">练习等级 <span>STUDY STATUS</span></div><div class="commission-inset"><div class="home-level-emblem">✦</div><h2>${total>=1000?'熟练代理人':total>=200?'进阶代理人':total>0?'见习代理人':'新手代理人'}</h2><p>累计作答 ${total} 次 · 正确率 ${rate}%。每次练习都会保存在这台设备，历史记录可逐题回看。</p><div class="level-meter"><div style="width:${Math.min(100,total%200/2)}%"></div></div><small>距离下一阶段还需 ${200-total%200} 次作答</small></div></section><section class="commission-right"><div class="commission-caption">练习档案 <span>TRAINING RECORD</span></div><div class="mission-list">${missionRow(`[记录] 已保存 ${state.sessions.length} 轮答题`,'data-go','history',true,'◷')}${missionRow(`[错题] 待复习 ${wrong} 道`,'data-go','mistakes',false,'✕')}${missionRow(`[题库] 可搜索 ${bank().length} 道`,'data-go','library',false,'⌕')}${missionRow('[开始] 进行一轮 200 题模拟','data-start','exam',false,'▶')}</div></section></div>${counters}</div>`;
  }
  const periods=[['today','◉','今日'],['exam','✦','模拟'],['practice','◷','专项'],['review','◇','复习']];
  const periodTabs=`<div class="period-tabs" role="tablist" aria-label="学习日程分类">${periods.map(([key,icon,label])=>`<button role="tab" aria-selected="${homePeriod===key}" class="${homePeriod===key?'active':''}" data-home-period="${key}"><i>${icon}</i>${label}</button>`).join('')}</div>`;
  const descriptions={today:['数控考试 · 今日任务','从题库随机抽取 200 道题','每轮抽取 140 道单选与 60 道判断题。作答后立即查看正确答案、整体讲解和各选项解析。'],exam:['数控考试 · 随机模拟','每次都是新的一轮 200 题','随机抽取 140 道单选与 60 道判断题，可以跳题、返回和查看逐项解析。'],practice:['数控考试 · 专项训练','按知识点和题型自由练习','按分类筛选题目，再选择顺序、随机或只刷错题。每道题都可以查看完整解析。'],review:['数控考试 · 错题复习','把做错的题逐道弄懂',`目前有 ${wrong} 道错题。可以重做错题，也可以在历史答题中逐题回看。`]};
  const [title,subtask,description]=descriptions[homePeriod];
  const examRows=[missionRow('[主线] 开始新一轮 200 题','data-start','exam',true),active?missionRow(`[继续] ${sessionTitle(active.mode)} · ${done}/${active.questionIds.length}`,'data-resume',active.id,false,'↻'):'',missionRow(`[记录] 查看 ${state.sessions.length} 轮历史答题`,'data-go','history',false,'◷')].join('');
  const practiceRows=[missionRow('[专项] 选择知识点与题型','data-go','practice',true),missionRow(`[资料] 搜索 ${bank().length} 道题`,'data-go','library',false,'⌕'),missionRow('[记录] 查看历史答题','data-go','history',false,'◷')].join('');
  const reviewRows=[missionRow(`[复习] 开始重做 ${wrong} 道错题`,'data-go','mistakes',true,'✕'),missionRow('[记录] 逐题查看答题历史','data-go','history',false,'◷'),missionRow('[资料] 搜索题目与讲解','data-go','library',false,'⌕')].join('');
  const todayRows=[missionRow('[主线] 开始新一轮 200 题','data-start','exam',true),active?missionRow(`[继续] ${sessionTitle(active.mode)} · ${done}/${active.questionIds.length}`,'data-resume',active.id,false,'↻'):'',missionRow('[专项] 按知识点自由练习','data-go','practice'),missionRow(`[复习] 错题回顾 · ${wrong} 道`,'data-go','mistakes'),missionRow(`[资料] 搜索 ${bank().length} 道题`,'data-go','library'),missionRow(`[记录] 历史答题 · ${state.sessions.length} 轮`,'data-go','history')].join('');
  const rows={today:todayRows,exam:examRows,practice:practiceRows,review:reviewRows}[homePeriod];
  return `<div class="zzz-home">${tabs}<div class="commission-board"><section class="commission-left"><div class="commission-caption">任务详情 <span>COMMISSION DETAILS</span></div><div class="commission-inset"><div class="commission-image"><img src="cnc-banner.png" alt="数控加工车间"><strong>${title}</strong></div><div class="commission-subtask"><i></i>${subtask}</div><p>${description}</p><button class="tracking-bar tracking-action" data-go="sync"><span class="tracking-icon">◎</span><span><strong>本地进度已记录</strong><small>点此查看设备联动</small></span><span class="tracking-dots">›</span></button></div></section><section class="commission-right">${periodTabs}<div class="mission-list">${rows}</div></section></div>${counters}</div>`;
}
function shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function sessionTitle(m){return m==='exam'?'随机模拟':m==='random'?'随机练习':m==='wrong'?'错题复习':'顺序练习'}
function sessionDate(value){return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value))}
function latestActive(){return [...state.sessions].filter(s=>s.status==='active').sort((a,b)=>b.updatedAt-a.updatedAt)[0]}
function resumeCard(){const s=latestActive();if(!s)return '';const done=s.answers.filter(a=>a!==null).length;return `<div class="card resume-card"><div><div class="eyebrow">CONTINUE LEARNING</div><h2>继续上次的${sessionTitle(s.mode)}</h2><p>${sessionDate(s.updatedAt)} · 已答 ${done} / ${s.questionIds.length} 题</p></div><button class="primary" data-resume="${esc(s.id)}">继续答题 →</button></div>`}
function persistSession(){if(!currentSession)return;currentSession.answers=[...answers];currentSession.index=index;currentSession.updatedAt=Date.now();currentSession.dirty=true;save();if(navigator.onLine)window.TijianSync?.sync()}
function resumeSession(id){const record=state.sessions.find(s=>s.id===id);if(!record||record.status!=='active')return;const byId=new Map(bank().map(q=>[q.id,q]));const restored=record.questionIds.map(id=>byId.get(id));if(restored.some(q=>!q)){sessionError='这轮题目所在的题库已更换，暂时无法继续。请恢复原题库后重试。';session=[];setView('practice');return}currentSession=record;session=restored;mode=record.mode;answers=record.answers.slice(0,session.length);while(answers.length<session.length)answers.push(null);index=Math.min(Math.max(record.index||0,0),session.length-1);selected=answers[index];sessionCorrect=answers.reduce((total,answer,i)=>total+(answer!==null&&answer===session[i].answer?1:0),0);sessionError='';setView('practice')}
function finishSession(){if(answeredCount()!==session.length||!currentSession)return;currentSession.status='finished';currentSession.finishedAt=Date.now();currentSession.correctCount=sessionCorrect;currentSession.score=Math.round(sessionCorrect/session.length*100);index=session.length;persistSession();haptic('correct');render();window.scrollTo({top:0,behavior:'auto'})}
function openResult(id){const record=state.sessions.find(s=>s.id===id);if(!record||record.status!=='finished')return;const byId=new Map(bank().map(q=>[q.id,q]));currentSession=record;session=record.questionIds.map(questionId=>byId.get(questionId)||null);answers=[...record.answers];mode=record.mode;sessionCorrect=Number.isInteger(record.correctCount)?record.correctCount:session.reduce((n,q,i)=>n+(q&&answers[i]===q.answer?1:0),0);index=session.length;setView('practice')}
function sessionScore(record,byId){if(Number.isInteger(record.score))return record.score;if(record.status!=='finished'||!record.questionIds.length||record.questionIds.some(id=>!byId.has(id)))return null;const correct=record.questionIds.reduce((n,id,i)=>n+(record.answers[i]===byId.get(id).answer?1:0),0);return Math.round(correct/record.questionIds.length*100)}
function resultView(){
  const total=session.length,correct=Number.isInteger(currentSession?.correctCount)?currentSession.correctCount:sessionCorrect,wrong=total-correct;
  const score=Number.isInteger(currentSession?.score)?currentSession.score:Math.round(correct/total*100),rank=score>=90?'S':score>=80?'A':score>=70?'B':score>=60?'C':'D';
  const categories=new Map(),missed=[];
  session.forEach((q,i)=>{if(!q)return;const name=q.category||'其他知识点',item=categories.get(name)||{name,total:0,wrong:0};item.total++;if(answers[i]!==q.answer){item.wrong++;missed.push({q,i})}categories.set(name,item)});
  const focus=[...categories.values()].filter(x=>x.wrong).sort((a,b)=>b.wrong-a.wrong||b.wrong/b.total-a.wrong/a.total).slice(0,3);
  const focusHtml=focus.length?focus.map((x,i)=>`<div class="result-focus-row"><span>${String(i+1).padStart(2,'0')}</span><div><strong>${esc(x.name)}</strong><small>失分 ${x.wrong} / ${x.total} 题 · 回看选项解析后再练这一类</small></div><b>${Math.round(x.wrong/x.total*100)}%</b></div>`).join(''):'<div class="result-focus-empty">本轮没有答错题。保持节奏，下一轮继续挑战。</div>';
  const missedHtml=missed.slice(0,3).map(({q,i})=>`<button class="result-missed" data-result-question="${i}"><span>${String(i+1).padStart(2,'0')}</span><strong>${esc(q.question)}</strong><b>查看解析 ↗</b></button>`).join('');
  return `<div class="result-screen" aria-label="练习结算"><div class="result-system"><span><i>✦</i> STUDY / COMMISSION</span><span>SYSTEM ONLINE <b>● 结算完成</b></span></div><div class="result-intro">COMMISSION COMPLETE <span>结算 / ${esc(sessionTitle(mode))}</span></div><div class="result-hero"><div class="result-rank-wrap"><span class="result-rank-shadow" aria-hidden="true">${rank}</span><strong class="result-rank" aria-label="评级 ${rank}">${rank}</strong><i class="result-rank-spark" aria-hidden="true">✦</i></div><div class="result-hero-copy"><div class="result-stamp">CLEAR <span>✓</span></div><h1>委托完成！</h1><p>本轮 ${esc(sessionTitle(mode))} · ${total} 道题已全部作答</p><div class="result-score-line"><span>本轮得分</span><strong data-result-score="${score}">${score}</strong><b>/ 100</b></div></div></div><div class="result-stats"><div><small>答对题目</small><strong>${correct}</strong></div><div><small>答错题目</small><strong>${wrong}</strong></div><div><small>正确率</small><strong>${score}%</strong></div></div><div class="result-progress"><div style="width:${score}%"></div></div><p class="result-rule">按答对题数折算百分制 · S ≥ 90 / A ≥ 80 / B ≥ 70 / C ≥ 60</p><section class="result-focus"><div class="result-section-head"><span>INTEL / 改进方向</span><strong>${wrong?'优先突破这些知识点':'本轮表现出色'}</strong></div>${focusHtml}</section>${missed.length?`<section class="result-review"><div class="result-section-head"><span>REVIEW / 错题回放</span><strong>点开查看本轮的选项解析</strong></div>${missedHtml}</section>`:''}<div class="result-actions"><button class="result-action-primary" data-start="${mode}">重新挑战 ↗</button><button class="result-action-outline" data-go="mistakes">${wrong?'打开错题本':'查看错题本'}</button><button class="result-action-outline" data-result-history="${esc(currentSession.id)}">逐题回看本轮</button></div><div class="result-foot">TIJIAN / STUDY SYSTEM <span>${esc(sessionDate(currentSession.finishedAt||Date.now()))}</span></div></div>`
}
function animateResultScore(){const el=document.querySelector('[data-result-score]');if(!el||!currentSession||lastResultAnimatedId===currentSession.id)return;lastResultAnimatedId=currentSession.id;const target=Number(el.dataset.resultScore);if(!motionEnabled||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const begin=performance.now();function frame(now){if(!el.isConnected)return;const progress=Math.min(1,(now-begin)/820);el.textContent=String(Math.round(target*(1-Math.pow(1-progress,3))));if(progress<1)requestAnimationFrame(frame)}el.textContent='0';requestAnimationFrame(frame)}
function start(m='exam'){
  mode=m;sessionError='';
  if(m==='exam'){
    const singles=bank().filter(q=>q.type==='单选题');
    const judges=bank().filter(q=>q.type==='判断题');
    if(singles.length<140||judges.length<60){sessionError=`当前题库需要至少 140 道单选和 60 道判断（现有 ${singles.length} 道单选、${judges.length} 道判断）。`;session=[];setView('practice');return}
    session=shuffle([...shuffle(singles).slice(0,140),...shuffle(judges).slice(0,60)]);
  }else{session=m==='wrong'?filtered().filter(q=>state.mistakes[q.id]):[...filtered()];if(m==='random')session=shuffle(session)}
  answers=Array(session.length).fill(null);index=0;selected=null;sessionCorrect=0;currentSession={id:crypto.randomUUID(),mode:m,questionIds:session.map(q=>q.id),answers:[...answers],index:0,status:'active',createdAt:Date.now(),updatedAt:Date.now(),dirty:true};state.sessions.unshift(currentSession);save();if(navigator.onLine)window.TijianSync?.sync();setView('practice');
}
function answeredCount(){return answers.filter(answer=>answer!==null).length}
function goToQuestion(target){if(!Number.isInteger(target)||target<0||target>=session.length||target===index)return;haptic('tap');index=target;selected=answers[index];navOpen=false;persistSession();render();window.scrollTo({top:0,behavior:'auto'})}
function questionNav(){if(mode!=='exam')return '';const done=answeredCount();return `<button class="nav-bottom-toggle" type="button" data-toggle-question-nav aria-expanded="${navOpen}" aria-controls="question-number-panel"><span>▦ 题号导航</span><small>第 ${index+1} / ${session.length} 题 · 已答 ${done}</small><b>${navOpen?'收起 ↑':'展开 ↓'}</b></button><aside id="question-number-panel" class="card question-nav" aria-label="题号导航"><div class="question-nav-head"><strong>题号导航</strong><span>已答 ${done} / ${session.length}</span><button class="nav-close" type="button" data-toggle-question-nav aria-label="收起题号导航">×</button></div><form class="question-jump-form"><label for="jump-number">跳到第</label><input id="jump-number" name="number" type="number" min="1" max="${session.length}" value="${index+1}" inputmode="numeric"><span>题</span><button type="submit">跳转</button></form><div class="question-nav-legend"><span><i class="current"></i>当前</span><span><i class="done"></i>已答</span><span><i></i>未答</span></div><div class="question-nav-scroll"><div class="question-nav-grid">${session.map((_,i)=>`<button type="button" class="question-number ${i===index?'current':answers[i]!==null?'done':''}" data-jump="${i}" aria-label="第 ${i+1} 题，${answers[i]!==null?'已答':'未答'}" ${i===index?'aria-current="step"':''}>${i+1}</button>`).join('')}</div></div></aside>`}
function filters(){const categories=['全部分类',...new Set(bank().map(q=>q.category||'未分类'))];const types=['全部题型',...new Set(bank().map(q=>q.type).filter(Boolean))];return `<div class="filter-group"><div><strong>知识分类</strong><div class="mode-row">${categories.map(c=>`<button class="pill ${category===c?'selected':''}" data-category="${esc(c)}">${esc(c)}</button>`).join('')}</div></div><div><strong>题目类型</strong><div class="mode-row">${types.map(t=>`<button class="pill ${questionType===t?'selected':''}" data-type="${esc(t)}">${esc(t)}</button>`).join('')}</div></div></div>`}
function currentAnswerLetters(text,q,optionIndex=null){
  if(q.type!=='单选题')return text;
  const answerLetter='ABCDEFGH'[q.answer]||String(q.answer+1);
  let result=String(text||'').replace(/【为何选[A-H]】/g,`【为何选${answerLetter}】`).replace(/(因此本题选|所以本题选|本题应选|本题选)[A-H]/g,`$1${answerLetter}`);
  if(optionIndex!==null){const letter='ABCDEFGH'[optionIndex]||String(optionIndex+1);result=result.replace(/(故不能选|因此不能选|所以不能选)[A-H]/g,`$1${letter}`)}
  return result;
}
function explanationHtml(q,chosen=selected){
  const optionDetails=Array.isArray(q.optionExplanations)&&q.optionExplanations.length===q.options.length?
    `<div class="option-analysis"><h3>逐项分析</h3>${q.options.map((option,i)=>`<div class="option-detail ${i===q.answer?'is-answer':''}"><span class="detail-letter">${q.type==='判断题'?'✓✕'[i]:'ABCDEFGH'[i]||i+1}</span><div><strong>${esc(option)}</strong><p>${esc(currentAnswerLetters(q.optionExplanations[i],q,i))}</p></div></div>`).join('')}</div>`:'';
  const review=q.reviewNote?`<div class="review-note"><strong>这题的答案或表述待核查</strong><p>${esc(q.reviewNote)}</p></div>`:'';
  return `<div class="explanation"><strong>${chosen===null?'题目解析':chosen===q.answer?'答对了，继续保持！':'这道题再记一下'}</strong><p>${esc(currentAnswerLetters(q.explanation||`正确答案：${q.options[q.answer]}`,q))}</p></div>${optionDetails}${review}`;
}
function practiceView(){
  if(!session.length){
    return `<div class="hero"><div><div class="eyebrow">PRACTICE</div><h1>选一种方式，开始练。</h1><p>随机模拟或按知识点专项练习，做完一题就能看讲解。</p></div></div>${resumeCard()}<div class="card panel exam-start"><div><div class="eyebrow">RANDOM EXAM</div><h2>随机 200 题</h2><p class="muted">每次从题库重新抽题并打乱顺序。</p><div class="exam-numbers"><span>单选 140</span><span>判断 60</span><span>共 200 题</span></div>${sessionError?`<p class="error">${esc(sessionError)}</p>`:''}</div><button class="primary" data-start="exam">开始一轮 →</button></div><div class="card panel" style="margin-top:18px"><h2>专项练习</h2><p class="muted">选分类和题型，再决定按顺序、随机或只刷错题。</p>${filters()}<div class="mode-row"><button class="pill" data-start="order">顺序练习（${filtered().length} 题）</button><button class="pill" data-start="random">随机练习</button><button class="pill" data-start="wrong">只刷错题</button></div></div><div class="history-shortcut"><span>做过的题都可以回看</span><button class="secondary" data-go="history">查看历史答题 →</button></div>`;
  }
  if(index>=session.length)return resultView();
  const q=session[index],done=answeredCount(),complete=done===session.length;
  const title=mode==='exam'?'随机模拟':mode==='random'?'随机练习':mode==='wrong'?'错题复习':'顺序练习';
  return `<div class="practice-layout ${mode==='exam'?'has-nav':''} ${navOpen?'nav-open':''}"><div class="practice-header"><div><div class="eyebrow">INTER-KNOT / TRAINING POST</div><h1>${title}</h1></div><div class="practice-header-actions">${mode==='exam'?`<button class="nav-toggle" data-toggle-question-nav aria-expanded="${navOpen}">题号 ${index+1}/${session.length} <span>▦</span></button>`:''}<button class="haptic-toggle" data-haptic-toggle aria-pressed="${hapticsEnabled}">震动 ${hapticsEnabled?'开':'关'}</button><button class="practice-exit" data-stop>退出练习</button></div></div><div class="practice-content"><div class="card question-card knot-card"><div class="knot-post-head"><div class="knot-avatar">题</div><div class="knot-author"><strong>题间 · 数控练习</strong><small>刚刚发布 · ${esc(q.category||'我的题库')}</small></div><span class="knot-post-mark">#${String(index+1).padStart(3,'0')}</span></div><div class="knot-progress"><strong>第 ${index+1} / ${session.length} 题</strong><span>已答 ${done} / ${session.length}</span></div><div class="progress"><div style="width:${done/session.length*100}%"></div></div><div class="question-meta"><span>${esc(q.type||'单选题')}</span>${q.reviewNote?'<span class="review-badge">答案待核查</span>':''}</div><h2 class="question">${esc(q.question)}</h2><div class="question-mark-row"><button class="question-mark ${state.marked[q.id]?'is-marked':''}" data-mark-unknown="${esc(q.id)}" ${state.marked[q.id]?'disabled':''}>${state.marked[q.id]?'✓ 已记入错题本':'◇ 标记不会 · 加入错题本'}</button></div><div class="knot-reply"><div class="knot-reply-label"><span>REPLY</span><strong>选择你的回答</strong><i>⌄</i></div><div class="options">${q.options.map((o,i)=>`<button class="option ${selected===null?'':i===q.answer?'correct':i===selected?'wrong':''}" data-answer="${i}" ${selected===null?'':'disabled'}><span>${q.type==='判断题'?'✓✕'[i]:'ABCDEFGH'[i]||i+1}</span><b>${esc(o)}</b></button>`).join('')}</div></div>${selected!==null?`<div class="knot-analysis-label">INTEL / 答案解析</div>${explanationHtml(q)}`:''}<div class="question-actions"><button class="secondary" data-prev ${index===0?'disabled':''}>← 上一题</button><div class="question-action-right">${index<session.length-1?`<button class="primary" data-next>下一题 →</button>`:!complete?`<button class="primary" data-next>前往未答题 →</button>`:''}${complete?'<button class="primary finish-cta" data-finish>查看结算 →</button>':''}</div></div>${selected===null?'<p class="answer-hint">选择后查看讲解，也可以先跳过。</p>':''}</div>${questionNav()}</div></div>`;
}
function mistakes(){
  const all=bank().filter(q=>state.mistakes[q.id]);
  if(mistakeDetailId){const q=all.find(item=>item.id===mistakeDetailId);if(q)return `<div class="detail-head"><button class="secondary" data-mistake-back>← 返回错题列表</button><span>${esc(q.category||'未分类')} · ${esc(q.type||'单选题')}</span></div><div class="card panel review-detail"><h2>${esc(q.question)}</h2>${questionReview(q,null)}<div class="button-row"><button class="secondary" data-remove="${esc(q.id)}">移出错题本</button></div></div>`;mistakeDetailId=null}
  const query=mistakeSearchQuery.trim().toLowerCase();
  const shown=all.filter(q=>!query||[q.question,...q.options,q.category].some(text=>String(text||'').toLowerCase().includes(query)));
  return `<div class="hero"><div><div class="eyebrow">REVIEW / ARCHIVE</div><h1>错题本</h1><p>答错和标记不会的题都在这里，可以按题目、选项或知识点搜索。</p></div></div><div class="mistake-toolbar card panel"><div><strong>${all.length} 道待复习</strong><span>其中 ${all.filter(q=>state.marked[q.id]).length} 道标记不会</span></div>${all.length?`<button class="primary" data-start="wrong">复习全部 →</button>`:''}</div><form class="mistake-search-form card panel"><label for="mistake-search">搜索错题</label><div><input id="mistake-search" name="query" type="search" value="${esc(mistakeSearchQuery)}" placeholder="输入题干、选项或知识点" autocomplete="off"><button class="primary" type="submit">搜索</button></div></form>${shown.length?`<div class="mistake-results">${shown.map((q,i)=>`<div class="card mistake-row"><button class="mistake-open" data-mistake-detail="${esc(q.id)}"><span class="mistake-index">${String(i+1).padStart(2,'0')}</span><span><small>${esc(q.category||'未分类')} · ${esc(q.type||'单选题')} ${state.marked[q.id]?'· 标记不会':''}</small><strong>${esc(q.question)}</strong></span><b>›</b></button><button class="mistake-remove" data-remove="${esc(q.id)}">移出</button></div>`).join('')}</div>`:`<div class="card empty"><h2>${all.length?'没有找到相关错题':'错题本还是空的'}</h2><p>${all.length?'试试更短的关键词。':'答错或标记不会的题会自动出现在这里。'}</p>${!all.length?'<button class="primary" data-go="practice">去刷题 →</button>':''}</div>`}`
}
function questionReview(q,chosen){return `<div class="review-options">${q.options.map((option,i)=>`<div class="review-option ${i===q.answer?'is-correct':''} ${i===chosen&&chosen!==q.answer?'is-wrong':''}"><span>${q.type==='判断题'?'✓✕'[i]:'ABCDEFGH'[i]||i+1}</span><div>${esc(option)}</div>${i===q.answer?'<small>正确答案</small>':i===chosen?'<small>你的答案</small>':''}</div>`).join('')}</div>${explanationHtml(q,chosen)}`}
function settingsView(){return `<div class="hero settings-hero"><div><div class="eyebrow">PREFERENCES / SETUP</div><h1>设置</h1><p>按自己的习惯调整刷题体验，选择会保存在这台设备。</p></div></div><div class="settings-list"><section class="card settings-card"><div><h2>震动反馈</h2><p>作答和点按时使用手机震动。</p></div><button class="settings-switch" data-setting-haptics role="switch" aria-checked="${hapticsEnabled}">${hapticsEnabled?'已开启':'已关闭'}</button></section><section class="card settings-card"><div><h2>界面动效</h2><p>题卡切换和操作时的动画。关闭后仍保留必要的状态提示。</p></div><button class="settings-switch" data-setting-motion role="switch" aria-checked="${motionEnabled}">${motionEnabled?'已开启':'已关闭'}</button></section><section class="card settings-card settings-font"><div><h2>题目字号</h2><p>调整题干、选项及解析的阅读大小。</p></div><div class="settings-font-options" role="group" aria-label="题目字号">${[['standard','标准'],['large','较大'],['extra','特大']].map(([value,label])=>`<button data-setting-font="${value}" class="${fontSize===value?'active':''}" aria-pressed="${fontSize===value}">${label}</button>`).join('')}</div></section><section class="card settings-card"><div><h2>学习记录</h2><p>已保存 ${state.sessions.length} 轮答题、${Object.keys(state.mistakes).length} 道待复习题。离线时会继续保存在本机。</p></div><button class="secondary" data-setting-space>查看我的空间 →</button></section></div>`}
function libraryView(){
  if(libraryDetailId){const q=bank().find(item=>item.id===libraryDetailId);if(q){const a=state.attempts[q.id];return `<div class="detail-head"><button class="secondary" data-library-back>← 返回搜题</button><span>${esc(q.category||'未分类')} · ${esc(q.type||'单选题')}</span></div><div class="card panel review-detail"><h2>${esc(q.question)}</h2>${questionReview(q,null)}<p class="muted">${a?`你已答过 ${a.total} 次，答对 ${a.correct} 次。`:'你还没有答过这道题。'}</p></div>`}}
  const query=searchQuery.trim().toLowerCase(),matches=bank().filter(q=>(searchType==='全部题型'||q.type===searchType)&&(!query||[q.question,...q.options,q.category,q.id].some(text=>String(text||'').toLowerCase().includes(query))));
  const pages=Math.max(1,Math.ceil(matches.length/30));searchPage=Math.min(searchPage,pages-1);const shown=matches.slice(searchPage*30,(searchPage+1)*30);
  return `<div class="hero"><div><div class="eyebrow">QUESTION LIBRARY</div><h1>题库搜题</h1><p>输入题干、选项或知识点，找到后点开查看答案和解析。</p></div></div><div class="card panel search-panel"><form class="question-search-form"><label for="question-search">搜索题目</label><div><input id="question-search" name="query" type="search" value="${esc(searchQuery)}" placeholder="例如：G代码、退火、尺寸公差" autocomplete="off"><button class="primary" type="submit">搜题</button></div></form><div class="search-types">${['全部题型','单选题','判断题'].map(type=>`<button class="pill ${searchType===type?'selected':''}" data-search-type="${type}">${type}</button>`).join('')}</div><p class="search-count">找到 ${matches.length} 道题${query?` · “${esc(searchQuery)}”`:''}</p></div><div class="search-results">${shown.length?shown.map(q=>`<button class="card search-result" data-library-question="${esc(q.id)}"><span class="search-result-meta">${esc(q.category||'未分类')} · ${esc(q.type||'单选题')}</span><strong>${esc(q.question)}</strong><span>查看答案和解析 →</span></button>`).join(''):`<div class="card empty"><h2>没有找到相关题目</h2><p>试试更短的关键词，或切换题型。</p></div>`}</div>${matches.length>30?`<div class="pager"><button class="secondary" data-search-page="${searchPage-1}" ${searchPage===0?'disabled':''}>← 上一页</button><span>${searchPage+1} / ${pages}</span><button class="secondary" data-search-page="${searchPage+1}" ${searchPage===pages-1?'disabled':''}>下一页 →</button></div>`:''}<div class="card panel import-panel"><h2>${state.custom.length?'已导入新题库':'数控题库已就绪'}</h2><p class="muted">${state.custom.length?`当前使用新导入的 ${state.custom.length} 道题。清除后可恢复内置题库。`:`内置 ${bank().length} 道题。`}</p><div class="upload"><strong>导入新版 Excel、CSV 或 JSON</strong><p>支持“教之初”题库格式和常规题目表格。</p><button class="primary" id="upload-button">选择文件</button></div>${importError?`<div class="error">${esc(importError)}</div>`:''}${state.custom.length?`<div class="button-row" style="margin-top:20px"><button class="secondary" data-clear>恢复内置题库</button></div>`:''}</div>`
}
function historyView(){
  const record=state.sessions.find(s=>s.id===historySessionId);
  if(!record){
    const list=[...state.sessions].sort((a,b)=>b.updatedAt-a.updatedAt),byId=new Map(bank().map(q=>[q.id,q]));
    return `<div class="hero"><div><div class="eyebrow">ANSWER HISTORY</div><h1>历史答题</h1><p>离开后可以继续未完成的一轮，也可以逐题回看已答内容。</p></div></div>${list.length?`<div class="history-list">${list.map(s=>{const done=s.answers.filter(a=>a!==null).length,score=sessionScore(s,byId);return `<div class="card history-session"><div><span class="history-status ${s.status==='finished'?'finished':''}">${s.status==='finished'?'已完成':'进行中'}</span><h2>${sessionTitle(s.mode)}</h2><p>${sessionDate(s.updatedAt)} · 已答 ${done} / ${s.questionIds.length} 题${score!==null?` · ${score} 分`:''}</p></div><div class="history-actions"><button class="secondary" data-history-session="${esc(s.id)}">逐题查看</button>${s.status==='finished'?`<button class="primary" data-result-session="${esc(s.id)}">查看结算</button>`:`<button class="primary" data-resume="${esc(s.id)}">继续答题</button>`}</div></div>`}).join('')}</div>`:`<div class="card empty"><h2>还没有答题记录</h2><p>开始一轮后，进度会自动保存在这里。</p><button class="primary" data-go="practice">开始刷题 →</button></div>`}`
  }
  const byId=new Map(bank().map(q=>[q.id,q]));const done=record.answers.filter(a=>a!==null).length;
  if(historyQuestionIndex===null){const score=sessionScore(record,byId);return `<div class="detail-head"><button class="secondary" data-history-overview>← 所有记录</button><span>${sessionDate(record.createdAt)}</span></div><div class="history-summary"><h1>${sessionTitle(record.mode)}</h1><p>已答 ${done} / ${record.questionIds.length} 题 · ${record.status==='finished'?'已完成':'进行中'}${score!==null?` · ${score} 分`:''}</p>${record.status==='active'?`<button class="primary" data-resume="${esc(record.id)}">继续答题 →</button>`:`<button class="primary" data-result-session="${esc(record.id)}">查看结算 →</button>`}</div><div class="history-questions">${record.questionIds.map((id,i)=>{const q=byId.get(id),answer=record.answers[i];return `<button class="card history-question" data-history-question="${i}"><span class="history-question-number">${i+1}</span><span><strong>${esc(q?.question||'题目已不在当前题库')}</strong><small>${answer===null?'未答':q&&answer===q.answer?'已答对':'已答错'}</small></span><span>查看 →</span></button>`}).join('')}</div>`}
  const i=historyQuestionIndex,q=byId.get(record.questionIds[i]),chosen=record.answers[i];
  return `<div class="detail-head"><button class="secondary" data-history-back>← 本轮题目</button><span>第 ${i+1} / ${record.questionIds.length} 题</span></div><div class="card panel review-detail">${q?`<div class="question-meta"><span>${esc(q.category||'未分类')}</span><span>${esc(q.type||'单选题')}</span></div><h2>${esc(q.question)}</h2>${chosen===null?`<p class="muted">这道题还没作答。继续本轮答题后再来看解析。</p>`:questionReview(q,chosen)}`:'<p>题目已不在当前题库，请恢复原题库后查看。</p>'}<div class="review-navigation"><button class="secondary" data-history-step="${i-1}" ${i===0?'disabled':''}>← 上一题</button><button class="secondary" data-history-step="${i+1}" ${i===record.questionIds.length-1?'disabled':''}>下一题 →</button></div></div>`
}
function leavePractice(){if(session.length&&currentSession?.status==='active')persistSession();session=[];currentSession=null;selected=null;navOpen=false;lastResultAnimatedId=null}
function setupPageScrubber(){
  const pager=document.querySelector('.pager');
  const match=pager?.querySelector('span')?.textContent.match(/(\d+)\s*\/\s*(\d+)/);
  if(!match)return;
  document.querySelector('#app').append(pager);
  const pages=Number(match[2]);
  const rail=document.createElement('div');rail.className='page-scrubber';rail.tabIndex=0;
  rail.setAttribute('role','slider');rail.setAttribute('aria-label','题库页码');
  rail.setAttribute('aria-valuemin','1');rail.setAttribute('aria-valuemax',String(pages));
  rail.innerHTML='<div class="page-scrub-track"><span></span><i></i></div><strong></strong><small>左右滑动跳页 · 上滑后精细调节</small>';
  pager.insertBefore(rail,pager.lastElementChild);
  const track=rail.querySelector('.page-scrub-track'),fill=track.querySelector('span'),thumb=track.querySelector('i'),label=rail.querySelector('strong'),hint=rail.querySelector('small');
  let dragging=false,startX=0,startY=0,startPage=searchPage+1,previewPage=startPage;
  const clamp=n=>Math.max(1,Math.min(pages,n));
  const show=(page,precision=1)=>{previewPage=clamp(page);const pct=(previewPage-1)/(pages-1)*100;fill.style.width=`${pct}%`;thumb.style.left=`${pct}%`;label.textContent=`第 ${previewPage} / ${pages} 页`;hint.textContent=precision===1?'左右滑动跳页 · 上滑后精细调节':`精细调节 ×${precision}`;rail.setAttribute('aria-valuenow',String(previewPage))};
  const commit=()=>{if(searchPage===previewPage-1)return;searchPage=previewPage-1;render();document.querySelector('.search-results')?.scrollIntoView({behavior:'smooth',block:'start'})};
  show(startPage);
  rail.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button!==0)return;const bounds=track.getBoundingClientRect();startPage=clamp(Math.round((event.clientX-bounds.left)/bounds.width*(pages-1))+1);startX=event.clientX;startY=event.clientY;dragging=true;rail.setPointerCapture(event.pointerId);show(startPage);event.preventDefault()});
  rail.addEventListener('pointermove',event=>{if(!dragging)return;const lift=startY-event.clientY,precision=lift>85?10:lift>40?4:1;show(startPage+Math.round((event.clientX-startX)/track.clientWidth*(pages-1)/precision),precision)});
  rail.addEventListener('pointerup',()=>{if(!dragging)return;dragging=false;commit()});
  rail.addEventListener('pointercancel',()=>{dragging=false;show(searchPage+1)});
  rail.addEventListener('keydown',event=>{const step=event.key==='PageDown'||event.key==='PageUp'?5:1;let page=searchPage+1;if(event.key==='ArrowRight'||event.key==='PageDown')page+=step;else if(event.key==='ArrowLeft'||event.key==='PageUp')page-=step;else if(event.key==='Home')page=1;else if(event.key==='End')page=pages;else return;event.preventDefault();show(page);commit()});
}
let lastBackAt=0;
function goBackInApp(){
  const now=Date.now();if(now-lastBackAt<350)return true;lastBackAt=now;
  if(view==='practice'&&navOpen){navOpen=false;render();return true}
  if(view==='library'&&libraryDetailId){libraryDetailId=null;render();return true}
  if(view==='mistakes'&&mistakeDetailId){mistakeDetailId=null;render();return true}
  if(view==='settings'){setView('sync');return true}
  if(view==='history'&&historyQuestionIndex!==null){historyQuestionIndex=null;render();return true}
  if(view==='history'&&historySessionId){historySessionId=null;render();return true}
  if(view==='home')return false;
  leavePractice();setView('home');return true;
}
function enableBackGestures(){
  let start=null;
  document.addEventListener('touchstart',event=>{
    if(event.touches.length!==1){start=null;return}
    const touch=event.touches[0],edge=28;
    start=touch.clientX<=edge?{x:touch.clientX,y:touch.clientY,side:'left'}:touch.clientX>=innerWidth-edge?{x:touch.clientX,y:touch.clientY,side:'right'}:null;
  },{passive:true});
  document.addEventListener('touchend',event=>{
    if(!start||!event.changedTouches.length)return;
    const end=event.changedTouches[0],dx=end.clientX-start.x,dy=end.clientY-start.y;
    if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.5&&((start.side==='left'&&dx>0)||(start.side==='right'&&dx<0)))goBackInApp();
    start=null;
  },{passive:true});
  document.addEventListener('touchcancel',()=>{start=null},{passive:true});
  const cap=window.Capacitor;
  if(cap?.isNativePlatform?.()){
    try{
      const app=cap.Plugins?.App||cap.registerPlugin?.('App');
      Promise.resolve(app?.addListener?.('backButton',()=>{if(!goBackInApp())Promise.resolve(app.minimizeApp()).catch(()=>{})})).catch(()=>{});
    }catch{}
  }
}
function bind(){
  document.querySelectorAll('[data-home-tab]').forEach(b=>b.onclick=()=>{if(homeTab!==b.dataset.homeTab){haptic('tap');homeTab=b.dataset.homeTab;render()}});
  document.querySelectorAll('[data-home-period]').forEach(b=>b.onclick=()=>{if(homePeriod!==b.dataset.homePeriod){haptic('tap');homePeriod=b.dataset.homePeriod;render()}});
  document.querySelectorAll('[data-toggle-question-nav]').forEach(b=>b.onclick=()=>{haptic('tap');navOpen=!navOpen;navMotion=navOpen;render();if(navOpen){const scroll=document.querySelector('.question-nav-scroll'),current=scroll?.querySelector('.question-number.current');if(scroll&&current)scroll.scrollTop+=current.getBoundingClientRect().top-scroll.getBoundingClientRect().top-scroll.clientHeight/2}document.querySelector('.nav-bottom-toggle')?.scrollIntoView({behavior:'smooth',block:'start'})});
  document.querySelector('[data-haptic-toggle]')?.addEventListener('click',()=>{hapticsEnabled=!hapticsEnabled;localStorage.setItem('tijian-haptics',hapticsEnabled?'on':'off');if(hapticsEnabled)haptic('tap');render()});
  document.querySelector('[data-settings]')?.addEventListener('click',()=>setView('settings'));
  document.querySelector('[data-setting-space]')?.addEventListener('click',()=>setView('sync'));
  document.querySelector('[data-setting-haptics]')?.addEventListener('click',()=>{hapticsEnabled=!hapticsEnabled;localStorage.setItem('tijian-haptics',hapticsEnabled?'on':'off');if(hapticsEnabled)haptic('tap');render()});
  document.querySelector('[data-setting-motion]')?.addEventListener('click',()=>{motionEnabled=!motionEnabled;localStorage.setItem('tijian-motion',motionEnabled?'on':'off');applyPreferences();render()});
  document.querySelectorAll('[data-setting-font]').forEach(b=>b.onclick=()=>{fontSize=b.dataset.settingFont;localStorage.setItem('tijian-font-size',fontSize);applyPreferences();render()});
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{leavePractice();if(b.dataset.go==='history'){historySessionId=null;historyQuestionIndex=null}setView(b.dataset.go)});
  document.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>start(b.dataset.start));
  document.querySelectorAll('[data-resume]').forEach(b=>b.onclick=()=>resumeSession(b.dataset.resume));
  document.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>answer(Number(b.dataset.answer)));
  document.querySelector('[data-mark-unknown]')?.addEventListener('click',event=>{
    const id=event.currentTarget.dataset.markUnknown;
    if(state.marked[id])return;
    state.marked[id]=true;state.mistakes[id]=true;save();haptic('tap');
    window.TijianSync?.record(id,'seed',0,0,'add');render();
  });
  document.querySelector('[data-prev]')?.addEventListener('click',()=>goToQuestion(index-1));
  document.querySelector('[data-next]')?.addEventListener('click',()=>goToQuestion(index<session.length-1?index+1:answers.findIndex(answer=>answer===null)));
  document.querySelectorAll('[data-finish]').forEach(b=>b.addEventListener('click',finishSession));
  document.querySelectorAll('[data-result-session]').forEach(b=>b.onclick=()=>openResult(b.dataset.resultSession));
  document.querySelector('[data-result-history]')?.addEventListener('click',event=>{historySessionId=event.currentTarget.dataset.resultHistory;historyQuestionIndex=null;leavePractice();setView('history')});
  document.querySelectorAll('[data-result-question]').forEach(b=>b.onclick=()=>{historySessionId=currentSession.id;historyQuestionIndex=Number(b.dataset.resultQuestion);leavePractice();setView('history')});
  document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>goToQuestion(Number(b.dataset.jump)));
  document.querySelector('.question-jump-form')?.addEventListener('submit',event=>{event.preventDefault();const number=Number(event.currentTarget.elements.number.value);if(Number.isInteger(number)&&number>=1&&number<=session.length)goToQuestion(number-1);else event.currentTarget.elements.number.reportValidity()});
  document.querySelector('[data-stop]')?.addEventListener('click',()=>{leavePractice();setView('home')});
  document.querySelector('.question-search-form')?.addEventListener('submit',event=>{event.preventDefault();searchQuery=event.currentTarget.elements.query.value.trim();searchPage=0;render()});
  document.querySelector('.mistake-search-form')?.addEventListener('submit',event=>{event.preventDefault();mistakeSearchQuery=event.currentTarget.elements.query.value.trim();render()});
  document.querySelectorAll('[data-mistake-detail]').forEach(b=>b.onclick=()=>{mistakeDetailId=b.dataset.mistakeDetail;render();window.scrollTo({top:0,behavior:'smooth'})});
  document.querySelector('[data-mistake-back]')?.addEventListener('click',()=>{mistakeDetailId=null;render()});
  document.querySelectorAll('[data-search-type]').forEach(b=>b.onclick=()=>{searchType=b.dataset.searchType;searchPage=0;render()});
  document.querySelectorAll('[data-search-page]').forEach(b=>b.onclick=()=>{searchPage=Number(b.dataset.searchPage);render();window.scrollTo({top:0,behavior:'smooth'})});
  setupPageScrubber();
  document.querySelectorAll('[data-library-question]').forEach(b=>b.onclick=()=>{libraryDetailId=b.dataset.libraryQuestion;render();window.scrollTo({top:0,behavior:'smooth'})});
  document.querySelector('[data-library-back]')?.addEventListener('click',()=>{libraryDetailId=null;render()});
  document.querySelectorAll('[data-history-session]').forEach(b=>b.onclick=()=>{leavePractice();historySessionId=b.dataset.historySession;historyQuestionIndex=null;setView('history')});
  document.querySelector('[data-history-overview]')?.addEventListener('click',()=>{historySessionId=null;historyQuestionIndex=null;render()});
  document.querySelector('[data-history-back]')?.addEventListener('click',()=>{historyQuestionIndex=null;render()});
  document.querySelectorAll('[data-history-question]').forEach(b=>b.onclick=()=>{historyQuestionIndex=Number(b.dataset.historyQuestion);render();window.scrollTo({top:0,behavior:'smooth'})});
  document.querySelectorAll('[data-history-step]').forEach(b=>b.onclick=()=>{historyQuestionIndex=Number(b.dataset.historyStep);render();window.scrollTo({top:0,behavior:'smooth'})});
  document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{delete state.mistakes[b.dataset.remove];delete state.marked[b.dataset.remove];if(mistakeDetailId===b.dataset.remove)mistakeDetailId=null;save();window.TijianSync?.record(b.dataset.remove,'remove',0,0,'remove');render()});
  document.querySelector('#upload-button')?.addEventListener('click',()=>document.querySelector('#file-input').click());
  document.querySelector('[data-clear]')?.addEventListener('click',()=>{state.custom=[];save();libraryDetailId=null;render()})
}
function bindFilters(){document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;render()});document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{questionType=b.dataset.type;render()})}
function answer(i){if(answers[index]!==null)return;const q=session[index];haptic(i===q.answer?'correct':'wrong');answerMotion=true;answers[index]=i;selected=i;const a=state.attempts[q.id]||{total:0,correct:0};a.total++;if(i===q.answer){a.correct++;sessionCorrect++;if(mode==='wrong'&&!state.marked[q.id])delete state.mistakes[q.id]}else state.mistakes[q.id]=true;state.attempts[q.id]=a;persistSession();window.TijianSync?.record(q.id,'answer',1,i===q.answer?1:0,i===q.answer&&mode==='wrong'&&!state.marked[q.id]?'remove':i===q.answer?null:'add');render()}
function get(row,names){const keys=Object.keys(row);for(const name of names){const key=keys.find(k=>k.trim().toLowerCase()===name.toLowerCase());if(key!==undefined&&row[key]!==undefined&&row[key]!==null)return String(row[key]).trim()}return ''}
function normalize(rows){
  const out=[];
  rows.forEach((r,n)=>{
    const question=get(r,['题目','问题','题干','question','Question']);
    if(!question)return;
    const declaredType=get(r,['题型','类型','type']);
    let options=[...'ABCDEFGH'].map((letter,i)=>get(r,[letter,`选项${letter}`,`选项${i+1}`,`option${letter}`,`option_${letter}`]));
    if(options.every(x=>!x)){
      const raw=get(r,['选项','options','Choices']);
      options=raw.split(/\s*[|｜;；]\s*/).map(x=>x.replace(/^[A-H][.、．:]\s*/i,'')).filter(Boolean);
    }
    if(declaredType==='判断题'&&options.length<2)options=['正确','错误'];
    options=options.filter(Boolean);
    if(options.length<2&&declaredType==='单选题'){
      const existing=(window.BUNDLED_QUESTIONS||[]).find(q=>q.question===question);
      if(existing)options=existing.options.slice(existing.answer).concat(existing.options.slice(0,existing.answer));
    }
    if(options.length<2)return;
    const raw=get(r,['答案','正确答案','参考答案','answer','Answer']);
    let answer=options.findIndex(x=>x===raw);
    if(answer<0){
      if(raw==='√'||/^(正确|对|true)$/i.test(raw))answer=0;
      else if(raw==='×'||/^(错误|错|false)$/i.test(raw))answer=1;
      else{
        const letter=raw.match(/^[A-H](?:[.、．\s]|$)/i);
        if(letter)answer=letter[0].toUpperCase().charCodeAt(0)-65;
        else if(/^[1-8]$/.test(raw))answer=Number(raw)-1;
      }
    }
    if(answer<0||answer>=options.length)return;
    const type=declaredType||((options.length===2&&options[0]==='正确'&&options[1]==='错误')?'判断题':'单选题');
    const optionExplanations=type==='单选题'?options.map((_,i)=>get(r,[`选项${'ABCDEFGH'[i]}解析`])):[];
    const item={id:'u'+n+'-'+question.slice(0,15),question,options,answer,type,explanation:get(r,['整体解析','解析','答案解析','解释','explanation']),category:get(r,['分类','科目','章节','知识点','category'])||'我的题库'};
    if(optionExplanations.length&&optionExplanations.every(Boolean))item.optionExplanations=optionExplanations;
    const reviewNote=get(r,['待核查']);if(reviewNote)item.reviewNote=reviewNote;
    out.push(item);
  });
  return out;
}
function parseNative(rows,sheet){const out=[];rows.forEach((row,n)=>{const type=String(row[11]||'').trim();if(!['单选题','判断题'].includes(type))return;const question=String(row[1]||'').trim();if(!question)return;let options,answer;if(type==='判断题'){const truth=String(row[10]||'').trim();if(!['√','×'].includes(truth))return;options=['正确','错误'];answer=truth==='√'?0:1}else{const raw=row.slice(2,10).map(v=>String(v??'').trim()).filter(Boolean);if(raw.length<2)return;const offset=(n*7+3)%raw.length;options=raw.slice(offset).concat(raw.slice(0,offset));answer=options.indexOf(raw[0])}out.push({id:`u-${sheet}-${n}`,question,options,answer,explanation:String(row[19]||'').trim(),category:String(row[36]||'').trim()||'未分类',type})});return out}
document.querySelector('#file-input').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    let items=[];
    if(file.name.toLowerCase().endsWith('.json')){
      const data=JSON.parse(await file.text());const rows=Array.isArray(data)?data:Array.isArray(data.questions)?data.questions:[];
      items=rows.every(r=>Array.isArray(r.options)&&Number.isInteger(r.answer))?rows:normalize(rows);
    }else{
      if(!window.XLSX)throw Error('表格读取组件未加载，请刷新页面后重试。');
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
      items=wb.SheetNames.flatMap(name=>{const sheet=wb.Sheets[name];const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});return rows[1]?.[2]==='正确答案(A)'?parseNative(rows,name):normalize(XLSX.utils.sheet_to_json(sheet,{defval:''}))});
    }
    if(!items.length)throw Error('没有识别到有效题目。请检查题目、选项和答案列。');
    const existing=new Map((window.BUNDLED_QUESTIONS||[]).map(q=>[`${q.question}|${q.options[q.answer]}`,q.explanation]));
    items=items.map(q=>({...q,explanation:q.explanation||existing.get(`${q.question}|${q.options[q.answer]}`)||window.createExplanation(q)}));
    state.custom=items;category='全部分类';questionType='全部题型';save();importError='';leavePractice();libraryDetailId=null;setView('library');alert(`成功导入 ${items.length} 道题，可以开始练习了。`);
  }catch(err){importError=err.message||'导入失败，请检查文件格式。';render()}
  e.target.value='';
});
document.querySelector('.brand')?.addEventListener('click',event=>{event.preventDefault();leavePractice();setView('home')});document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>{leavePractice();if(b.dataset.view==='history'){historySessionId=null;historyQuestionIndex=null}setView(b.dataset.view)});const baseRender=render;render=function(){baseRender();bindFilters()};render();enableBackGestures();




