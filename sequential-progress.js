function sequenceStart(record) {
  return record?.mode === 'sequential' && Number.isInteger(record.rangeStart) && record.rangeStart > 0
    ? record.rangeStart : 1;
}

function sessionQuestionNumber(record, index) {
  return sequenceStart(record) + index;
}

function sessionRangeLabel(record) {
  if (record.mode === 'sequential') {
    return `本轮范围为题库第 ${sequenceStart(record)}～${sessionQuestionNumber(record, record.questionIds.length - 1)} 题，共 ${record.questionIds.length} 道`;
  }
  if (record.mode === 'order') return `筛选范围 · ${record.categoryFilter || '全部分类'} · ${record.typeFilter || '全部题型'}`;
  return '';
}

function sequentialSummaryHtml(record, stats) {
  if (!['sequential', 'order'].includes(record.mode)) return '';
  const rows = stats.rows;
  const firstUnanswered = rows.find(row => row.chosen === null);
  const position = Math.min(record.index || 0, rows.length - 1);
  const skipped = rows.filter(row => row.index < position && row.chosen === null);
  const contiguous = firstUnanswered ? firstUnanswered.index : rows.length;
  const ranges = [];
  for (let start = 0; start < rows.length; start += 50) {
    const slice = rows.slice(start, start + 50);
    const answered = slice.filter(row => row.chosen !== null).length;
    const correct = slice.filter(row => row.status === 'correct').length;
    const wrong = slice.filter(row => row.status === 'wrong').length;
    const unknown = slice.some(row => row.chosen !== null && !row.question);
    ranges.push(`<tr><th scope="row"><button data-review-session="${esc(record.id)}" data-review-layout="single"
      data-review-filter="all" data-review-index="${start}">${sessionQuestionNumber(record, start)}～${sessionQuestionNumber(record, start + slice.length - 1)} ↗</button></th>
      <td>${answered}/${slice.length}</td><td>${correct}</td><td>${wrong}</td><td>${unknown || !answered ? '—' : Math.round(correct / answered * 1000) / 10 + '%'}</td></tr>`);
  }
  const categories = new Map();
  for (const row of rows) {
    const name = row.question?.category || '未分类';
    const item = categories.get(name) || { total: 0, answered: 0, correct: 0, wrong: 0 };
    item.total++;
    if (row.chosen !== null) item.answered++;
    if (row.status === 'correct') item.correct++;
    if (row.status === 'wrong') item.wrong++;
    categories.set(name, item);
  }
  const categoriesHtml = [...categories].sort((a, b) => b[1].wrong - a[1].wrong).map(([name, item]) =>
    `<tr><th scope="row">${esc(name)}</th><td>${item.answered}/${item.total}</td><td>${item.correct}</td><td>${item.wrong}</td></tr>`).join('');
  return `<section class="result-focus sequence-report" aria-label="顺序刷详细总结">
    <div class="result-section-head"><span>PROGRESS / 顺序进度</span><strong>这一轮具体刷到哪里</strong></div>
    <p>${esc(sessionRangeLabel(record))}</p>
    <div class="sequence-report-stats">
      <p><span>连续完成</span><strong>${contiguous ? '至第 ' + sessionQuestionNumber(record, contiguous - 1) + ' 题' : '起点题尚未作答'}</strong></p>
      <p><span>停留位置</span><strong>第 ${sessionQuestionNumber(record, position)} 题</strong></p>
      <p><span>停留题号之前漏答</span><strong>${skipped.length} 道</strong></p>
      <p><span>本轮待完成</span><strong>${stats.unanswered} 道</strong></p>
    </div>
    <p class="muted">连续完成从本轮起点计算。未到达的题计入待完成，未作答不计为答错。</p>
    <div class="button-row">${skipped.length ? `<button class="result-action-outline" data-review-session="${esc(record.id)}"
      data-review-layout="single" data-review-filter="unanswered" data-review-index="${skipped[0].index}">查看最早漏答 · 第 ${sessionQuestionNumber(record, skipped[0].index)} 题</button>` : ''}
      ${firstUnanswered && record.status === 'active' ? `<button class="result-action-outline" data-sequence-fill="${esc(record.id)}">继续最早未答 · 第 ${sessionQuestionNumber(record, firstUnanswered.index)} 题</button>` : ''}</div>
    <h3>每 50 题分段表现</h3><p class="muted">题号按本轮顺序排列，点题号范围可从该段开始回顾。</p>
    <div class="sequence-table-scroll"><table class="result-type-table"><thead><tr><th>题号范围</th><th>已答/总数</th><th>答对</th><th>答错</th><th>已答正确率</th></tr></thead><tbody>${ranges.join('')}</tbody></table></div>
    <h3>全部知识分类表现</h3>
    <div class="sequence-table-scroll"><table class="result-type-table"><thead><tr><th>分类</th><th>已答/总数</th><th>答对</th><th>答错</th></tr></thead><tbody>${categoriesHtml}</tbody></table></div>
    <p class="muted">评分只覆盖本轮范围。从指定题号开始时，起点前的题不计入本轮得分。</p>
  </section>`;
}

function bindSequentialProgress() {
  document.querySelectorAll('[data-weakness-paper]').forEach(button =>
    button.onclick = () => startWeaknessPaper(button.dataset.weaknessPaper));
  document.querySelector('[data-sequence-restart]')?.addEventListener('click', event => {
    const record = state.sessions.find(item => item.id === event.currentTarget.dataset.sequenceRestart);
    if(record) start('sequential','all','all',sequenceStart(record));
  });
  document.querySelector('.sequential-start-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const input = event.currentTarget.elements.startNumber;
    if (input.reportValidity()) start('sequential', 'all', 'all', Number(input.value));
  });
  document.querySelector('[data-sequence-fill]')?.addEventListener('click', event => {
    const record = state.sessions.find(item => item.id === event.currentTarget.dataset.sequenceFill);
    if (!record || record.status !== 'active') return;
    const target = record.answers.findIndex(answer => answer === null);
    resumeSession(record.id);
    if (currentSession === record && target >= 0) goToQuestion(target);
  });
}

function startWeaknessPaper(id) {
  const source = state.sessions.find(record => record.id === id);
  if (!source) return;
  const wrong = sessionRows(source).filter(row => row.status === 'wrong');
  const categories = [...new Set(wrong.map(row => row.question.category || '未分类'))];
  if (!categories.length && source.weakCategories) categories.push(...source.weakCategories);
  if (!categories.length) return;
  const previous = new Set(source.questionIds);
  const buckets = categories.map(category => {
    const candidates = bank().filter(question => (question.category || '未分类') === category);
    return [...shuffle(candidates.filter(question => !previous.has(question.id))),
      ...shuffle(candidates.filter(question => previous.has(question.id)))];
  });
  const questions = [], seen = new Set();
  while (questions.length < 50 && buckets.some(bucket => bucket.length)) {
    for (const bucket of buckets) {
      const question = bucket.shift();
      if (question && !seen.has(question.id) && questions.length < 50) {
        seen.add(question.id);questions.push(question);
      }
    }
  }
  start('targeted','all','all',null,{questions:shuffle(questions),sourceSessionId:source.id,weakCategories:categories});
}
