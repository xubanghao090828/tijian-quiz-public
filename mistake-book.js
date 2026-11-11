const MISTAKE_MODES = [
  ['exam', '随机模拟'], ['sequential', '整库顺序刷'], ['order', '专项顺序'],
  ['random', '随机练习'], ['targeted', '薄弱强化'], ['wrong', '错题复习'], ['legacy', '历史未分类']
];
let mistakeModeFilter = 'all';

function emptyMistakeGroups() {
  return Object.fromEntries(MISTAKE_MODES.map(([value]) => [value, Object.create(null)]));
}

function refreshMistakeTotals() {
  const mistakes = new Set();
  const marked = new Set();
  for (const group of Object.values(state.mistakeGroups)) {
    for (const [id, item] of Object.entries(group)) {
      mistakes.add(id);
      if (item.marked) marked.add(id);
    }
  }
  state.mistakes = Object.fromEntries([...mistakes].map(id => [id, true]));
  state.marked = Object.fromEntries([...marked].map(id => [id, true]));
}

function historicalMistakeSources() {
  const sources = new Map();
  const questions = new Map(bank().map(question => [question.id, question]));
  for (const record of state.sessions) {
    if (!MISTAKE_MODES.some(([value]) => value === record.mode)) continue;
    const marked = new Set(record.markedQuestionIds || []);
    record.questionIds.forEach((id, i) => {
      const question = questions.get(id);
      const wrong = question && Number.isInteger(record.answers[i]) && record.answers[i] !== question.answer;
      if (!wrong && !marked.has(id)) return;
      const entries = sources.get(id) || [];
      entries.push({ mode: record.mode, from: record.createdAt, to: record.updatedAt });
      sources.set(id, entries);
    });
  }
  return sources;
}

function initializeMistakeGroups() {
  const saved = state.mistakeGroups;
  const groups = emptyMistakeGroups();
  if (saved && typeof saved === 'object') {
    for (const [mode] of MISTAKE_MODES) {
      for (const [id, item] of Object.entries(saved[mode] || {})) {
        groups[mode][id] = { marked: Boolean(item?.marked) };
      }
    }
  } else {
    const sources = historicalMistakeSources();
    for (const id of Object.keys(state.mistakes)) {
      const modes = new Set((sources.get(id) || []).map(item => item.mode));
      if (!modes.size) modes.add('legacy');
      for (const mode of modes) groups[mode][id] = { marked: Boolean(state.marked[id]) };
    }
  }
  state.mistakeGroups = groups;
  refreshMistakeTotals();
}

function rebuildMistakeGroups(events) {
  const groups = emptyMistakeGroups();
  const sources = historicalMistakeSources();
  for (const event of events) {
    if (!event.mistakeAction) continue;
    const id = event.questionId;
    let scope = event.mistakeMode;
    if (event.mistakeAction === 'add') {
      if (!MISTAKE_MODES.some(([value]) => value === scope)) {
        const history = (sources.get(id) || [])
          .filter(item => item.from <= event.createdAt && item.to + 1500 >= event.createdAt)
          .sort((a, b) => b.from - a.from);
        scope = history[0]?.mode || 'legacy';
      }
      const marked = Boolean(groups[scope][id]?.marked)
        || (event.kind === 'seed' && event.total === 0);
      groups[scope][id] = { marked };
    } else if (MISTAKE_MODES.some(([value]) => value === scope)) {
      delete groups[scope][id];
    } else {
      for (const group of Object.values(groups)) delete group[id];
    }
  }
  state.mistakeGroups = groups;
  refreshMistakeTotals();
}

function mistakeSources(id) {
  return MISTAKE_MODES.filter(([value]) => state.mistakeGroups[value][id]);
}

function mistakeQuestions(scope = 'all') {
  return bank().filter(question => scope === 'all'
    ? state.mistakes[question.id] : state.mistakeGroups[scope]?.[question.id]);
}

function isMistakeMarked(id, scope) {
  return Boolean(state.mistakeGroups[scope]?.[id]?.marked);
}

function addMistake(id, scope, marked = false) {
  const group = state.mistakeGroups[scope] || state.mistakeGroups.legacy;
  group[id] = { marked: marked || Boolean(group[id]?.marked) };
  refreshMistakeTotals();
}

function removeMistake(id, scope) {
  const candidates = scope === 'all' ? Object.values(state.mistakeGroups) : [state.mistakeGroups[scope]];
  for (const group of candidates) if (group) delete group[id];
  refreshMistakeTotals();
  save();
  window.TijianSync?.record(id, 'remove', 0, 0, 'remove', scope);
  mistakeDetailId = null;
  render();
}

