let practiceDockFrame = null;
let practiceDockKey = null;
let practiceDockFloating = null;
let practiceDockSurfaces = [];
let practiceDockObserver = null;
const practiceSurfaceAnimations = new Map();

function practiceControlsHtml(kind) {
  const complete = answeredCount() === session.length;
  const nextLabel = index < session.length - 1 ? '下一题 →' : '前往未答题 →';
  return `<nav class="practice-dock" data-dock-kind="${kind}" aria-label="${kind === 'inline' ? '选项下方刷题操作' : '悬浮刷题操作'}">
    <button class="secondary" type="button" data-prev ${index === 0 ? 'disabled' : ''}>← 上一题</button>
    <button class="practice-dock-numbers" type="button" data-toggle-question-nav aria-expanded="${navOpen}" aria-controls="question-number-panel"><span>题号</span><small>${index + 1}/${session.length}</small></button>
    ${complete ? '<button class="primary finish-cta" type="button" data-finish>查看结算 →</button>' : `<button class="primary" type="button" data-next>${nextLabel}</button>`}
  </nav>`;
}

function practiceDockHtml() {
  return `<div class="practice-dock-shell">${practiceControlsHtml('floating')}</div>`;
}

function practiceInlineControlsHtml() {
  return `<div class="practice-inline-controls">${practiceControlsHtml('inline')}</div>`;
}

function readPracticeSurface(element) {
  const computed = getComputedStyle(element);
  let y = 0;
  try { y = new DOMMatrixReadOnly(computed.transform).m42; } catch {}
  return { opacity: Number(computed.opacity), y };
}

function stopPracticeSurface(element) {
  const current = readPracticeSurface(element);
  const previous = practiceSurfaceAnimations.get(element);
  practiceSurfaceAnimations.delete(element);
  previous?.controls.forEach(control => { try { control.stop ? control.stop() : control.cancel(); } catch {} });
  element.style.opacity = current.opacity;
  element.style.transform = `translateY(${current.y}px)`;
  element.style.willChange = '';
  return current;
}

function capturePracticeDock() {
  practiceDockSurfaces.forEach(stopPracticeSurface);
  practiceDockObserver?.disconnect(); practiceDockObserver = null;
  if (practiceDockFrame !== null) cancelAnimationFrame(practiceDockFrame);
  practiceDockFrame = null;
  practiceDockSurfaces = [];
}

function setPracticeSurface(element, active, immediate = false) {
  const from = stopPracticeSurface(element);
  element.classList.toggle('is-surface-active', active);
  element.inert = !active;
  element.setAttribute('aria-hidden', String(!active));
  element.querySelectorAll('button').forEach(button => button.tabIndex = active ? 0 : -1);
  element.style.visibility = 'visible';
  const targetY = active ? 0 : 12;
  const reduce = !motionEnabled || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (immediate || reduce || typeof element.animate !== 'function') {
    element.style.opacity = active ? '1' : '0';
    element.style.transform = `translateY(${targetY}px)`;
    element.style.visibility = active ? 'visible' : 'hidden';
    return;
  }
  element.style.willChange = 'transform,opacity';
  let controls;
  if (window.Motion?.animate) {
    controls = [
      Motion.animate(element, { opacity: [from.opacity, active ? 1 : 0] }, { duration: active ? .19 : .14, ease: 'easeOut' }),
      Motion.animate(element, { y: [from.y, targetY] }, { type: 'spring', stiffness: 500, damping: 36, mass: .8, restDelta: .1, restSpeed: 1 })
    ];
  } else {
    controls = [element.animate([
      { opacity: from.opacity, transform: `translateY(${from.y}px)` },
      { opacity: active ? 1 : 0, transform: `translateY(${targetY}px)` }
    ], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' })];
  }
  const token = { controls };
  practiceSurfaceAnimations.set(element, token);
  Promise.all(controls.map(control => control.finished || Promise.resolve(control))).then(() => {
    if (practiceSurfaceAnimations.get(element) !== token) return;
    practiceSurfaceAnimations.delete(element);
    controls.forEach(control => { try { control.stop ? control.stop() : control.cancel(); } catch {} });
    element.style.opacity = active ? '1' : '0';
    element.style.transform = `translateY(${targetY}px)`;
    element.style.visibility = active ? 'visible' : 'hidden';
    element.style.willChange = '';
  }).catch(() => {});
}

function updatePracticeDock(immediate = false) {
  const shell = document.querySelector('.practice-dock-shell');
  const inline = practiceDockSurfaces.find(element => element.dataset.dockKind === 'inline');
  if (!shell || !inline || getComputedStyle(shell).display === 'none') return;
  const rect = inline.parentElement.getBoundingClientRect();
  const height = shell.offsetHeight;
  const visual = window.visualViewport;
  const top = visual?.offsetTop || 0;
  const bottom = top + (visual?.height || innerHeight);
  const safeInline = practiceDockFloating === true
    ? rect.top >= top + 20 && rect.bottom <= bottom - height - 30
    : rect.top >= top + 8 && rect.bottom <= bottom - 16;
  const floating = !safeInline;
  if (practiceDockFloating === floating && !immediate) return;
  practiceDockFloating = floating;
  shell.dataset.surface = floating ? 'floating' : 'inline';
  const focused = document.activeElement;
  let focusKey = null;
  if (focused?.closest('.practice-dock')) focusKey = ['data-prev','data-next','data-finish','data-toggle-question-nav'].find(key => focused.hasAttribute(key));
  practiceDockSurfaces.forEach(element => setPracticeSurface(element, (element.dataset.dockKind === 'floating') === floating, immediate));
  if (focusKey) practiceDockSurfaces.find(element => element.classList.contains('is-surface-active'))?.querySelector(`[${focusKey}]`)?.focus({ preventScroll: true });
}

function bindPracticeLayout() {
  const key = view === 'practice' && currentSession ? `${currentSession.id}:${index}` : null;
  if (key !== practiceDockKey) practiceDockFloating = null;
  practiceDockKey = key;
  const shell = document.querySelector('.practice-dock-shell');
  const inline = document.querySelector('.question-scene:not(.question-scene-ghost) .practice-inline-controls .practice-dock');
  const floating = shell?.querySelector('.practice-dock');
  practiceDockSurfaces = [inline, floating].filter(Boolean);
  updatePracticeDock(true);
  if (window.ResizeObserver && inline) {
    practiceDockObserver = new ResizeObserver(schedulePracticeDock);
    practiceDockObserver.observe(inline.parentElement);
    const card = inline.closest('.question-card'); if (card) practiceDockObserver.observe(card);
  }
}

function schedulePracticeDock() {
  if (practiceDockFrame !== null) return;
  practiceDockFrame = requestAnimationFrame(() => { practiceDockFrame = null; updatePracticeDock(); });
}

window.addEventListener('scroll', schedulePracticeDock, { passive: true });
window.addEventListener('resize', schedulePracticeDock, { passive: true });
window.visualViewport?.addEventListener('resize', schedulePracticeDock, { passive: true });
