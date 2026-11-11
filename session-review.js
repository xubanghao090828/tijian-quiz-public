let summarySessionId = null;
let reviewState = null;
const REVIEW_PAGE_SIZE = 10;

function sessionRows(record) {
  const byId = new Map(bank().map(question => [question.id, question]));
  const marked = new Set(record.markedQuestionIds || record.questionIds.filter(id => state.marked[id]));
  return record.questionIds.map((id, index) => {
    const question = byId.get(id);
    const chosen = Number.isInteger(record.answers[index]) ? record.answers[index] : null;
    let status = 'unanswered';
    if (!question) status = 'unavailable';
    else if (chosen !== null) status = chosen === question.answer ? 'correct' : 'wrong';
    return { id, index, question, chosen, status, marked: marked.has(id) };
  });
}

function summarizeSession(record) {
  const rows = sessionRows(record);
  const total = rows.length;
  const answered = rows.filter(row => row.chosen !== null).length;
  const knownCorrect = rows.filter(row => row.status === 'correct').length;
  const finished = record.status === 'finished';
  const correct = finished && Number.isInteger(record.correctCount) ? record.correctCount : knownCorrect;
  const wrong = finished && Number.isInteger(record.correctCount)
    ? answered - correct : rows.filter(row => row.status === 'wrong').length;
  const unavailable = rows.filter(row => row.status === 'unavailable').length;
  const canGrade = !rows.some(row => row.chosen !== null && row.status === 'unavailable')
    || (finished && Number.isInteger(record.correctCount));
  const accuracy = answered && canGrade ? Math.round(correct / answered * 1000) / 10 : null;
  const score = finished && Number.isFinite(record.score) ? record.score
    : total && canGrade ? Math.round(correct / total * 1000) / 10 : null;
  const categories = new Map();
  for (const row of rows) {
    if (!row.question || row.chosen === null) continue;
    const name = row.question.category || '其他知识点';
    const item = categories.get(name) || { name, answered: 0, wrong: 0 };
    item.answered++;
    if (row.status === 'wrong') item.wrong++;
    categories.set(name, item);
  }
  const focus = [...categories.values()].filter(item => item.wrong)
    .sort((a, b) => b.wrong - a.wrong).slice(0, 3);
  return {
    rows, total, answered, correct, wrong, finished, unavailable, accuracy, score, focus,
    unanswered: total - answered,
    marked: rows.filter(row => row.marked).length,
    completion: total ? Math.round(answered / total * 100) : 0
  };
}

function openResult(id) {
  if (!state.sessions.some(record => record.id === id)) return;
  leavePractice();
  summarySessionId = id;
  setView('summary');
}

function reviewEntry(record, label, layout = 'single', filter = 'all', className = 'result-action-outline') {
  return `<button class="${className}" data-review-session="${esc(record.id)}"
    data-review-layout="${layout}" data-review-filter="${filter}">${label}</button>`;
}

