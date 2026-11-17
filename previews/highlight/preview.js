(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const colors = { yellow: '#f3d45c', blue: '#80ccfa', pink: '#e9a3ca' };
  const styleNames = { marker: '荧光底纹', ink: '文字变色', both: '底纹＋文字变色' };
  const questions = [
    { id: 'preview-fanuc', type: '判断题', text: '在 FANUC 系统中，MEMORY 工作方式一般只能执行存储在 CF 存储卡中的程序。', options: ['正确', '错误'], tip: '在“只能”“CF 存储卡”上划一下试试' },
    { id: 'preview-reading', type: '审题练习', text: '下列说法中，“不正确”与“正确”分别对应不同要求。遇到“不正确”的提问时，应选择错误的选项。', options: ['选择错误的选项', '选择正确的选项'], tip: '试试只划第二处“不正确”，再切换历史对照' }
  ];
  const root = $('#question-text');
  let profile = 'local';
  try { profile = JSON.parse(localStorage.getItem('tijian-active-profile'))?.id || profile; } catch {}
  const key = 'tijian-highlight-preview-v1-' + profile;
  let stored;
  try { stored = JSON.parse(localStorage.getItem(key)); } catch {}
  const prefs = { style: 'marker', color: 'yellow', save: false, showHistory: false, ...stored?.prefs };
  if (!colors[prefs.color]) prefs.color = 'yellow';
  if (!styleNames[prefs.style]) prefs.style = 'marker';
  let catalog = Array.isArray(stored?.records) ? stored.records.filter(validRecord) : [];
  const applied = stored?.applied && typeof stored.applied === 'object' ? stored.applied : {};
  let questionIndex = 0, layers = [], activeLayer = null, engine = null, glyphs = [];
  let stroke = null, frame = 0, candidateId = null, toastTimer;
  const cursor = $('#brush-cursor');
  const q = () => questions[questionIndex];
  const clone = value => JSON.parse(JSON.stringify(value));
  const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  function validRecord(record) {
    return record && typeof record.id === 'string' && typeof record.questionId === 'string'
      && typeof record.questionText === 'string' && Array.isArray(record.strokes)
      && record.strokes.length <= 300 && styleNames[record.style] && colors[record.color]
      && record.strokes.every(item => Array.isArray(item.ranges) && item.ranges.every(range => Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start && range.end <= record.questionText.length));
  }
  function toast(message) {
    $('#toast').textContent = message; $('#toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 1900);
  }
  function saveStorage(nextCatalog = catalog) {
    try { localStorage.setItem(key, JSON.stringify({ prefs, records: nextCatalog, applied })); catalog = nextCatalog; return true; }
    catch { toast('未能保存到浏览器，本次圈画仍在页面中'); return false; }
  }
  function persistLayer(layer) {
    if (!layer.saved) return;
    const next = catalog.filter(record => record.id !== layer.id);
    if (layer.strokes.length) next.push(clone(layer));
    if (!saveStorage(next)) { layer.saved = false; prefs.save = false; }
  }
  function rangesOf(record) { return record.strokes.flatMap(item => item.ranges); }
  function sampleRange(text, word, last = false) {
    const start = last ? text.lastIndexOf(word) : text.indexOf(word);
    return { start, end: start + word.length };
  }
  function demoRecords() {
    const text = q().text;
    const phrases = questionIndex === 0 ? [['一般只能', 'CF 存储卡'], ['MEMORY', '存储在 CF 存储卡中的程序']] : [['不正确', '错误的选项'], ['不正确', '正确']];
    return phrases.map((words, i) => ({
      id: q().id + '-demo-' + i, questionId: q().id, questionText: text,
      name: `演示记录 ${i === 0 ? 'A' : 'B'}`, demo: true, style: i ? 'ink' : 'marker', color: i ? 'blue' : 'yellow',
      strokes: words.map((word, n) => ({ ranges: [sampleRange(text, word, questionIndex === 1 && (i === 1 || n === 1))] }))
    }));
  }
  function records() { return [...catalog.filter(record => record.questionId === q().id && record.questionText === q().text).sort((a, b) => b.createdAt - a.createdAt), ...demoRecords()]; }
  function currentHistory() { return records().find(record => record.id === applied[q().id]); }
  function appearance(style, color) {
    const hex = colors[color] || colors.yellow;
    return { bg: style === 'ink' ? 'transparent' : hex + (style === 'both' ? '26' : '45'), ink: style === 'marker' ? '#f4f5f7' : hex };
  }
  function visualMap(recordList) {
    const map = new Array(q().text.length).fill(null);
    for (const record of recordList) for (const range of rangesOf(record)) {
      const value = { style: record.style, color: record.color, signature: record.style + ':' + record.color };
      for (let i = range.start; i < range.end; i++) map[i] = value;
    }
    return map;
  }
  function groups(map) {
    const result = [];
    for (let i = 0; i < map.length;) {
      if (!map[i]) { i++; continue; }
      const start = i, value = map[i];
      while (i < map.length && map[i]?.signature === value.signature) i++;
      result.push({ start, end: i, ...value });
    }
    return result;
  }
  function rangeFromOffsets(start, end) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node, position = 0, startNode, endNode, startOffset, endOffset;
    while ((node = walker.nextNode())) {
      const length = node.textContent.length;
      if (!startNode && start >= position && start < position + length) { startNode = node; startOffset = start - position; }
      if (end > position && end <= position + length) { endNode = node; endOffset = end - position; break; }
      position += length;
    }
    if (!startNode || !endNode) throw Error('圈画位置超出题干');
    const range = document.createRange(); range.setStart(startNode, startOffset); range.setEnd(endNode, endOffset); return range;
  }
  function paint() {
    if (!engine) return;
    engine.removeAll();
    const history = prefs.showHistory ? currentHistory() : null;
    const visible = history ? [history, ...layers] : layers;
    for (const group of groups(visualMap(visible))) {
      const source = engine.fromRange(rangeFromOffsets(group.start, group.end), { selection: 'clear' });
      const css = appearance(group.style, group.color);
      for (const element of engine.getDoms(source.id)) {
        element.style.setProperty('--h-bg', css.bg); element.style.setProperty('--h-ink', css.ink);
        element.dataset.previewStyle = group.style;
      }
    }
    syncControls();
  }
  function syncControls() {
    if (prefs.showHistory && !currentHistory()) prefs.showHistory = false;
    document.querySelectorAll('[data-style]').forEach(button => { const selected = button.dataset.style === prefs.style; button.classList.toggle('selected', selected); button.setAttribute('aria-checked', String(selected)); });
    document.querySelectorAll('[data-color]').forEach(button => { const selected = button.dataset.color === prefs.color; button.classList.toggle('selected', selected); button.setAttribute('aria-checked', String(selected)); });
    $('#save-marks').checked = prefs.save; $('#show-history').checked = prefs.showHistory;
    $('#save-description').textContent = prefs.save ? '开启：本次新圈画自动保存为一份记录' : '关闭：新圈画临时使用，不写入历史';
    const historical = currentHistory();
    $('#history-description').textContent = historical ? `${prefs.showHistory ? '正在显示' : '已隐藏'}：${historical.name}` : '关闭只隐藏，先选一份历史记录再显示';
    $('#history-count').textContent = records().length;
    $('#history-entry-label').textContent = historical ? `已选择 ${historical.name} · 可预览其他记录` : `${records().length} 份记录（含演示）· 先预览，再显示`;
    const strokes = layers.reduce((sum, layer) => sum + layer.strokes.length, 0);
    $('#undo-stroke').disabled = !strokes; $('#clear-current').disabled = !strokes;
    $('#live-status').textContent = strokes ? `本次共 ${strokes} 笔 · ${layers.some(layer => !layer.saved && layer.strokes.length) ? '含临时圈画' : '已保存到本机预览历史'}` : q().tip;
    root.dataset.liveStyle = prefs.style;
    root.style.setProperty('--swatch', colors[prefs.color]); root.style.setProperty('--mark-bg', colors[prefs.color] + '45');
    cursor.style.borderColor = colors[prefs.color] + '88'; cursor.style.background = colors[prefs.color] + '18';
  }
  function renderQuestion() {
    cancelStroke(); engine?.dispose(); layers = []; activeLayer = null;
    root.replaceChildren(); glyphs = [];
    const segments = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(q().text)].map(item => ({ text: item.segment, start: item.index })) : (() => { let index = 0; return [...q().text].map(text => { const result = { text, start: index }; index += text.length; return result; }); })();
    const fragment = document.createDocumentFragment();
    for (const part of segments) {
      const span = document.createElement('span'); span.className = 'hl-char'; span.textContent = part.text; span.dataset.start = part.start; span.dataset.end = part.start + part.text.length;
      glyphs.push({ start: part.start, end: part.start + part.text.length, span }); fragment.append(span);
    }
    root.append(fragment);
    engine = new Highlighter({ $root: root, wrapTag: 'mark', style: { className: 'quiz-highlight' } });
    $('#question-type').textContent = q().type; $('#question-category').textContent = '演示题目 · ' + q().type;
    $('#question-number').textContent = String(questionIndex + 1).padStart(2, '0') + ' / 02';
    $('#answer-options').innerHTML = q().options.map((text, i) => `<button class="answer-option" data-answer="${i}"><span>${q().options.length === 2 && questionIndex === 0 ? ['✓', '×'][i] : 'ABCD'[i]}</span>${escape(text)}</button>`).join('');
    $('#answer-response').textContent = '';
    document.querySelectorAll('[data-answer]').forEach(button => button.onclick = () => { document.querySelectorAll('[data-answer]').forEach(item => item.classList.toggle('chosen', item === button)); $('#answer-response').textContent = `已选择：${q().options[Number(button.dataset.answer)]} · 圈画仍然保留`; });
    $('#previous-question').disabled = questionIndex === 0; $('#next-question').textContent = questionIndex === 0 ? '下一题 →' : '回到第 1 题 →';
    if (!currentHistory()) prefs.showHistory = false;
    paint();
  }
  function newLayer() {
    const number = catalog.filter(record => record.questionId === q().id).reduce((max, item) => Math.max(max, item.number || 0), 0) + 1;
    const layer = { id: crypto.randomUUID(), questionId: q().id, questionText: q().text, name: prefs.save ? `第 ${number} 次圈画` : '本次临时圈画', number, createdAt: Date.now(), saved: prefs.save, style: prefs.style, color: prefs.color, strokes: [] };
    layers.push(layer); activeLayer = layer; return layer;
  }
  function commitStroke(indices) {
    const selected = [...indices].sort((a, b) => a - b), ranges = [];
    for (const index of selected) {
      const glyph = glyphs[index], last = ranges.at(-1);
      if (last && glyph.start === last.end) last.end = glyph.end;
      else ranges.push({ start: glyph.start, end: glyph.end });
    }
    if (!ranges.length) return;
    const layer = activeLayer || newLayer(); layer.strokes.push({ ranges }); layer.updatedAt = Date.now(); persistLayer(layer); paint();
  }
  function intersects(a, b, rect) {
    let low = 0, high = 1;
    for (const axis of ['x', 'y']) {
      const min = (axis === 'x' ? rect.left : rect.top) - 3, max = (axis === 'x' ? rect.right : rect.bottom) + 3;
      const delta = b[axis] - a[axis];
      if (Math.abs(delta) < .001) { if (a[axis] < min || a[axis] > max) return false; }
      else { const one = (min - a[axis]) / delta, two = (max - a[axis]) / delta; low = Math.max(low, Math.min(one, two)); high = Math.min(high, Math.max(one, two)); if (low > high) return false; }
    }
    return true;
  }
  function flushStroke() {
    if (!stroke?.active) return;
    for (const point of stroke.queue.splice(0)) {
      for (let i = 0; i < stroke.rects.length; i++) {
        if (stroke.selected.has(i) || !intersects(stroke.last, point, stroke.rects[i])) continue;
        stroke.selected.add(i); glyphs[i].span.classList.add('is-swept');
      }
      stroke.last = point;
    }
  }
  function tick() { frame = 0; flushStroke(); }
  function cancelStroke() {
    if (frame) cancelAnimationFrame(frame); frame = 0;
    if (stroke && root.hasPointerCapture?.(stroke.id)) root.releasePointerCapture(stroke.id);
    stroke = null; cursor.hidden = true;
    root.querySelectorAll('.is-swept').forEach(span => span.classList.remove('is-swept'));
  }
  root.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.clientX <= 24 || event.clientX >= innerWidth - 24) return;
    cancelStroke();
    stroke = { id: event.pointerId, kind: event.pointerType, start: { x: event.clientX, y: event.clientY }, last: { x: event.clientX, y: event.clientY }, queue: [], selected: new Set(), active: false, rects: glyphs.map(item => item.span.getBoundingClientRect()) };
  });
  root.addEventListener('pointermove', event => {
    if (!stroke || stroke.id !== event.pointerId) return;
    if (event.pointerType === 'mouse' && event.buttons === 0) { cancelStroke(); return; }
    const point = { x: event.clientX, y: event.clientY }, dx = Math.abs(point.x - stroke.start.x), dy = Math.abs(point.y - stroke.start.y);
    if (!stroke.active) {
      if (stroke.kind === 'touch' && dy > 9 && dy > dx * 1.1) { cancelStroke(); return; }
      if (dx < (stroke.kind === 'touch' ? 9 : 3) || stroke.kind === 'touch' && dx < dy * 1.15) return;
      stroke.active = true; root.setPointerCapture(event.pointerId);
    }
    if (event.cancelable) event.preventDefault();
    stroke.queue.push(point); cursor.hidden = false; cursor.style.left = point.x + 'px'; cursor.style.top = point.y + 'px';
    if (!frame) frame = requestAnimationFrame(tick);
  }, { passive: false });
  root.addEventListener('pointerup', event => {
    if (!stroke || stroke.id !== event.pointerId) return;
    if (stroke.active) { stroke.queue.push({ x: event.clientX, y: event.clientY }); flushStroke(); const selected = stroke.selected; cancelStroke(); commitStroke(selected); }
    else cancelStroke();
  });
  root.addEventListener('pointercancel', cancelStroke);
  root.addEventListener('contextmenu', event => event.preventDefault());
  document.addEventListener('pointerdown', event => { if (stroke && event.pointerId !== stroke.id) cancelStroke(); }, true);
  document.addEventListener('pointerup', event => { if (stroke && !stroke.active && !root.contains(event.target)) cancelStroke(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelStroke(); });
  window.addEventListener('resize', cancelStroke);
  window.addEventListener('blur', cancelStroke);
  document.fonts?.addEventListener('loadingdone', cancelStroke);
  window.addEventListener('scroll', () => { if (stroke && !stroke.active) cancelStroke(); }, { passive: true });

  document.querySelectorAll('[data-style]').forEach(button => button.onclick = () => { cancelStroke(); prefs.style = button.dataset.style; if (activeLayer) { activeLayer.style = prefs.style; persistLayer(activeLayer); } saveStorage(); paint(); });
  document.querySelectorAll('[data-color]').forEach(button => button.onclick = () => { cancelStroke(); prefs.color = button.dataset.color; if (activeLayer) { activeLayer.color = prefs.color; persistLayer(activeLayer); } saveStorage(); paint(); });
  $('#save-marks').onchange = event => { cancelStroke(); prefs.save = event.target.checked; activeLayer = null; saveStorage(); syncControls(); toast(prefs.save ? '之后新划的内容会保存为一份新记录' : '之后新划的内容临时使用，已有记录保留'); };
  $('#show-history').onchange = event => { cancelStroke(); if (event.target.checked && !currentHistory()) { event.target.checked = false; openHistory(); return; } prefs.showHistory = event.target.checked; saveStorage(); paint(); };
  $('#new-pass').onclick = () => { cancelStroke(); layers = []; activeLayer = null; paint(); toast(prefs.save ? '已开始新一次圈画，上一份记录仍在历史中' : '已开始新一次临时圈画'); };
  $('#undo-stroke').onclick = () => { cancelStroke(); const layer = [...layers].reverse().find(item => item.strokes.length); if (!layer) return; layer.strokes.pop(); persistLayer(layer); paint(); };
  $('#clear-current').onclick = () => { cancelStroke(); for (const layer of layers) { layer.strokes = []; persistLayer(layer); } layers = []; activeLayer = null; paint(); toast('本次圈画已清除，其他历史记录保留'); };
  $('#previous-question').onclick = () => { questionIndex = Math.max(0, questionIndex - 1); renderQuestion(); };
  $('#next-question').onclick = () => { questionIndex = questionIndex === 0 ? 1 : 0; renderQuestion(); };

  function previewHtml(record) {
    if (!record) return escape(q().text);
    const map = visualMap([record]);
    let html = '', position = 0;
    for (const group of groups(map)) { const css = appearance(group.style, group.color); html += escape(q().text.slice(position, group.start)) + `<mark style="--h-bg:${css.bg};--h-ink:${css.ink}">${escape(q().text.slice(group.start, group.end))}</mark>`; position = group.end; }
    return html + escape(q().text.slice(position));
  }
  function recordTime(record) { return record.demo ? '示例数据 · 不是你的真实记录' : new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(record.createdAt)) + ' · 本机预览'; }
  function renderHistory() {
    const list = records(), selected = list.find(record => record.id === candidateId);
    $('#history-list').innerHTML = list.map(record => {
      const chips = [...new Set(rangesOf(record).map(range => q().text.slice(range.start, range.end)))].slice(0, 3);
      return `<button class="history-record ${record.id === candidateId ? 'selected' : ''}" data-record-id="${escape(record.id)}" aria-pressed="${record.id === candidateId}"><span class="record-radio" aria-hidden="true"></span><span class="record-text"><strong>${escape(record.name)}</strong><small>${recordTime(record)} · ${record.strokes.length} 笔</small><span class="record-chip-line">${chips.map(text => `<span class="record-chip">${escape(text)}</span>`).join('')}</span></span><span class="record-check">${record.id === candidateId ? '预览中' : '预览'}</span></button>`;
    }).join('');
    document.querySelectorAll('[data-record-id]').forEach(button => button.onclick = () => { candidateId = button.dataset.recordId; renderHistory(); });
    $('#preview-record-name').textContent = selected?.name || '请选择一份记录'; $('#history-preview-text').innerHTML = previewHtml(selected);
    $('#record-summary').innerHTML = selected ? `<b>${styleNames[selected.style]}</b> · ${selected.strokes.length} 笔<br>这是预览，点击“显示这次圈画”后才会应用。` : '请选择一份记录，再查看效果。';
    $('#apply-history').disabled = !selected;
  }
  function openHistory() { cancelStroke(); candidateId = currentHistory()?.id || records()[0]?.id || null; renderHistory(); $('#history-dialog').showModal(); }
  $('#open-history').onclick = openHistory;
  $('#close-history').onclick = $('#cancel-history').onclick = () => $('#history-dialog').close();
  $('#history-dialog').addEventListener('click', event => { if (event.target === $('#history-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
  $('#apply-history').onclick = () => { const record = records().find(item => item.id === candidateId); if (!record) return; applied[q().id] = record.id; prefs.showHistory = true; saveStorage(); paint(); $('#history-dialog').close(); toast('正在显示：' + record.name); };

  if (typeof Highlighter !== 'function') { $('#live-status').textContent = '圈画组件未加载，请联网刷新一次'; return; }
  renderQuestion();
})();
