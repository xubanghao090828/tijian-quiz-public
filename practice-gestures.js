const PRACTICE_GESTURE_KEY = 'tijian-practice-gestures';
let gesturePreferences = (() => {
  let saved; try { saved = JSON.parse(localStorage.getItem(PRACTICE_GESTURE_KEY)); } catch {}
  return { swipe: saved?.swipe !== false, mark: saved?.mark !== false, navigation: saved?.navigation !== false };
})();
let practiceGestureManager = null;
let gestureClickBlockedUntil = 0;
let gestureToastTimeout = null;

function gestureSettingsHtml() {
  return `<section class="card settings-card gesture-settings"><div><h2>多指手势</h2><p>在答题区域操作。单指保持正常点按和滚动，屏幕边缘仍用于返回。</p></div>
    ${[['swipe','三指左右滑','左滑下一题，右滑上一题'],['mark','四指轻点','把当前题标记不会，加入错题本'],['navigation','五指轻点','打开或收起底部题号导航']].map(([key,title,description]) => `<div class="gesture-setting-row"><div><strong>${title}</strong><p>${description}</p></div><button class="settings-switch" data-gesture-setting="${key}" role="switch" aria-checked="${gesturePreferences[key]}">${gesturePreferences[key] ? '已开启' : '已关闭'}</button></div>`).join('')}
    <p>荣耀系统可能优先响应三指截屏等手势；若操作被截走，可在手机设置搜索「三指」检查。应用无法覆盖系统手势，原有操作按钮仍可使用。</p></section>`;
}

function showGestureToast(message) {
  let toast = document.querySelector('.gesture-toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'gesture-toast'; toast.setAttribute('role','status'); document.body.append(toast); }
  toast.textContent = message; toast.hidden = false;
  clearTimeout(gestureToastTimeout);
  gestureToastTimeout = setTimeout(() => toast.hidden = true, 1400);
}

function performPracticeGesture(action) {
  if (view !== 'practice' || !currentSession || currentSession.status !== 'active') return;
  if (action === 'next' || action === 'previous') {
    if (!gesturePreferences.swipe) return;
    const target = index + (action === 'next' ? 1 : -1);
    if (target < 0 || target >= session.length) { showGestureToast(target < 0 ? '已经是第一题' : '已经是最后一题'); return; }
    goToQuestion(target);
    showGestureToast(`第 ${index + 1} / ${session.length} 题`);
  } else if (action === 'mark' && gesturePreferences.mark) {
    const button = document.querySelector('[data-mark-unknown]');
    if (button?.disabled) showGestureToast('这道题已在错题本中');
    else { button?.click(); showGestureToast('已标记不会，加入错题本'); }
  } else if (action === 'navigation' && gesturePreferences.navigation) {
    toggleQuestionNavigation();
  }
}

function toggleQuestionNavigation() {
  if (!session.length) return;
  cancelAutoNext(); haptic('tap'); navOpen = !navOpen; navMotion = navOpen; render();
  const panel = document.querySelector('#question-number-panel');
  if (navOpen) {
    panel?.scrollIntoView({ behavior: motionEnabled ? 'smooth' : 'auto', block: 'end' });
    const scroll = panel?.querySelector('.question-nav-scroll'), current = scroll?.querySelector('.question-number.current');
    if (scroll && current) scroll.scrollTop += current.getBoundingClientRect().top - scroll.getBoundingClientRect().top - scroll.clientHeight / 2;
  }
}

function bindPracticeGestures() {
  document.querySelectorAll('[data-gesture-setting]').forEach(button => button.onclick = () => {
    const key = button.dataset.gestureSetting;
    gesturePreferences[key] = !gesturePreferences[key];
    localStorage.setItem(PRACTICE_GESTURE_KEY, JSON.stringify(gesturePreferences)); render();
  });
  practiceGestureManager?.destroy(); practiceGestureManager = null;
  const area = document.querySelector('.practice-content');
  if (!area || !currentSession || !window.Hammer) return;
  const manager = practiceGestureManager = new Hammer.Manager(area, { recognizers: [], inputClass: Hammer.TouchInput, touchAction: 'auto', cssProps: {} });
  let roundId, questionIndex, excluded = false, cancelled = false, peak = 0, startAt = 0;
  let maxMove = 0, origins = new Map();
  manager.on('hammer.input', input => {
    if (input.isFirst) {
      roundId = currentSession?.id; questionIndex = index; peak = 0; maxMove = 0;
      startAt = performance.now(); origins = new Map(); cancelled = false;
      const target = input.srcEvent.target;
      excluded = Boolean(target.closest('input,select,textarea,.question-nav-scroll,.nav-bottom-toggle'));
    }
    peak = Math.max(peak, input.maxPointers);
    for (const point of input.pointers) {
      if (!origins.has(point.identifier)) {
        origins.set(point.identifier, { x: point.clientX, y: point.clientY });
        if (point.clientX <= 28 || point.clientX >= innerWidth - 28) excluded = true;
      }
      const origin = origins.get(point.identifier);
      maxMove = Math.max(maxMove, Math.hypot(point.clientX - origin.x, point.clientY - origin.y));
    }
    if (input.eventType & Hammer.INPUT_CANCEL) cancelled = true;
    const enabled = peak === 3 ? gesturePreferences.swipe : peak === 4 ? gesturePreferences.mark : peak === 5 ? gesturePreferences.navigation : false;
    if (!excluded && peak >= 3 && enabled) {
      gestureClickBlockedUntil = Date.now() + 600;
      if (input.srcEvent.cancelable) input.srcEvent.preventDefault();
      if (autoNextPending) cancelAutoNext();
    }
    if (!input.isFinal || excluded || cancelled || !enabled || roundId !== currentSession?.id || questionIndex !== index || view !== 'practice') return;
    if (peak === 3 && performance.now() - startAt < 1400 && Math.abs(input.deltaX) >= 65 && Math.abs(input.deltaX) > Math.abs(input.deltaY) * 1.7) {
      performPracticeGesture(input.deltaX < 0 ? 'next' : 'previous');
    } else if ((peak === 4 || peak === 5) && performance.now() - startAt < 650 && maxMove < 22) {
      // Finish only after all fingers lift, so a five-finger tap cannot become a four-finger tap.
      performPracticeGesture(peak === 4 ? 'mark' : 'navigation');
    }
  });
}

document.addEventListener('click', event => {
  if (event.isTrusted && Date.now() < gestureClickBlockedUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