function resultView(record = currentSession) {
  if (!record) return '<div class="card empty"><h2>没有找到这轮记录</h2><button class="secondary" data-go="history">返回历史答题</button></div>';
  const stats = summarizeSession(record);
  const { finished, total, answered, correct, wrong, unanswered, marked, focus, rows } = stats;
  const score = stats.score;
  const rank = finished && score !== null
    ? score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D' : '↻';
  const displayValue = finished ? score : stats.completion;
  const focusHtml = focus.length ? focus.map((item, i) => `
    <div class="result-focus-row"><span>${String(i + 1).padStart(2, '0')}</span>
      <div><strong>${esc(item.name)}</strong><small>已答 ${item.answered} 道中答错 ${item.wrong} 道 · 先回看解析，再练这一类</small></div>
      <b>${Math.round(item.wrong / item.answered * 100)}%</b>
    </div>`).join('') : `<div class="result-focus-empty">${!answered
      ? '开始作答后，这里会列出需要加强的知识点。'
      : stats.unavailable ? '部分题目已不在当前题库，恢复原题库后可查看完整分析。'
      : '已答题目中没有错题。继续保持，也可以回顾标记过的题。'}</div>`;
  const missed = rows.filter(row => row.status === 'wrong');
  const missedHtml = missed.slice(0, 3).map(row => `
    <button class="result-missed" data-review-session="${esc(record.id)}" data-review-layout="single"
      data-review-filter="wrong" data-review-index="${row.index}">
      <span>${String(sessionQuestionNumber(record,row.index)).padStart(2, '0')}</span><strong>${esc(row.question.question)}</strong><b>查看解析 ↗</b>
    </button>`).join('');
  const types = [...new Set(rows.filter(row => row.question).map(row => row.question.type || '单选题'))];
  const typeHtml = types.map(type => {
    const questions = rows.filter(row => (row.question?.type || '单选题') === type && row.question);
    const done = questions.filter(row => row.chosen !== null).length;
    const right = questions.filter(row => row.status === 'correct').length;
    return `<tr><th scope="row">${esc(type)}</th><td>${done} / ${questions.length}</td><td>${right}</td>
      <td>${questions.filter(row => row.status === 'wrong').length}</td><td>${done ? Math.round(right / done * 1000) / 10 + '%' : '—'}</td></tr>`;
  }).join('');
  const primary = finished
    ? (record.mode==='sequential'?`<button class="result-action-primary" data-sequence-restart="${esc(record.id)}">从本轮起点重新挑战 ↗</button>`:`<button class="result-action-primary" data-start="${esc(record.mode)}">重新挑战 ↗</button>`)
    : `<button class="result-action-primary" data-resume="${esc(record.id)}">继续本轮 · 第 ${sessionQuestionNumber(record,Math.min(record.index || 0,total-1))} 题 →</button>`;
  return `<div class="result-screen" aria-label="${finished ? '练习结算' : '阶段总结'}">
    <div class="result-system"><span><i>✦</i> STUDY / COMMISSION</span><span>PROGRESS SAVED <b>● ${finished ? '结算完成' : '进度已保存'}</b></span></div>
    <div class="result-intro">${finished ? 'COMMISSION COMPLETE' : 'TRAINING IN PROGRESS'} <span>${esc(sessionTitle(record.mode))}</span></div>
    <div class="result-hero">
      <div class="result-rank-wrap"><span class="result-rank-shadow" aria-hidden="true">${rank}</span>
        <strong class="result-rank" aria-label="${finished && score !== null ? '评级 ' + rank : '练习进行中'}">${rank}</strong>
        <i class="result-rank-spark" aria-hidden="true">✦</i></div>
      <div class="result-hero-copy"><div class="result-stamp">${finished ? 'CLEAR' : 'SAVED'} <span>✓</span></div>
        <h1>${finished ? '委托完成！' : '本轮阶段总结'}</h1><p>${esc(sessionTitle(record.mode))} · 已答 ${answered} / ${total} 道</p>
        <div class="result-score-line"><span>${finished ? '本轮得分' : '完成进度'}</span>
          <strong ${displayValue !== null ? `data-result-score="${displayValue}" data-result-key="${esc(record.id)}-${record.updatedAt}-${record.status}"` : ''}>${displayValue ?? '—'}</strong><b>${finished ? '/ 100' : '%'}</b></div>
      </div>
    </div>
    <div class="result-stats">
      <div><small>答对题目</small><strong>${correct}</strong></div>
      <div><small>答错题目</small><strong>${wrong}</strong></div>
      <div><small>未答题目</small><strong>${unanswered}</strong></div>
      <div><small>已答正确率</small><strong>${stats.accuracy === null ? '—' : stats.accuracy + '%'}</strong></div>
    </div>
    <div class="result-progress"><div style="width:${displayValue ?? 0}%"></div></div>
    <p class="result-rule">${finished ? '按答对题数折算百分制 · S ≥ 90 / A ≥ 80 / B ≥ 70 / C ≥ 60'
      : '总结按已答题统计，未答题单独计数。进度保留，随时可继续。'}</p>
    ${stats.unavailable ? `<p class="review-warning">${stats.unavailable} 道题已不在当前题库，恢复原题库后可查看对应解析。</p>` : ''}
    ${sequentialSummaryHtml(record,stats)}<section class="result-focus"><div class="result-section-head"><span>REPORT / 题型表现</span><strong>看看哪类题需要加强</strong></div>
      <table class="result-type-table"><thead><tr><th scope="col">题型</th><th scope="col">已答 / 总数</th><th scope="col">答对</th><th scope="col">答错</th><th scope="col">正确率</th></tr></thead><tbody>${typeHtml}</tbody></table>
    </section>
    <section class="result-focus"><div class="result-section-head"><span>INTEL / 改进方向</span><strong>${focus.length ? '优先突破这些知识点' : '继续巩固已学知识'}</strong></div>${focusHtml}${missed.length||record.weakCategories?.length?`<p class="muted">从现有题库抽取薄弱分类的题，优先本轮未出现的题，最多 50 道。</p><button class="result-action-outline" data-weakness-paper="${esc(record.id)}">按薄弱分类组复习卷 →</button>`:''}</section>
    <section class="result-review"><div class="result-section-head"><span>REVIEW / 本轮回顾</span><strong>错题 ${wrong} 道 · 标记不会 ${marked} 道</strong></div>
      ${missedHtml}
      <div class="result-review-links">
        ${reviewEntry(record, '错题回顾 · ' + wrong, 'single', 'wrong')}
        ${reviewEntry(record, '标记回顾 · ' + marked, 'single', 'marked')}
        ${reviewEntry(record, '逐题回顾', 'single')}
        ${reviewEntry(record, '整卷回顾', 'paper')}
      </div>
    </section>
    ${memorySummaryHtml(record)}<div class="result-actions">${primary}<button class="result-action-outline" data-go="history">历史答题</button><button class="result-action-outline" data-go="mistakes">打开错题本</button></div>
    <div class="result-foot">TIJIAN / STUDY SYSTEM <span>${esc(sessionDate(record.finishedAt || record.updatedAt))}</span></div>
  </div>`;
}

