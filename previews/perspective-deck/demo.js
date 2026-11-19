import { PerspectiveCardDeck } from './perspective-deck.js';
const cards = [
  {id:'A',title:'开始刷题',description:'专注眼前这一题。',category:'练习',footer:'PRACTICE',background:'#263b5a',icon:'<path d="m10 7 7 5-7 5z"/><rect x="3" y="3" width="18" height="18" rx="4"/>'},
  {id:'B',title:'错题复习',description:'把不熟悉的，再练一次。',category:'复习',footer:'REVIEW',background:'#3d384e',icon:'<path d="M4 8h11a5 5 0 0 1 0 10h-4M4 8l4-4M4 8l4 4"/>'},
  {id:'C',title:'答题历史',description:'每一次进步，都有记录。',category:'记录',footer:'HISTORY',background:'#2b4743',icon:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>'},
  {id:'D',title:'题库搜索',description:'找到你想弄懂的知识。',category:'题库',footer:'LIBRARY',background:'#50422f',icon:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>'}
];
function renderCard(card){
  const content=document.createElement('div');content.className='card-content';content.style.setProperty('--card-background',card.background);
  content.innerHTML=`<div class="card-top"><b>${card.id} / ${card.category}</b><span>题间</span></div><div class="card-main"><div><h2>${card.title}</h2><p>${card.description}</p></div><div class="card-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${card.icon}</svg></div></div><div class="card-bottom">${card.footer}</div>`;
  return content;
}
const deck=new PerspectiveCardDeck(document.querySelector('#deck'),{cards,renderCard});window.deck=deck;
let autoplay=true,autoTimer=0,meter=0,previousPhase='',lastOrder='';
const $=selector=>document.querySelector(selector);
function schedule(){clearTimeout(autoTimer);if(autoplay&&!deck.snapshot().reducedMotion)autoTimer=setTimeout(()=>deck.shuffle(),900)}
function setAuto(value){autoplay=value;$('#auto').textContent='自动循环：'+(value?'开':'关');$('#auto').setAttribute('aria-pressed',String(value));if(value)schedule();else clearTimeout(autoTimer)}
function tick(){
  const s=deck.snapshot(),phase=!s.running?'稳定堆叠':s.progress<=s.options.extraction?'从底部抽离':s.progress<.76?'放大，回弹到前方':'弹性落定';
  if(phase!==previousPhase){$('#phase').textContent=phase;previousPhase=phase;}
  if(s.order.join('')!==lastOrder){lastOrder=s.order.join('');$('#order').textContent='前 → 后：'+s.order.join(' ')}
  const pauseText=s.paused?'继续':'暂停';if($('#pause').textContent!==pauseText)$('#pause').textContent=pauseText;
  if($('.settings').open&&document.activeElement!==$('#seek')){
    const progressValue=String(Math.round(s.progress*1000)),progressText=Math.round(s.progress*100)+'%';
    if($('#seek').value!==progressValue)$('#seek').value=progressValue;
    if($('#seek-value').textContent!==progressText)$('#seek-value').textContent=progressText;
  }
  if(s.running&&!s.paused)meter=requestAnimationFrame(tick);else meter=0;
}
deck.addEventListener('change',event=>{
  const s=event.detail;$('#hint').textContent=s.queued?'已排队一次，当前卡片落定后继续。':'点击卡堆也可切换，连续点击最多排队一次。';
  if(!meter)tick();if(s.reason==='complete'&&!s.queued)schedule();
});
$('#shuffle').onclick=()=>{setAuto(false);deck.shuffle()};$('#deck').onclick=()=>{setAuto(false);deck.shuffle()};$('#auto').onclick=()=>setAuto(!autoplay);
$('#pause').onclick=()=>{setAuto(false);if(deck.snapshot().paused)deck.resume();else deck.pause()};
for(const key of ['gap','scaleStep','duration','elasticity'])$('#'+key).oninput=event=>{
  const value=Number(event.target.value),suffix=key==='gap'?' px':key==='duration'?' ms':'';$('#'+key+'-value').textContent=value+suffix;deck.configure({[key]:value});
};
$('#seek').oninput=event=>{setAuto(false);deck.seek(Number(event.target.value)/1000);$('#seek-value').textContent=(Number(event.target.value)/10).toFixed(1)+'%'};
$('#reset').onclick=()=>{setAuto(false);deck.reset()};$('#stress').onclick=()=>{setAuto(false);for(let i=0;i<12;i++)deck.shuffle()};
$('#measure').onclick=async()=>{
  setAuto(false);$('#measure').disabled=true;$('#performance').textContent='测量中…';const intervals=[];let previous=0,frame,active=true;
  const sample=now=>{if(previous)intervals.push(now-previous);previous=now;if(active)frame=requestAnimationFrame(sample)};frame=requestAnimationFrame(sample);
  if(deck.snapshot().paused)deck.resume();await deck.shuffle();await deck.shuffle();await deck.shuffle();active=false;cancelAnimationFrame(frame);
  const sorted=intervals.sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length*.5)]||0,p95=sorted[Math.floor(sorted.length*.95)]||0;
  $('#performance').textContent=`当前浏览器：中位帧间隔 ${median.toFixed(1)} ms，P95 ${p95.toFixed(1)} ms，采样 ${intervals.length} 帧。`;
  $('#measure').disabled=false;
};
if(new URLSearchParams(location.search).get('autoplay')==='0')setAuto(false);else schedule();tick();
window.demo={deck,setAuto,cards};
