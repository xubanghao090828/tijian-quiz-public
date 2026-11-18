let attemptEventSource = null;
let attemptEventCount = -1;
let recentQuestionAttempts = new Map();

function questionAttemptData(questionId) {
  const events = state.events || [];
  if (events !== attemptEventSource || events.length !== attemptEventCount) {
    attemptEventSource = events; attemptEventCount = events.length; recentQuestionAttempts = new Map();
    events.forEach((event, position) => {
      // Aggregate legacy seeds have no trustworthy individual last-answer result.
      if (event.kind !== 'answer' || event.total !== 1 || !Number.isFinite(event.createdAt) || !Number.isFinite(new Date(event.createdAt).getTime())) return;
      const recent = recentQuestionAttempts.get(event.questionId) || [];
      recent.push({ correct: event.correct === 1, at: event.createdAt, position });
      recentQuestionAttempts.set(event.questionId, recent);
    });
    // Group first, then sort each question once; keep every individual answer.
    for (const recent of recentQuestionAttempts.values()) recent.sort((a, b) => b.at - a.at || b.position - a.position);
  }
  const attempt = state.attempts[questionId] || { total: 0, correct: 0 };
  const total = Math.max(0, Math.floor(attempt.total || 0));
  const wrong = Math.max(0, total - Math.floor(attempt.correct || 0));
  return { total, wrong, recent: recentQuestionAttempts.get(questionId) || [] };
}

function questionAttemptsHtml(questionId) {
  const { total, wrong, recent } = questionAttemptData(questionId), last = recent[0];
  const latest = last ? `最近：${last.correct ? '答对' : '答错'}` : total ? '最近：暂无逐次记录' : '尚未作答';
  return `<section class="question-attempts" aria-label="我的累计答题记录">
    <div class="question-attempt-counts"><span>做过 <b>${total}</b> 次</span><span>答错 <b>${wrong}</b> 次</span>
      <strong class="attempt-latest ${last ? last.correct ? 'is-correct' : 'is-wrong' : ''}">${latest}</strong></div>
    ${last ? `<div class="attempt-recent"><time datetime="${new Date(last.at).toISOString()}">${esc(sessionDate(last.at))}</time><span>全部 ${recent.length} 次逐次记录</span><small>从新到旧${recent.length > 40 ? ' · 上下滑动查看' : ''}</small>
      <span class="attempt-recent-marks" tabindex="0" role="group" aria-label="全部 ${recent.length} 次作答结果，从新到旧，可滚动查看">${recent.map((item, i) => `<span class="${item.correct ? 'is-correct' : 'is-wrong'}" title="${esc(sessionDate(item.at))} · ${item.correct ? '答对' : '答错'}" aria-label="第 ${recent.length - i} 次 · ${esc(sessionDate(item.at))} · ${item.correct ? '答对' : '答错'}">${item.correct ? '✓' : '×'}</span>`).join('')}</span></div>` : ''}
    ${recent.length && total > recent.length ? `<small class="attempt-legacy-note">另有 ${total - recent.length} 次旧记录仅保存了累计数据。</small>` : ''}
  </section>`;
}