function animateResultScore() {
  const element = document.querySelector('[data-result-score]');
  if (!element || lastResultAnimatedId === element.dataset.resultKey) return;
  lastResultAnimatedId = element.dataset.resultKey;
  if (!motionEnabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = Number(element.dataset.resultScore);
  const begin = performance.now();
  function frame(now) {
    if (!element.isConnected) return;
    const progress = Math.min(1, (now - begin) / 820);
    const value = target * (1 - Math.pow(1 - progress, 3));
    element.textContent = String(Number.isInteger(target) ? Math.round(value) : Math.round(value * 10) / 10);
    if (progress < 1) requestAnimationFrame(frame);
  }
  element.textContent = '0';
  requestAnimationFrame(frame);
}

function openReview(id, layout = 'single', filter = 'all', questionIndex = null) {
  const record = state.sessions.find(item => item.id === id);
  if (!record) return;
  const returnTo = view === 'summary' ? 'summary' : 'history';
  leavePractice();
  reviewState = { id, layout, filter, position: 0, page: 0, returnTo };
  if (questionIndex !== null) {
    const rows = filteredReviewRows(record);
    reviewState.position = Math.max(0, rows.findIndex(row => row.index === questionIndex));
    reviewState.page = Math.floor(reviewState.position / REVIEW_PAGE_SIZE);
  }
  setView('review');
}

function filteredReviewRows(record) {
  return sessionRows(record).filter(row => reviewState.filter === 'all'
    || (reviewState.filter === 'marked' ? row.marked : row.status === reviewState.filter));
}

function reviewQuestionHtml(row, record) {
  if (!row.question) return '<p class="review-warning">题目已不在当前题库，请恢复原题库后查看。</p>';
  const question = row.question;
  if (row.chosen === null && record.status === 'active') {
    return `<div class="review-options">${question.options.map((option, i) =>
      `<div class="review-option"><span>${'ABCDEFGH'[i]}</span><div>${esc(option)}</div></div>`).join('')}</div>
      <p class="muted">这道题尚未作答，继续本轮作答后可查看答案和解析。</p>`;
  }
  const chosenText = row.chosen === null ? '未作答' : question.options[row.chosen] ?? '选项已失效';
  return `<div class="review-answer-summary"><p>你的答案 <strong>${esc(chosenText)}</strong></p>
    <p>正确答案 <strong>${esc(question.options[question.answer])}</strong></p></div>${questionReview(question, row.chosen)}`;
}

function reviewCard(row, record, whole) {
  const labels = { correct: '答对', wrong: '答错', unanswered: '未答', unavailable: '题目缺失' };
  return `<article class="card panel review-detail paper-question" aria-label="第 ${sessionQuestionNumber(record,row.index)} 题回顾">
    <div class="review-question-meta"><span>${record.mode==='sequential'?'题库第 '+sessionQuestionNumber(record,row.index)+' 题 · 本轮 ':'第 '}${row.index+1} / ${record.questionIds.length} 题</span>
      <span class="review-status is-${row.status}">${labels[row.status]}</span>${row.marked ? '<span class="review-status">◇ 已标记</span>' : ''}</div>
    <div class="question-meta"><span>${esc(row.question?.type || '题目缺失')}</span><span>${esc(row.question?.category || '未分类')}</span></div>
    <h2>${esc(row.question?.question || '题目已不在当前题库')}</h2>${reviewQuestionHtml(row, record)}
    ${whole ? `<button class="secondary" data-review-question="${row.index}">单独回顾这道题 →</button>` : ''}
  </article>`;
}

function reviewPager(pages) {
  return `<div class="review-pager"><button class="secondary" data-review-page="${reviewState.page - 1}" ${reviewState.page === 0 ? 'disabled' : ''}>← 上一页</button>
    <span>第 ${reviewState.page + 1} / ${pages} 页</span>
    <button class="secondary" data-review-page="${reviewState.page + 1}" ${reviewState.page >= pages - 1 ? 'disabled' : ''}>下一页 →</button></div>`;
}

function reviewView() {
  const record = state.sessions.find(item => item.id === reviewState?.id);
  if (!record) return '<div class="card empty"><h2>没有找到这轮记录</h2><button class="secondary" data-go="history">返回历史答题</button></div>';
  const allRows = sessionRows(record);
  const rows = filteredReviewRows(record);
  const whole = reviewState.layout === 'paper';
  const counts = {
    all: allRows.length, correct: allRows.filter(row => row.status === 'correct').length,
    wrong: allRows.filter(row => row.status === 'wrong').length,
    marked: allRows.filter(row => row.marked).length,
    unanswered: allRows.filter(row => row.status === 'unanswered').length
  };
  const filters = [['all', '全部'], ['wrong', '错题'], ['marked', '标记'], ['correct', '答对'], ['unanswered', '未答']];
  const controls = `<div class="card panel review-controls">
    <div class="review-layout-options" role="group" aria-label="回顾方式">
      <button class="pill ${whole ? '' : 'selected'}" data-review-layout-switch="single" aria-pressed="${!whole}">逐题回顾</button>
      <button class="pill ${whole ? 'selected' : ''}" data-review-layout-switch="paper" aria-pressed="${whole}">整卷回顾</button>
    </div>
    <div class="review-filters" role="group" aria-label="题目范围">${filters.map(([value, label]) =>
      `<button class="pill ${reviewState.filter === value ? 'selected' : ''}" data-review-filter-switch="${value}" aria-pressed="${reviewState.filter === value}">${label} ${counts[value]}</button>`).join('')}</div>
  </div>`;
  let content = '<div class="card empty"><h2>这个范围内没有题目</h2><button class="secondary" data-review-filter-switch="all">查看全部题目</button></div>';
  if (rows.length && whole) {
    const pages = Math.ceil(rows.length / REVIEW_PAGE_SIZE);
    reviewState.page = Math.max(0, Math.min(reviewState.page, pages - 1));
    const shown = rows.slice(reviewState.page * REVIEW_PAGE_SIZE, (reviewState.page + 1) * REVIEW_PAGE_SIZE);
    content = `${reviewPager(pages)}<div class="paper-questions">${shown.map(row => reviewCard(row, record, true)).join('')}</div>
      ${reviewPager(pages)}
      <form class="review-page-form"><label for="review-page-number">跳到第</label><input id="review-page-number" name="page" type="number" min="1" max="${pages}" value="${reviewState.page + 1}" inputmode="numeric"><span>页</span><button class="secondary" type="submit">跳转</button></form>`;
  } else if (rows.length) {
    reviewState.position = Math.max(0, Math.min(reviewState.position, rows.length - 1));
    const position = reviewState.position;
    content = `<label class="review-select-label" for="review-question-select">选择本轮题目（当前范围共 ${rows.length} 道）</label>
      <select id="review-question-select">${rows.map((row, i) =>
        `<option value="${i}" ${i === position ? 'selected' : ''}>第 ${sessionQuestionNumber(record,row.index)} 题${row.marked ? ' · 已标记' : ''}</option>`).join('')}</select>
      ${reviewCard(rows[position], record, false)}
      <div class="review-navigation"><button class="secondary" data-review-step="${position - 1}" ${position === 0 ? 'disabled' : ''}>← 上一题</button>
        <span>${position + 1} / ${rows.length}</span>
        <button class="secondary" data-review-step="${position + 1}" ${position === rows.length - 1 ? 'disabled' : ''}>下一题 →</button></div>`;
  }
  return `<div class="session-review"><div class="detail-head"><button class="secondary" data-review-back>← ${reviewState.returnTo === 'summary' ? '返回总结' : '返回历史答题'}</button>
      <button class="secondary" data-result-session="${esc(record.id)}">查看${record.status === 'finished' ? '结算' : '总结'}</button></div>
    <div class="hero"><div><div class="eyebrow">REVIEW / ${whole ? 'FULL PAPER' : 'QUESTION'}</div><h1>${whole ? '整卷回顾' : '逐题回顾'}</h1>
      <p>${esc(sessionTitle(record.mode))} · ${whole ? '按本轮题序展开选项和解析，每页 10 道。' : '回看自己的答案、正确答案和逐项解析。'}</p></div></div>
    ${controls}${content}</div>`;
}

function changeReview(update) {
  Object.assign(reviewState, update);
  render();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function backFromReview() {
  if (reviewState.returnTo === 'summary') openResult(reviewState.id);
  else { historySessionId = reviewState.id; historyQuestionIndex = null; setView('history'); }
}

function bindSessionReview() {
  document.querySelectorAll('[data-review-session]').forEach(button => button.onclick = () => {
    const target = button.dataset;
    openReview(target.reviewSession, target.reviewLayout, target.reviewFilter,
      target.reviewIndex === undefined ? null : Number(target.reviewIndex));
  });
  document.querySelector('[data-review-back]')?.addEventListener('click', backFromReview);
  document.querySelector('[data-session-summary]')?.addEventListener('click', () => openResult(currentSession.id));
  document.querySelectorAll('[data-review-filter-switch]').forEach(button =>
    button.onclick = () => changeReview({ filter: button.dataset.reviewFilterSwitch, page: 0, position: 0 }));
  document.querySelectorAll('[data-review-layout-switch]').forEach(button => button.onclick = () => {
    const layout = button.dataset.reviewLayoutSwitch;
    if (layout === reviewState.layout) return;
    changeReview({
      layout,
      page: Math.floor(reviewState.position / REVIEW_PAGE_SIZE),
      position: reviewState.page * REVIEW_PAGE_SIZE
    });
  });
  document.querySelectorAll('[data-review-step]').forEach(button =>
    button.onclick = () => changeReview({ position: Number(button.dataset.reviewStep) }));
  document.querySelectorAll('[data-review-page]').forEach(button =>
    button.onclick = () => changeReview({ page: Number(button.dataset.reviewPage) }));
  document.querySelectorAll('[data-review-question]').forEach(button => button.onclick = () => {
    const record = state.sessions.find(item => item.id === reviewState.id);
    const position = filteredReviewRows(record).findIndex(row => row.index === Number(button.dataset.reviewQuestion));
    changeReview({ layout: 'single', position });
  });
  document.querySelector('#review-question-select')?.addEventListener('change', event =>
    changeReview({ position: Number(event.target.value) }));
  document.querySelector('.review-page-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const input = event.currentTarget.elements.page;
    if (input.reportValidity()) changeReview({ page: Number(input.value) - 1 });
  });
}
