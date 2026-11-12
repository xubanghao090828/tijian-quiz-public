let pendingQuestionMotion = null;
let activeQuestionMotion = null;

function stopQuestionControl(control) {
  try { control.stop ? control.stop() : control.cancel(); } catch {}
}

function clearQuestionMotion() {
  const active = activeQuestionMotion;
  activeQuestionMotion = null;
  if (!active) return;
  active.animations.forEach(stopQuestionControl);
  active.ghost?.remove();
  active.scene.style.willChange = '';
  active.scene.style.removeProperty('transform');
  active.scene.style.removeProperty('opacity');
}

function captureQuestionMotion(direction) {
  const scene = document.querySelector('.question-scene:not(.question-scene-ghost)');
  const enabled = motionEnabled && !matchMedia('(prefers-reduced-motion: reduce)').matches
    && scene && typeof scene.animate === 'function';
  const question = scene?.querySelector('.question')?.getBoundingClientRect();
  const visible = question && question.bottom > 0 && question.top < innerHeight;
  const style = enabled ? getComputedStyle(scene) : null;
  let x = 0;
  try { x = new DOMMatrixReadOnly(style?.transform).m41; } catch {}
  const opacity = style ? Number(style.opacity) : 1;
  clearQuestionMotion();
  // Reuse the existing node only when the old stem is on screen. No deep DOM clone.
  return { direction, enabled, outgoing: enabled && visible ? scene : null, opacity, x };
}

function questionControl(element, values, duration, delay = 0, ease = [.2, 0, 0, 1]) {
  if (window.Motion?.animate) return Motion.animate(element, values, { duration, delay, ease });
  const frames = [0, 1].map(i => ({ opacity: values.opacity[i], transform: `translate3d(${values.x[i]}px,0,0)` }));
  return element.animate(frames, { duration: duration * 1000, delay: delay * 1000, easing: `cubic-bezier(${ease.join(',')})`, fill: 'both' });
}

function playQuestionMotion(transition, key) {
  if (!transition?.enabled) return;
  const scene = document.querySelector('.question-scene:not(.question-scene-ghost)');
  if (!scene || !motionEnabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const direction = transition.direction;
  const ghost = transition.outgoing;
  const animations = [];
  if (ghost) {
    // Old analyses, controls and timers are not animated or painted twice.
    for (const child of [...ghost.children]) {
      if (!child.matches('.question-meta,.question,.question-attempts,.knot-reply')) child.remove();
    }
    ghost.classList.add('question-scene-ghost');
    ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
    ghost.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    ghost.querySelectorAll('button,a,input,select,textarea').forEach(element => element.tabIndex = -1);
    ghost.style.top = scene.offsetTop + 'px';
    ghost.style.maxHeight = innerHeight + 'px';
    ghost.style.overflow = 'hidden'; ghost.style.contain = 'paint';
    scene.parentElement.append(ghost);
    animations.push(questionControl(ghost, { opacity: [transition.opacity, 0], x: [transition.x, -8 * direction] }, .08, 0, [.4, 0, 1, 1]));
  }
  scene.style.willChange = 'transform,opacity';
  animations.push(questionControl(scene, { opacity: [0, 1], x: [12 * direction, 0] }, ghost ? .18 : .2, ghost ? .08 : 0));
  const active = { key, scene, ghost, animations, refresh: false };
  activeQuestionMotion = active;
  Promise.all(animations.map(control => control.finished || Promise.resolve(control))).then(() => {
    if (activeQuestionMotion !== active) return;
    const refresh = active.refresh;
    clearQuestionMotion();
    if (refresh) render();
  }).catch(() => {});
}
