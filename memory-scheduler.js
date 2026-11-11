const MEMORY_DAY = 86400000;
const MEMORY_TARGET = 0.9;
let memoryScheduler = null;
let memoryInitialized = false;
let memoryError = '';
let memoryReplayIds = [];
let mistakeMemoryFilter = 'all';

function newMemoryRecord(id, time) {
  const card = memoryScheduler.newCard({ now: new Date(time) });
  card.cardId = id;
  return {
    card: JSON.parse(JSON.stringify(card)), createdAt: time,
    successes: 0, failures: 0, spacedSuccesses: 0, lastCreditedAt: null
  };
}

function applyMemoryEvent(event) {
  const time = event.createdAt;
  if (!Number.isFinite(new Date(time).getTime())) throw Error('复习时间无效');
  const record = state.memoryCards[event.questionId] || newMemoryRecord(event.questionId, time);
  state.memoryCards[event.questionId] = record;
  if (event.memoryRating === 0) return;
  const card = {
    ...record.card,
    dueAt: new Date(record.card.dueAt),
    lastReviewAt: record.card.lastReviewAt ? new Date(record.card.lastReviewAt) : null
  };
  const result = memoryScheduler.review({ card, grade: event.memoryRating, now: new Date(time) });
  record.card = JSON.parse(JSON.stringify(result.card));
  if (event.memoryRating === FSRS.Rating.Again) {
    record.failures++;
    record.spacedSuccesses = 0;
    record.lastCreditedAt = null;
  } else {
    record.successes++;
    if (record.lastCreditedAt === null || time - record.lastCreditedAt >= 20 * 3600000) {
      record.spacedSuccesses++;
      record.lastCreditedAt = time;
    }
  }
}

function rebuildMemoryCards() {
  if (!memoryScheduler || !Array.isArray(state.events)) return;
  const events = state.events.filter(event => Number.isInteger(event.memoryRating)
    && event.memoryRating >= 0 && event.memoryRating <= 4)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const canAppend = memoryReplayIds.length <= events.length
    && memoryReplayIds.every((id, i) => id === events[i].id);
  if (!canAppend || !memoryReplayIds.length) {
    state.memoryCards = Object.create(null);
    memoryReplayIds = [];
  }
  try {
    for (let i = memoryReplayIds.length; i < events.length; i++) {
      applyMemoryEvent(events[i]);
      memoryReplayIds.push(events[i].id);
    }
    memoryError = '';
  } catch (error) {
    memoryError = '答题记录已保留，记忆计划暂时未能更新。请重新打开应用后重试。';
    console.error('Memory schedule update failed', error);
  }
}

async function initializeMemorySystem() {
  try {
    memoryScheduler = await FSRS.DefaultScheduler({
      version: 'FSRS-7', desiredRetention: MEMORY_TARGET,
      enableShortTerm: true, learningSteps: ['1m', '10m'], relearningSteps: ['1m', '10m'],
      allowModelOverride: false, enableFuzz: false, maximumInterval: 365
    });
    rebuildMemoryCards();
    const now = Date.now();
    const enrollments = Object.keys(state.mistakes).filter(id => !state.memoryCards[id])
      .map(questionId => ({
        id: crypto.randomUUID(), deviceId: window.TIJIAN_PROFILE.deviceId, questionId,
        kind: 'seed', total: 0, correct: 0, mistakeAction: null, mistakeMode: null,
        memoryRating: 0, createdAt: now
      }));
    state.events.push(...enrollments);
    rebuildMemoryCards();
    memoryInitialized = true;
    save();
    if (view === 'home' || view === 'mistakes') render();
    if (enrollments.length && navigator.onLine) window.TijianSync?.sync();
  } catch (error) {
    memoryError = '记忆计划未能加载，答题记录会继续保存在本机。请重新打开应用后重试。';
    console.error('Memory scheduler initialization failed', error);
    if (view === 'home' || view === 'mistakes') render();
  }
}

