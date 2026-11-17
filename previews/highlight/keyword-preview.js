(() => {
  'use strict';
  const colors = { yellow: '#efd263', blue: '#8acbfa', pink: '#e6a2c6' };
  const styles = { marker: '荧光高亮', ink: '文字变色', both: '高亮＋变色' };
  const key = 'keyword-history-v2';
  let data;
  try { data = JSON.parse(localStorage.getItem(key)); } catch {}
  const prefs = { save: false, showHistory: false, style: 'marker', color: 'yellow', ...data?.prefs };
  if (!colors[prefs.color]) prefs.color = 'yellow';
  if (!styles[prefs.style]) prefs.style = 'marker';
  let records = Array.isArray(data?.records) ? data.records.filter(validRecord) : [];
  const applied = data?.applied || {};
  let host = null, engine = null, overlay = null, surfaceKey = null, visit = [], active = null;
  let stroke = null, raf = 0, panelOpen = false, historyOpen = false, candidate = null, notice = '';
  const $ = selector => document.querySelector(selector);
  const question = () => session[index];
  const clone = value => JSON.parse(JSON.stringify(value));
  function validRecord(item) {
    return item && typeof item.id === 'string' && typeof item.questionId === 'string' && typeof item.text === 'string'
      && Number.isFinite(item.createdAt) && styles[item.style] && colors[item.color] && Array.isArray(item.strokes)
      && item.strokes.every(stroke => Number.isInteger(stroke.start) && Number.isInteger(stroke.end) && stroke.start >= 0 && stroke.end > stroke.start && stroke.end <= item.text.length);
  }
  function saveData(next = records) {
    try { localStorage.setItem(key, JSON.stringify({ prefs, records: next, applied })); records = next; return true; }
    catch { notice = '预览存储空间不足，本次内容仍留在页面中'; return false; }
  }
  function persist(item) {
    if (!item.saved) return;
    const next = records.filter(record => record.id !== item.id);
    if (item.strokes.length) next.push(clone(item));
    if (!saveData(next)) { item.saved = false; prefs.save = false; }
  }
  function demoRecords() {
    const q = question();
    if (!q) return [];
    const words = ['只能', 'MEMORY', '不正确', 'CF存储卡', 'CF 存储卡', '一般'];
    const matches = words.filter(word => q.question.includes(word));
    return [0, 1].map(i => {
      const word = matches[i] || q.question.slice(Math.min(q.question.length - 2, 3 + i * 3), Math.min(q.question.length, 7 + i * 3));
      const start = q.question.indexOf(word);
      return { id: 'demo-' + q.id + '-' + i, questionId: q.id, text: q.question, name: '演示记录 ' + (i ? 'B' : 'A'), demo: true, style: i ? 'ink' : 'marker', color: i ? 'blue' : 'yellow', strokes: [{ start, end: start + word.length }] };
    });
  }
  function history() {
    const q = question();
    return q ? [...records.filter(item => item.questionId === q.id && item.text === q.question).sort((a, b) => b.createdAt - a.createdAt), ...demoRecords()] : [];
  }
  function selectedHistory() { return history().find(item => item.id === applied[question()?.id]); }
  function appearance(style, color) {
    const hex = colors[color];
    return { bg: style === 'ink' ? 'transparent' : hex + (style === 'both' ? '26' : '45'), ink: style === 'marker' ? 'inherit' : hex };
  }
  function runs(items) {
    const map = new Array(question().question.length).fill(null);
    for (const item of items) for (const range of item.strokes) for (let i = range.start; i < range.end; i++) map[i] = { style: item.style, color: item.color, key: item.style + item.color };
    const result = [];
    for (let i = 0; i < map.length;) {
      if (!map[i]) { i++; continue; }
      const start = i, value = map[i]; while (i < map.length && map[i]?.key === value.key) i++;
      result.push({ start, end: i, ...value });
    }
    return result;
  }
  function textRange(start, end) {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node, position = 0, first, last, from, to;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('.keyword-live-layer')) continue;
      const length = node.textContent.length;
      if (!first && start >= position && start < position + length) { first = node; from = start - position; }
      if (end > position && end <= position + length) { last = node; to = end - position; break; }
      position += length;
    }
    if (!first || !last) throw Error('高亮位置与题干不匹配');
    const range = document.createRange(); range.setStart(first, from); range.setEnd(last, to); return range;
  }
  function paint() {
    if (!engine || !question()) return;
    engine.removeAll();
    const old = prefs.showHistory ? selectedHistory() : null;
    for (const item of runs(old ? [old, ...visit] : visit)) {
      const source = engine.fromRange(textRange(item.start, item.end), { selection: 'clear' }), css = appearance(item.style, item.color);
      for (const element of engine.getDoms(source.id)) { element.style.setProperty('--keyword-bg', css.bg); element.style.setProperty('--keyword-ink', css.ink); }
    }
    updateStatus();
  }
  function panelHtml() {
    const old = selectedHistory(), count = history().length;
    return `<details class="keyword-settings card" ${panelOpen ? 'open' : ''}><summary>题干高亮设置 <small>${visit.reduce((n, item) => n + item.strokes.length, 0)} 笔 · 可收起</small></summary><div class="keyword-settings-body">
      <label class="keyword-settings-row"><span>保存新高亮<small>关闭时临时使用；已保存的记录保留</small></span><input type="checkbox" data-keyword-save ${prefs.save ? 'checked' : ''} aria-label="保存新高亮"></label>
      <label class="keyword-settings-row"><span>显示历史高亮<small>${old ? `${prefs.showHistory ? '正在显示' : '已隐藏'}：${esc(old.name)}` : '可以先预览，再选择显示哪一次'}</small></span><input type="checkbox" data-keyword-history ${prefs.showHistory ? 'checked' : ''} aria-label="显示历史高亮"></label>
      <div class="keyword-settings-row"><span>高亮效果</span><div class="keyword-button-group">${Object.entries(styles).map(([id, name]) => `<button type="button" class="secondary" data-keyword-style="${id}" aria-pressed="${prefs.style === id}">${name}</button>`).join('')}</div></div>
      <div class="keyword-settings-row"><span>颜色</span><div class="keyword-colors">${Object.entries(colors).map(([id, color]) => `<button type="button" class="keyword-color" style="--keyword-color:${color}" data-keyword-color="${id}" aria-pressed="${prefs.color === id}" aria-label="${({yellow:'暖黄',blue:'浅蓝',pink:'浅粉'})[id]}"></button>`).join('')}</div></div>
      <div class="keyword-settings-row"><span>本次高亮</span><div class="keyword-button-group"><button type="button" class="secondary" data-keyword-undo ${visit.some(item => item.strokes.length) ? '' : 'disabled'}>撤销一笔</button><button type="button" class="secondary" data-keyword-new>新建一次</button><button type="button" class="secondary" data-keyword-clear ${visit.some(item => item.strokes.length) ? '' : 'disabled'}>清除本次</button></div></div>
      <div class="keyword-settings-row"><span>历史记录<small>${count} 份（含明确标注的演示记录）</small></span><button type="button" class="secondary" data-keyword-choose>${historyOpen ? '收起历史' : '选择哪次高亮'}</button></div>
      ${historyOpen ? historyHtml() : ''}<p class="keyword-current-status" role="status">${esc(notice || (prefs.save ? '接下来新划的内容会保存到本机预览记录' : '本次临时高亮在换题或刷新后清除'))}</p><p class="keyword-help">直接在题干上横向划选，上下滑动仍然翻页。此预览仅使用独立本机数据，不会写入正式答题记录。</p>
    </div></details>`;
  }
  function historyHtml() {
    const items = history(), selected = items.find(item => item.id === candidate);
    let html = esc(question().question), cursor = 0;
    if (selected) {
      html = '';
      for (const range of runs([selected])) {
        const css = appearance(range.style, range.color);
        html += esc(question().question.slice(cursor, range.start)) + `<mark style="--keyword-bg:${css.bg};--keyword-ink:${css.ink}">${esc(question().question.slice(range.start, range.end))}</mark>`; cursor = range.end;
      }
      html += esc(question().question.slice(cursor));
    }
    return `<div class="keyword-history-list">${items.map(item => `<button type="button" class="keyword-history-row" data-keyword-record="${esc(item.id)}" aria-pressed="${item.id === candidate}"><strong>${esc(item.name)} · ${item.strokes.length} 笔</strong><small>${item.demo ? '示例数据，不是你的真实记录' : new Intl.DateTimeFormat('zh-CN', { month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit' }).format(new Date(item.createdAt))} · ${item.id === candidate ? '预览中' : '点此预览'}</small></button>`).join('')}</div><div class="keyword-history-preview">${html}</div><div class="keyword-history-actions"><button type="button" class="secondary" data-keyword-cancel>暂不更换</button><button type="button" class="primary" data-keyword-apply ${selected ? '' : 'disabled'}>显示这次高亮</button></div>`;
  }
  function updatePanel() {
    const parent = document.querySelector('.practice-layout .practice-content');
    if (!parent) return;
    parent.querySelector('.keyword-settings')?.remove();
    parent.insertAdjacentHTML('beforeend', panelHtml());
    const panel = parent.querySelector('.keyword-settings');
    panel.addEventListener('toggle', () => { if (panel.isConnected) panelOpen = panel.open; });
    const on = (selector, handler) => panel.querySelector(selector)?.addEventListener('click', handler);
    panel.querySelector('[data-keyword-save]').onchange = event => { prefs.save = event.target.checked; active = null; notice = prefs.save ? '后续新高亮将保存为一份新记录' : '后续新高亮临时使用，已有记录保留'; saveData(); updatePanel(); };
    panel.querySelector('[data-keyword-history]').onchange = event => {
      if (event.target.checked && !selectedHistory()) { historyOpen = true; candidate = history()[0]?.id; notice = '请先预览并选择一份历史记录'; updatePanel(); return; }
      prefs.showHistory = event.target.checked; saveData(); paint(); updatePanel();
    };
    panel.querySelectorAll('[data-keyword-style]').forEach(button => button.onclick = () => { prefs.style = button.dataset.keywordStyle; if (active) { active.style = prefs.style; persist(active); } saveData(); paint(); updatePanel(); });
    panel.querySelectorAll('[data-keyword-color]').forEach(button => button.onclick = () => { prefs.color = button.dataset.keywordColor; if (active) { active.color = prefs.color; persist(active); } saveData(); paint(); updatePanel(); });
    on('[data-keyword-undo]', () => { const item = [...visit].reverse().find(item => item.strokes.length); if (!item) return; item.strokes.pop(); persist(item); paint(); updatePanel(); });
    on('[data-keyword-clear]', () => { for (const item of visit) { item.strokes = []; persist(item); } visit = []; active = null; paint(); updatePanel(); });
    on('[data-keyword-new]', () => { visit = []; active = null; notice = '已开始新一次高亮，已保存记录仍在历史列表'; paint(); updatePanel(); });
    on('[data-keyword-choose]', () => { historyOpen = !historyOpen; candidate = selectedHistory()?.id || history()[0]?.id; updatePanel(); });
    panel.querySelectorAll('[data-keyword-record]').forEach(button => button.onclick = () => { candidate = button.dataset.keywordRecord; updatePanel(); });
    on('[data-keyword-cancel]', () => { historyOpen = false; updatePanel(); });
    on('[data-keyword-apply]', () => { const item = history().find(item => item.id === candidate); if (!item) return; applied[question().id] = item.id; prefs.showHistory = true; historyOpen = false; notice = '正在显示：' + item.name; saveData(); paint(); updatePanel(); });
  }
  function updateStatus() {
    const summary = $('.keyword-settings>summary>small');
    if (summary) summary.textContent = visit.reduce((n, item) => n + item.strokes.length, 0) + ' 笔 · 可收起';
  }
  function cancel() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    if (stroke && host?.hasPointerCapture?.(stroke.id)) host.releasePointerCapture(stroke.id);
    stroke = null; overlay?.replaceChildren();
  }
  function layout() {
    const text = question().question;
    const parts = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('zh', { granularity:'grapheme' }).segment(text)].map(item => ({ start:item.index,end:item.index + item.segment.length })) : (() => { let at=0; return [...text].map(char => { const start=at;at+=char.length;return {start,end:at}; }); })();
    return parts.map(part => ({ ...part, rect: textRange(part.start, part.end).getBoundingClientRect() }));
  }
  function nearest(point, cells, strict = false) {
    let best = -1, distance = Infinity;
    cells.forEach((cell, i) => { const r = cell.rect, dx=Math.max(r.left-point.x,0,point.x-r.right),dy=Math.max(r.top-point.y,0,point.y-r.bottom), d=dx*dx+dy*dy; if (d < distance) {best=i;distance=d;} });
    return strict && distance > 64 ? -1 : best;
  }
  function drawLive() {
    raf = 0; if (!stroke?.active || !overlay) return;
    const end = nearest(stroke.point, stroke.cells), first = Math.min(stroke.first,end), last = Math.max(stroke.first,end);
    stroke.range = { start:stroke.cells[first].start,end:stroke.cells[last].end };
    const origin = host.getBoundingClientRect(), fragment = document.createDocumentFragment();
    for(let i=first;i<=last;i++) {
      const r=stroke.cells[i].rect,rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
      rect.setAttribute('x',r.left-origin.left);rect.setAttribute('y',r.top-origin.top);rect.setAttribute('width',r.width);rect.setAttribute('height',r.height);rect.setAttribute('rx','2');rect.setAttribute('fill',colors[prefs.color]+'55');fragment.append(rect);
    }
    overlay.replaceChildren(fragment);
  }
  function commit(range) {
    if (!active) {
      const number = records.filter(item => item.questionId === question().id).reduce((n,item)=>Math.max(n,item.number||0),0)+1;
      active = { id:crypto.randomUUID(),questionId:question().id,text:question().question,name:prefs.save?`第 ${number} 次高亮`:'本次临时高亮',number,createdAt:Date.now(),style:prefs.style,color:prefs.color,saved:prefs.save,strokes:[] };visit.push(active);
    }
    active.strokes.push(range);persist(active);notice='';paint();updatePanel();
  }
  function bind() {
    const next = document.querySelector('.question-scene:not(.question-scene-ghost)>.question');
    if (view !== 'practice' || !next || !question()) { cancel(); engine?.dispose(); engine=null;host=null;surfaceKey=null;visit=[];active=null;return; }
    if (next === host) return;
    cancel();engine?.dispose();host=next;
    const nextKey = currentSession.id + ':' + index + ':' + question().id;
    if (nextKey !== surfaceKey) { surfaceKey=nextKey;visit=[];active=null;historyOpen=false;notice='';panelOpen=false; }
    host.classList.add('keyword-surface');
    overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');overlay.classList.add('keyword-live-layer');overlay.setAttribute('aria-hidden','true');host.append(overlay);
    engine=new Highlighter({$root:host,wrapTag:'mark',style:{className:'keyword-highlight'}});paint();updatePanel();
    host.addEventListener('pointerdown',event=>{
      if (!event.isPrimary||event.button!==0||event.clientX<=28||event.clientX>=innerWidth-28) return;
      cancel();const cells=layout(),point={x:event.clientX,y:event.clientY},first=nearest(point,cells,true);if(first<0)return;
      stroke={id:event.pointerId,kind:event.pointerType,start:point,point,cells,first,active:false,range:null};
    });
    host.addEventListener('pointermove',event=>{
      if(!stroke||stroke.id!==event.pointerId)return;
      if(event.pointerType==='mouse'&&event.buttons===0){cancel();return;}
      const point={x:event.clientX,y:event.clientY},dx=Math.abs(point.x-stroke.start.x),dy=Math.abs(point.y-stroke.start.y);
      if(!stroke.active){if(stroke.kind==='touch'&&dy>9&&dy>dx*1.1){cancel();return;}if(dx<(stroke.kind==='touch'?9:3)||stroke.kind==='touch'&&dx<dy*1.15)return;stroke.active=true;host.setPointerCapture(event.pointerId);}
      if(event.cancelable)event.preventDefault();stroke.point=point;if(!raf)raf=requestAnimationFrame(drawLive);
    },{passive:false});
    host.addEventListener('pointerup',event=>{if(!stroke||stroke.id!==event.pointerId)return;if(stroke.active){stroke.point={x:event.clientX,y:event.clientY};drawLive();const range=stroke.range;cancel();if(range)commit(range);}else cancel();});
    host.addEventListener('pointercancel',cancel);host.addEventListener('contextmenu',event=>event.preventDefault());
  }
  document.addEventListener('pointerdown',event=>{if(stroke&&event.pointerId!==stroke.id)cancel();},true);
  document.addEventListener('pointerup',event=>{if(stroke&&!stroke.active&&!host?.contains(event.target))cancel();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});window.addEventListener('resize',cancel);window.addEventListener('blur',cancel);document.fonts?.addEventListener('loadingdone',cancel);
  const originalRender = render;
  render = function() { const result = originalRender();bind();return result; };
  start('exam');
  const sample=bank().find(item=>item.question.includes('MEMORY')&&item.question.includes('CF'));
  if(sample&&session.length){let position=session.findIndex(item=>item.id===sample.id);if(position<0){position=session.findIndex(item=>item.type===sample.type);session[position]=sample;}[session[0],session[position]]=[session[position],session[0]];currentSession.questionIds=session.map(item=>item.id);persistSession();render();}
})();
