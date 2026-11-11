let pendingQuestionMotion = null;
let activeQuestionMotion = null;

function clearQuestionMotion() {
  const active = activeQuestionMotion;
  activeQuestionMotion = null;
  if (!active) return;
  active.animations.forEach(animation => animation.cancel());
  active.ghost.remove();
  active.scene.style.willChange = '';
}

function captureQuestionMotion(direction) {
  clearQuestionMotion();
  const scene = document.querySelector('.question-scene');
  const enabled = motionEnabled && !matchMedia('(prefers-reduced-motion: reduce)').matches
    && scene && typeof scene.animate === 'function';
  return { direction, ghost: enabled ? scene.cloneNode(true) : null };
}

function playQuestionMotion(transition, key) {
  if (!transition?.ghost) return;
  const scene = document.querySelector('.question-scene');
  if (!scene || !motionEnabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ghost = transition.ghost;
  ghost.classList.add('question-scene-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  ghost.querySelectorAll('button,a,input,select,textarea').forEach(element => element.tabIndex = -1);
  ghost.style.top = scene.offsetTop + 'px';
  scene.parentElement.append(ghost);
  scene.style.willChange = 'transform,opacity';
  const direction = transition.direction;
  const animations = [
    ghost.animate([
      { opacity: 1, transform: 'translate3d(0,0,0)' },
      { opacity: 0, transform: `translate3d(${-7 * direction}px,0,0)` }
    ], { duration: 75, easing: 'cubic-bezier(.3,0,.8,1)', fill: 'both' }),
    scene.animate([
      { opacity: .2, transform: `translate3d(${12 * direction}px,0,0)` },
      { opacity: 1, transform: 'translate3d(0,0,0)' }
    ], { duration: 120, easing: 'cubic-bezier(.16,.8,.3,1)', fill: 'both' })
  ];
  const active = { key, scene, ghost, animations, refresh: false };
  activeQuestionMotion = active;
  Promise.all(animations.map(animation => animation.finished)).then(() => {
    if (activeQuestionMotion !== active) return;
    const refresh = active.refresh;
    clearQuestionMotion();
    if (refresh) render();
  }).catch(() => {});
}