function memoryInfo(id, now = Date.now()) {
  const record = state.memoryCards[id];
  if (!record) return { record: null, stage: 'new', due: true, dueAt: now, overdue: false, long: false };
  const dueAt = new Date(record.card.dueAt).getTime();
  const lastReview = record.card.lastReviewAt ? new Date(record.card.lastReviewAt).getTime() : record.createdAt;
  let stage = record.card.reps ? 'learning' : 'new';
  if (record.spacedSuccesses >= 3 && record.card.state === FSRS.State.Review
    && record.card.scheduledDays >= 7) stage = 'mastered';
  return {
    record, stage, dueAt, due: dueAt <= now,
    overdue: dueAt <= now - MEMORY_DAY,
    long: now - lastReview >= 14 * MEMORY_DAY && dueAt <= now
  };
}

function memoryDueQuestions(scope = 'all', now = Date.now()) {
  return mistakeQuestions(scope).map(question => {
    const info = memoryInfo(question.id, now);
    const status = info.record?.card.scheduleStatus;
    const priority = status === 'learning' || status === 'relearning' ? 0
      : status === 'review' ? 1 : 2;
    return { question, info, priority };
  }).filter(item => item.info.due)
    .sort((a, b) => a.priority - b.priority || a.info.dueAt - b.info.dueAt)
    .map(item => item.question);
}

function memoryScopeStats(scope = 'all', now = Date.now()) {
  const infos = mistakeQuestions(scope).map(question => memoryInfo(question.id, now));
  return {
    all: infos.length, due: infos.filter(info => info.due).length,
    learning: infos.filter(info => info.stage !== 'mastered').length,
    mastered: infos.filter(info => info.stage === 'mastered').length,
    overdue: infos.filter(info => info.overdue).length, long: infos.filter(info => info.long).length
  };
}

function filterMemoryQuestions(questions, filter = mistakeMemoryFilter, now = Date.now()) {
  return questions.filter(question => {
    const info = memoryInfo(question.id, now);
    if (filter === 'due') return info.due;
    if (filter === 'long') return info.long;
    if (filter === 'learning') return info.stage !== 'mastered';
    if (filter === 'mastered') return info.stage === 'mastered';
    return true;
  });
}

function memoryDate(time) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(time));
}

function memoryRowHtml(id) {
  const info = memoryInfo(id);
  const labels = { new: '新纳入计划', learning: '学习中', mastered: '已巩固' };
  const due = info.due ? (info.overdue ? '已逾期，优先复习' : '已到复习时间') : '下次 ' + memoryDate(info.dueAt);
  return `<span class="memory-row"><span class="memory-stage is-${info.stage}">${labels[info.stage]}</span>
    <small class="${info.due ? 'memory-due' : ''}">${due}</small></span>`;
}

function memoryDetailHtml(id) {
  const info = memoryInfo(id), record = info.record;
  return `<section class="memory-detail"><h3>这道题的记忆计划</h3>${memoryRowHtml(id)}
    <p>成功的间隔复习 ${record?.spacedSuccesses || 0} 次 · 累计复习 ${record?.card.reps || 0} 次</p>
    <p>${record?.card.lastReviewAt ? '最近复习 ' + memoryDate(record.card.lastReviewAt) : '从本次升级开始建立复习计划。'}</p>
    <p>答对后继续保留，系统会安排下一次复习。</p></section>`;
}

function memoryFeedbackHtml(id) {
  if (!state.mistakes[id] || !state.memoryCards[id]) return '';
  const info = memoryInfo(id);
  return `<p class="memory-feedback">已更新记忆计划，本题继续保留。下次复习 ${memoryDate(info.dueAt)}。</p>`;
}

