let activeStudyTimer = null;
let studyAppActive = true;
let studyTimerExpanded = false;

function mergeTimerCounters(left = {}, right = {}) {
  const result = {};
  for (const device of new Set([...Object.keys(left || {}), ...Object.keys(right || {})])) {
    const a = left?.[device] || [], b = right?.[device] || [];
    result[device] = Array.from({ length: Math.max(a.length, b.length) }, (_, i) => Math.max(a[i] || 0, b[i] || 0));
  }
  return result;
}

function formatStudyTime(ms) {
  const seconds = Math.floor(Math.max(0, ms || 0) / 1000);
  const minutes = Math.floor(seconds / 60), remainder = String(seconds % 60).padStart(2, '0');
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${remainder}` : `${String(minutes).padStart(2, '0')}:${remainder}`;
}

function studyTimeMs(record, questionIndex = null) {
  if (!record) return 0;
  let total = Object.values(record.timerCounters || {}).reduce((sum, times) => sum + (questionIndex === null
    ? times.reduce((value, time) => value + time, 0) : times[questionIndex] || 0), 0);
  if (activeStudyTimer?.record === record && (questionIndex === null || questionIndex === activeStudyTimer.index)) {
    total += Math.max(0, performance.now() - activeStudyTimer.at);
  }
  return total;
}

function flushStudyTimer(persist = false) {
  const active = activeStudyTimer;
  if (!active) return;
  const now = performance.now(), delta = Math.round(Math.max(0, now - active.at));
  active.at = now;
  if (!delta) return;
  const record = active.record, device = window.TIJIAN_PROFILE.deviceId;
  record.timerCounters ||= {};
  const times = record.timerCounters[device] ||= Array(record.questionIds.length).fill(0);
  times[active.index] = (times[active.index] || 0) + delta;
  record.updatedAt = Math.max(Date.now(), record.updatedAt + 1);
  record.dirty = true;
  if (persist) save();
}

function stopStudyTimer() {
  flushStudyTimer(true);
  activeStudyTimer = null;
}

function refreshStudyTimer() {
  const running = view === 'practice' && currentSession?.status === 'active'
    && index < session.length && !document.hidden && studyAppActive;
  if (activeStudyTimer && (!running || activeStudyTimer.record !== currentSession || activeStudyTimer.index !== index)) stopStudyTimer();
  if (running && !activeStudyTimer) {
    currentSession.timerCounters ||= {};
    activeStudyTimer = { record: currentSession, index, at: performance.now() };
  }
  updateStudyTimerDisplay();
}

function studyTimerHtml() {
  return `<details class="study-timer-disclosure" ${studyTimerExpanded ? 'open' : ''}>
    <summary><span data-study-toggle-label>${studyTimerExpanded ? '收起用时' : '查看用时'}</span><span aria-hidden="true">◷</span></summary>
    <div class="study-timer" aria-label="本轮和本题累计用时">
    <span>本轮用时 <strong data-study-total>${formatStudyTime(studyTimeMs(currentSession))}</strong></span>
    <span>本题 <strong data-study-question>${formatStudyTime(studyTimeMs(currentSession, index))}</strong></span>
    <small>离开答题页、锁屏或切到后台自动暂停</small></div></details>`;
}

function bindStudyTimer() {
  const details = document.querySelector('.question-card .study-timer-disclosure');
  if (!details) return;
  details.addEventListener('toggle', () => {
    studyTimerExpanded = details.open;
    details.querySelector('[data-study-toggle-label]').textContent = details.open ? '收起用时' : '查看用时';
  });
}

function updateStudyTimerDisplay() {
  document.querySelectorAll('[data-study-total]').forEach(element => element.textContent = formatStudyTime(studyTimeMs(currentSession)));
  document.querySelectorAll('[data-study-question]').forEach(element => element.textContent = formatStudyTime(studyTimeMs(currentSession, index)));
}

function studyTimeSummaryHtml(record, answered) {
  if (!record.timerCounters) return '<p class="muted">此轮此前未记录用时；继续作答后开始累计。</p>';
  const ms = studyTimeMs(record);
  return `<section class="result-focus time-summary"><div class="result-section-head"><span>TIME / 刷题用时</span><strong>只记录用时，不限时</strong></div>
    <div class="time-summary-values"><div><small>累计刷题用时</small><strong>${formatStudyTime(ms)}</strong></div>
    <div><small>平均每道已答题</small><strong>${answered ? formatStudyTime(ms / answered) : '—'}</strong></div></div>
    <p class="muted">包含本轮阅读和查看解析的时间；离开答题页、锁屏或切到后台不计时。平均用时按已答题数计算。</p></section>`;
}

document.addEventListener('visibilitychange', () => { stopStudyTimer(); refreshStudyTimer(); });
window.addEventListener('pagehide', stopStudyTimer);
window.addEventListener('pageshow', () => refreshStudyTimer());
document.addEventListener('DOMContentLoaded', () => {
  let lastSave = performance.now();
  setInterval(() => {
    refreshStudyTimer();
    if (performance.now() - lastSave >= 10000) { flushStudyTimer(true); lastSave = performance.now(); }
  }, 1000);
  try {
    const cap = window.Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    const plugin = cap.Plugins?.App || cap.registerPlugin?.('App');
    Promise.resolve(plugin?.addListener('appStateChange', ({ isActive }) => {
      stopStudyTimer(); studyAppActive = isActive; refreshStudyTimer();
    })).catch(() => {});
  } catch {}
});