function mistakeSourceBadges(id) {
  return `<span class="mistake-source-badges">${mistakeSources(id).map(([, label]) => `<span>${label}</span>`).join('')}</span>`;
}

function mistakes() {
  const all = mistakeQuestions(mistakeModeFilter);
  const label = mistakeModeFilter === 'all' ? '全部模式'
    : MISTAKE_MODES.find(([value]) => value === mistakeModeFilter)[1];
  const removeLabel = mistakeModeFilter === 'all' ? '移出全部' : '移出本组';
  if (mistakeDetailId) {
    const question = all.find(item => item.id === mistakeDetailId);
    if (question) return `<div class="detail-head"><button class="secondary" data-mistake-back>← 返回${label}</button>
      <span>${esc(question.category || '未分类')}</span></div><div class="card panel review-detail">
      ${mistakeSourceBadges(question.id)}${memoryDetailHtml(question.id)}<h2>${esc(question.question)}</h2>${questionReview(question, null)}
      <button class="secondary" data-remove="${esc(question.id)}">${removeLabel}</button></div>`;
    mistakeDetailId = null;
  }
  const query = mistakeSearchQuery.trim().toLowerCase();
  const shown = filterMemoryQuestions(all).filter(question => !query || [question.question, ...question.options, question.category]
    .some(value => String(value || '').toLowerCase().includes(query)));
  const tabs = [['all', '全部模式'], ...MISTAKE_MODES].map(([value, name]) => `
    <button class="pill ${value === mistakeModeFilter ? 'selected' : ''}" data-mistake-mode="${value}"
      aria-pressed="${value === mistakeModeFilter}">${name} <b>${mistakeQuestions(value).length}</b></button>`).join('');
  return `<div class="hero"><div><div class="eyebrow">REVIEW / ARCHIVE</div><h1>错题本</h1>
    <p>错题持续保留，按记忆计划安排复习，也可以按来源模式分别查看。</p></div></div>
    <section class="card panel mistake-mode-panel"><h2>来源模式</h2><div class="mistake-mode-tabs" role="group" aria-label="错题来源模式">${tabs}</div></section>
    ${memoryDashboardHtml(mistakeModeFilter)}
    <div class="mistake-toolbar card panel"><div><strong>${label} · ${all.length} 道保留题目</strong>
      <span>标记不会 ${all.filter(question => mistakeModeFilter === 'all' ? state.marked[question.id] : isMistakeMarked(question.id, mistakeModeFilter)).length} 道</span></div>
</div>
    ${mistakeModeFilter === 'legacy' ? '<p class="muted">这些旧记录没有足够信息确定来源，已保留在这里。</p>' : ''}
    <form class="mistake-search-form card panel"><label for="mistake-search">搜索${label}的错题</label>
      <div><input id="mistake-search" name="query" type="search" value="${esc(mistakeSearchQuery)}" placeholder="题干、选项或知识点" autocomplete="off">
      <button class="primary" type="submit">搜索</button></div></form>
    ${shown.length ? `<div class="mistake-results">${shown.map((question, i) => `
      <div class="card mistake-row"><button class="mistake-open" data-mistake-detail="${esc(question.id)}">
        <span class="mistake-index">${String(i + 1).padStart(2, '0')}</span><span>
          <small>${esc(question.category || '未分类')} · ${esc(question.type || '单选题')}</small>
          <strong>${esc(question.question)}</strong>${mistakeSourceBadges(question.id)}${memoryRowHtml(question.id)}</span><b>›</b></button>
        <button class="mistake-remove" data-remove="${esc(question.id)}">${removeLabel}</button></div>`).join('')}</div>`
      : `<div class="card empty"><h2>${query ? '没有找到相关错题' : all.length ? '当前记忆状态下没有题目' : '这一组暂时没有错题'}</h2>
          <p>${all.length ? '可以切换到“全部保留”，查看未到期和已巩固的题。' : '在对应模式中答错或标记的题，会自动保存在这里。'}</p></div>`}`;
}

function bindMistakeBook() {
  document.querySelectorAll('[data-mistake-mode]').forEach(button => button.onclick = () => {
    mistakeModeFilter = button.dataset.mistakeMode;
    mistakeSearchQuery = '';
    mistakeMemoryFilter = 'all';
    mistakeDetailId = null;
    render();
  });
  document.querySelectorAll('[data-start-wrong]').forEach(button =>
    button.onclick = () => start('wrong', button.dataset.startWrong));
  document.querySelectorAll('[data-remove]').forEach(button =>
    button.onclick = () => removeMistake(button.dataset.remove, mistakeModeFilter));
}