function memoryDashboardHtml(scope) {
  const stats = memoryScopeStats(scope);
  const filters = [['all', '全部保留'], ['due', '到期'], ['learning', '待巩固'], ['mastered', '已巩固'], ['long', '久未练']];
  return `<section class="card panel memory-dashboard" aria-label="记忆复习计划">
    <div class="memory-dashboard-title"><div><div class="eyebrow">MEMORY / FSRS-7</div><h2>按记忆安排复习</h2></div><span>离线可用</span></div>
    <p>答对后继续保留，间隔逐步拉长；答错会缩短间隔。逾期和久未练的到期题优先。</p>
    ${memoryError ? `<p class="review-warning" role="alert">${esc(memoryError)}</p>` : ''}
    <div class="memory-counts"><div><strong>${stats.due}</strong><small>现在到期</small></div><div><strong>${stats.overdue}</strong><small>已逾期</small></div>
      <div><strong>${stats.long}</strong><small>久未练</small></div><div><strong>${stats.mastered}</strong><small>已巩固</small></div></div>
    <div class="button-row"><button class="primary" data-start-memory="${scope}" ${!stats.due || !memoryInitialized ? 'disabled' : ''}>复习到期 ${stats.due} 道 →</button>
      ${stats.all ? `<button class="secondary" data-start-wrong="${scope}">自由复习全部</button>` : ''}</div>
    <p class="muted">${memoryInitialized ? '到期复习每轮最多 30 道，练完后可继续。' : '正在建立复习计划…'} 同一道题在各来源分组中共享记忆进度。</p>
    <details><summary>记忆计划怎样工作</summary><p>使用 FSRS-7 和官方默认参数，调度目标为 90% 记忆保持率。答错按“忘记”、答对按“记住”记录。</p>
      <p>初学和遗忘后先安排 1 分钟、10 分钟的短间隔步骤，之后由算法按表现安排。至少 3 次相隔 20 小时以上的成功复习，且间隔达到 7 天，才显示“已巩固”。已巩固的题仍会按时复习。</p>
      <p>“久未练”表示至少 14 天没练且已经到期。首次升级会把当前保留的旧题加入计划，今后的评分用于逐题调整；这里没有训练个人专属模型参数。</p>
      <a href="vendor/fsrs-LICENSE.txt" target="_blank" rel="noopener">开源许可与版本</a></details>
    <div class="memory-filters" role="group" aria-label="记忆状态">${filters.map(([value, name]) =>
      `<button class="pill ${mistakeMemoryFilter === value ? 'selected' : ''}" data-memory-filter="${value}" aria-pressed="${mistakeMemoryFilter === value}">${name} ${stats[value]}</button>`).join('')}</div>
  </section>`;
}

function memoryHomeCard() {
  const stats = memoryScopeStats();
  if (!stats.all) return '';
  return `<section class="card panel resume-card memory-home"><div><div class="eyebrow">MEMORY / DAILY REVIEW</div><h2>今天的记忆复习</h2>
    <p>到期 ${stats.due} 道 · 已逾期 ${stats.overdue} 道 · 已巩固 ${stats.mastered} 道</p>
    <p>错题会保留，按记忆进度反复复习。</p></div>
    ${stats.due && memoryInitialized ? '<button class="primary" data-start-memory="all">开始到期复习 →</button>'
      : '<button class="secondary" data-go="mistakes">查看记忆计划 →</button>'}</section>`;
}

function memorySummaryHtml(record) {
  if (record.mode !== 'wrong') return '';
  const scope = record.mistakeSourceMode || 'all';
  const due = memoryScopeStats(scope).due;
  return `<section class="result-focus"><div class="result-section-head"><span>MEMORY / 记忆计划</span><strong>本轮题目继续保留</strong></div>
    <p>系统会按本轮表现安排下次复习，答对的题也能在错题本查看。</p>
    <div class="button-row"><button class="result-action-outline" data-go="mistakes">查看记忆计划</button>
      ${due && memoryInitialized ? `<button class="result-action-outline" data-start-memory="${scope}">继续到期复习 · ${due} 道</button>` : ''}</div></section>`;
}

function bindMemorySystem() {
  document.querySelectorAll('[data-start-memory]').forEach(button =>
    button.onclick = () => start('wrong', button.dataset.startMemory, 'due'));
  document.querySelectorAll('[data-memory-filter]').forEach(button => button.onclick = () => {
    mistakeMemoryFilter = button.dataset.memoryFilter;
    mistakeDetailId = null;
    render();
  });
}

document.addEventListener('DOMContentLoaded', initializeMemorySystem, { once: true });
document.addEventListener('visibilitychange', () => {
  if (memoryInitialized && !document.hidden && ['home', 'mistakes', 'summary'].includes(view)) render();
});
setInterval(() => {
  if (memoryInitialized && !document.hidden && view === 'mistakes' && !mistakeDetailId
    && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) render();
}, 60000);
