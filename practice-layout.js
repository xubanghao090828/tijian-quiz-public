let practiceDockAnimation = null;
let practiceDockFrame = null;
let practiceDockBeforeRender = null;
let practiceDockKey = null;
let practiceDockHasScrolled = false;
let practiceDockSlotExpanded = false;
let practiceDockLastScroll = 0;
let practiceDockDownTravel = 0;

function practiceDockHtml() {
  const complete = answeredCount() === session.length;
  const nextLabel = index < session.length - 1 ? '下一题 →' : '前往未答题 →';
  return `<div class="practice-dock-shell"><nav class="practice-dock" aria-label="刷题操作">
    <button class="secondary" type="button" data-prev ${index === 0 ? 'disabled' : ''}>← 上一题</button>
    <button class="practice-dock-numbers" type="button" data-toggle-question-nav aria-expanded="${navOpen}" aria-controls="question-number-panel"><span>题号</span><small>${index + 1}/${session.length}</small></button>
    ${complete ? '<button class="primary finish-cta" type="button" data-finish>查看结算 →</button>' : `<button class="primary" type="button" data-next>${nextLabel}</button>`}
  </nav></div>`;
}

function capturePracticeDock() {
  const dock = document.querySelector('.practice-dock');
  practiceDockBeforeRender = dock && getComputedStyle(dock).display !== 'none' ? dock.getBoundingClientRect() : null;
  practiceDockAnimation?.cancel(); practiceDockAnimation = null;
  if (practiceDockFrame !== null) cancelAnimationFrame(practiceDockFrame);
  practiceDockFrame = null;
}

function animatePracticeDock(dock, before, after) {
  if (!before || !after.width || !motionEnabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dx = before.left - after.left, dy = before.top - after.top;
  if (Math.abs(dx) + Math.abs(dy) + Math.abs(before.width - after.width) < 2) return;
  const animation = dock.animate([
    { transform: `translate3d(${dx}px,${dy}px,0) scaleX(${before.width / after.width})` },
    { transform: 'translate3d(0,0,0) scaleX(1)' }
  ], { duration: 320, easing: 'cubic-bezier(.22,.75,.25,1)', fill: 'both' });
  practiceDockAnimation = animation;
  dock.style.willChange = 'transform';
  animation.finished.then(() => {
    if (practiceDockAnimation !== animation) return;
    practiceDockAnimation = null; animation.cancel(); dock.style.willChange = '';
  }).catch(() => {});
}

function updatePracticeDock(beforeRender = null) {
  const shell = document.querySelector('.practice-dock-shell'), dock = shell?.querySelector('.practice-dock');
  const slot = document.querySelector('.question-card .question-scene:not(.question-scene-ghost) .practice-action-slot');
  if (!shell || !dock || !slot || getComputedStyle(shell).display === 'none') return;
  const rect = slot.getBoundingClientRect(), height = shell.offsetHeight;
  const inline = practiceDockHasScrolled && rect.top >= 8 && rect.top + height <= innerHeight - 10;
  const changed = shell.classList.contains('is-inline') !== inline;
  const before = beforeRender || (changed ? dock.getBoundingClientRect() : null);
  if (before) { practiceDockAnimation?.cancel(); practiceDockAnimation = null; dock.style.willChange = ''; }
  if (inline) practiceDockSlotExpanded = true;
  slot.classList.toggle('has-space', practiceDockSlotExpanded);
  slot.style.setProperty('--dock-slot-height', `${height}px`);
  shell.classList.toggle('is-inline', inline);
  shell.style.width = inline ? `${rect.width}px` : '100%';
  const y = inline ? rect.top - (innerHeight - shell.offsetHeight) : 0;
  shell.style.transform = inline ? `translate3d(${rect.left}px,${y}px,0)` : 'translate3d(0,0,0)';
  if (before) animatePracticeDock(dock, before, dock.getBoundingClientRect());
}

function bindPracticeLayout() {
  const key = view === 'practice' && currentSession ? `${currentSession.id}:${index}` : null;
  if (key !== practiceDockKey) {
    practiceDockKey = key; practiceDockHasScrolled = false; practiceDockSlotExpanded = false; practiceDockDownTravel = 0;
  }
  practiceDockLastScroll = scrollY;
  updatePracticeDock(practiceDockBeforeRender);
  practiceDockBeforeRender = null;
}

function schedulePracticeDock() {
  if (practiceDockFrame !== null) return;
  practiceDockFrame = requestAnimationFrame(() => {
    practiceDockFrame = null;
    const delta = scrollY - practiceDockLastScroll;
    if (delta > 0) practiceDockDownTravel += delta;
    if (practiceDockDownTravel >= 24) practiceDockHasScrolled = true;
    if (scrollY <= 12) { practiceDockHasScrolled = false; practiceDockDownTravel = 0; }
    practiceDockLastScroll = scrollY;
    updatePracticeDock();
  });
}

window.addEventListener('scroll', schedulePracticeDock, { passive: true });
window.addEventListener('resize', schedulePracticeDock, { passive: true });
