/** Standalone native WAAPI deck. No framework, dependencies or application state. */
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const defaults = Object.freeze({ gap: 22, scaleStep: .08, duration: 700, elasticity: .55, aspectRatio: 2, clearance: 14, extraction: .38, animate: true, cardHeight: null, compact: false });
function optionsOf(input) {
  const out = { ...defaults, ...input };
  if (typeof out.animate !== 'boolean') throw new TypeError('animate must be a boolean.');
  if (typeof out.compact !== 'boolean' || out.cardHeight !== null && (!Number.isFinite(out.cardHeight) || out.cardHeight < 200 || out.cardHeight > 600)) throw new TypeError('Invalid card layout.');
  const limits = { gap: [8, 42], scaleStep: [.03, .15], duration: [240, 2400], elasticity: [0, 1], aspectRatio: [1.6, 3], clearance: [8, 40], extraction: [.3, .48] };
  for (const [key, [min, max]] of Object.entries(limits)) {
    if (!Number.isFinite(out[key]) || out[key] < min || out[key] > max) throw new RangeError(`Invalid deck option: ${key}`);
  }
  return out;
}

/** A normalized, damped step response, with a C1 tail landing exactly at rest. */
export function springAt(time, elasticity = defaults.elasticity) {
  const t = clamp(time), damping = .88 - .35 * elasticity, omega = 10.5;
  const decay = damping * omega, frequency = omega * Math.sqrt(1 - damping * damping);
  const response = 1 - Math.exp(-decay * t) * (Math.cos(frequency * t) + decay / frequency * Math.sin(frequency * t));
  return mix(response, 1, smooth((t - .78) / .22));
}

/** Pure geometry: identity/order/content are intentionally outside this function. */
export function poseAt(depth, progress, height, input = {}, selectedDepth = 3) {
  const o = { ...defaults, ...input }, p = clamp(progress), scale = 1 - depth * o.scaleStep;
  if (depth === selectedDepth) {
    const below = height + o.clearance;
    if (p < o.extraction) return { y: mix(-selectedDepth * o.gap, below, smooth(p / o.extraction)), scale, z: 4 - selectedDepth };
    const rise = springAt((p - o.extraction) / (1 - o.extraction), o.elasticity);
    return { y: mix(below, 0, rise), scale: mix(scale, 1, rise), z: 5 };
  }
  if (depth > selectedDepth) return { y: -depth * o.gap, scale, z: 4 - depth };
  const retreat = smooth(p / .85);
  const bumpPhase = (p - .65) / .24;
  const bump = bumpPhase > 0 && bumpPhase < 1 ? Math.sin(Math.PI * bumpPhase) ** 2 * height * .008 : 0;
  return { y: -o.gap * (depth + retreat) + bump, scale: scale - o.scaleStep * retreat, z: 4 - depth };
}

/** Previous has its own FORWARD-time choreography: never reverse a settling spring. */
export function previousPoseAt(depth, progress, height, input = {}) {
  const o = { ...defaults, ...input }, p = clamp(progress), scale = 1 - depth * o.scaleStep;
  if (depth === 0) {
    const below = height + o.clearance;
    if (p < o.extraction) return { y: below * smooth(p / o.extraction), scale: 1, z: 4 };
    const returnToBack = springAt((p - o.extraction) / (1 - o.extraction), o.elasticity);
    return { y: mix(below, -3 * o.gap, returnToBack), scale: mix(1, 1 - 3 * o.scaleStep, returnToBack), z: 0 };
  }
  const advance = smooth(p / .85);
  const bumpPhase = (p - .65) / .24;
  const bump = bumpPhase > 0 && bumpPhase < 1 ? Math.sin(Math.PI * bumpPhase) ** 2 * height * .008 : 0;
  return { y: -o.gap * (depth - advance) + bump, scale: scale + o.scaleStep * advance, z: 4 - depth };
}

const transform = pose => `translate3d(0px,${pose.y.toFixed(5)}px,0px) scale(${pose.scale.toFixed(7)})`;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

export class PerspectiveCardDeck extends EventTarget {
  constructor(root, { cards, renderCard, ...input } = {}) {
    super();
    if (!(root instanceof HTMLElement) || !Array.isArray(cards) || cards.length !== 4 || typeof renderCard !== 'function') throw new TypeError('Provide a root, four cards and renderCard(card).');
    if (new Set(cards.map(card => card.id)).size !== 4 || cards.some(card => typeof card.id !== 'string' || !card.id)) throw new TypeError('Card ids must be unique strings.');
    this.root = root; this.options = optionsOf(input); this.content = new Map(cards.map(card => [card.id, card]));
    this.order = cards.map(card => card.id); this.initialOrder = [...this.order]; this.elements = new Map(); this.pickers = new Map();
    this.active = null; this.queued = null; this.pendingOptions = null; this.dead = false; this.cycles = 0;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    root.classList.add('pcd-root'); root.setAttribute('role', 'group'); root.setAttribute('aria-label', '四层卡片堆');
    this.plane = document.createElement('div'); this.plane.className = 'pcd-plane';
    for (const card of cards) {
      const element = document.createElement('article'); element.className = 'pcd-card'; element.dataset.cardId = card.id;
      const content = renderCard(card);
      if (!(content instanceof Node)) throw new TypeError('renderCard must return a DOM Node.');
      element.append(content); this.elements.set(card.id, element); this.plane.append(element);
    }
    root.append(this.plane);
    for (const card of cards) {
      const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'pcd-pick'; pick.dataset.cardId = card.id;
      pick.setAttribute('aria-label', `直接选择${card.title || card.label || card.id}`);
      pick.addEventListener('click', () => { this.dispatchEvent(new CustomEvent('pick', { detail: { id: card.id } })); this.select(card.id); });
      this.pickers.set(card.id, pick); root.append(pick);
    }
    this.visibility = () => {
      if (document.hidden && this.active && this.options.compact && !this.active.paused) {
        this._commit(this.active);
        return;
      }
      if (document.hidden && this.active && !this.active.paused) { this.autoPaused = true; this.pause(); }
      else if (!document.hidden && this.autoPaused) { this.autoPaused = false; this.resume(); }
    };
    this.reducedChange = () => { if (this.active && this.reducedMotion.matches) this._commit(this.active); };
    document.addEventListener('visibilitychange', this.visibility); this.reducedMotion.addEventListener('change', this.reducedChange);
    this.resizeObserver = new ResizeObserver(() => this._resize()); this.resizeObserver.observe(this.plane);
    this._measure(); this._rest(); this._emit('ready');
  }

  _emit(reason) { this.root.dataset.state = this.active ? this.active.paused ? 'paused' : 'running' : 'idle'; this.dispatchEvent(new CustomEvent('change', { detail: { reason, ...this.snapshot() } })); }
  _measure() {
    this.width = this.root.clientWidth; this.height = this.options.cardHeight ?? this.width / this.options.aspectRatio;
    this.plane.style.height = `${this.height}px`; this.plane.style.top = `${3 * this.options.gap + 18}px`;
    const backScale = 1 - 3 * this.options.scaleStep;
    this.root.style.height = `${3 * this.options.gap + 18 + this.height * (this.options.compact ? 1 : 1 + backScale) + this.options.clearance + 24}px`;
  }
  _resize() {
    if (this.dead) return;
    const nextHeight = this.options.cardHeight ?? this.root.clientWidth / this.options.aspectRatio;
    if (Math.abs(nextHeight - this.height) < .1 && Math.abs(this.root.clientWidth - this.width) < .1) return;
    const active = this.active, time = active?.animations[0].currentTime || 0;
    this._measure();
    if (active) {
      const old = active.animations;
      active.animations = this._animations(active.from, time, active.paused, active.rate, active.direction, active.selectedDepth);
      old.forEach(animation => animation.cancel()); this._watch(active);
    } else this._rest();
    this._emit('resize');
  }
  _rest() {
    this.order.forEach((id, depth) => {
      const element = this.elements.get(id);
      element.style.transform = transform({ y: -depth * this.options.gap, scale: 1 - depth * this.options.scaleStep });
      element.style.zIndex = String(4 - depth); element.style.willChange = '';
      element.dataset.depth = depth; element.inert = depth !== 0;
      element.setAttribute('aria-hidden', String(depth !== 0));
      const pick = this.pickers.get(id), width = this.width * (1 - depth * this.options.scaleStep);
      Object.assign(pick.style, { display: depth ? 'block' : 'none', width: `${width}px`, height: `${this.options.gap}px`, left: `${(this.width - width) / 2}px`, top: `${3 * this.options.gap + 18 - depth * this.options.gap}px` });
    });
    this.root.dataset.front = this.order[0];
  }
  _animations(from, time = 0, paused = false, rate = 1, direction = 1, selectedDepth = 3) {
    const o = this.options;
    const frameSteps = o.compact ? 42 : 120;
    const samples = [...new Set([...Array.from({ length: frameSteps + 1 }, (_, i) => i / frameSteps), o.extraction])].sort((a, b) => a - b);
    const flyer = direction > 0 ? selectedDepth : 0;
    // In an inline deck, a short dip keeps the full moving card inside the layout.
    const travelHeight = o.compact ? 14 : this.height;
    const animations = from.map((id, depth) => {
      const element = this.elements.get(id); element.style.willChange = 'transform'; element.style.zIndex = String(4 - depth);
      const pose = direction > 0 ? poseAt : previousPoseAt;
      const keyframes = samples.map(p => {
        const frame = { offset: p, transform: transform(pose(depth, p, travelHeight, o, selectedDepth)) };
        if (o.compact && depth === flyer) {
          // Switch stacking order while the flyer is out of sight.
          frame.opacity = smooth(Math.abs(p - o.extraction) / .20);
        }
        return frame;
      });
      return element.animate(keyframes, { duration: o.duration, fill: 'both', easing: 'linear' });
    });
    // One discrete z change on the SAME native timeline as the transforms.
    const beforeZ = direction > 0 ? String(4 - selectedDepth) : '4', afterZ = direction > 0 ? '5' : '0';
    animations.push(this.elements.get(from[flyer]).animate([
      { offset: 0, zIndex: beforeZ, easing: 'steps(1,end)' },
      { offset: o.extraction, zIndex: afterZ }, { offset: 1, zIndex: afterZ }
    ], { duration: o.duration, fill: 'both' }));
    const start = document.timeline.currentTime - time / rate;
    for (const animation of animations) { animation.playbackRate = rate; animation.startTime = start; if (paused) { animation.pause(); animation.currentTime = time; } }
    return animations;
  }
  _watch(active) {
    const generation = active.animations;
    const settle = () => {
      if (this.active === active && active.animations === generation) this._commit(active);
    };
    clearTimeout(active.watchdog);
    if (this.options.compact && !active.paused) {
      active.watchdog = setTimeout(() => { if (!active.paused) settle(); }, this.options.duration + 350);
    }
    Promise.all(generation.map(animation => animation.finished)).then(settle, () => {
      if (this.options.compact) settle();
    });
  }
  _begin(request, paused = false, direction = 1, targetId = null) {
    const from = [...this.order];
    const selectedDepth = targetId ? from.indexOf(targetId) : 3;
    if (targetId && selectedDepth === 0) { request.resolve({ status: 'unchanged', order: [...this.order] }); this._emit('unchanged'); return; }
    const active = { from, request, direction, targetId, selectedDepth, paused, rate: 1, animations: [], dragging: false, rollback: false };
    this.active = active;
    // Card faces contain live controls. Freeze input until the new front has landed.
    for (const element of this.elements.values()) element.inert = true;
    if (this.reducedMotion.matches || !this.options.animate || this.options.compact && document.hidden) { this._commit(active); return; }
    active.animations = this._animations(active.from, 0, paused, 1, direction, selectedDepth); this._watch(active); this._emit('start');
  }
  _commit(active) {
    if (this.active !== active || this.dead) return;
    clearTimeout(active.watchdog);
    if (!active.rollback) { this.order = active.direction > 0 ? [active.from[active.selectedDepth], ...active.from.filter((_, depth) => depth !== active.selectedDepth)] : [...active.from.slice(1), active.from[0]]; this.cycles++; }
    this.active = null;
    // Write stable poses before removing native fill effects; node identities never move.
    this._rest(); active.animations.forEach(animation => animation.cancel());
    if (this.pendingOptions) { this.options = this.pendingOptions; this.pendingOptions = null; this._measure(); this._rest(); }
    active.request.resolve({ status: active.rollback ? 'canceled' : 'completed', order: [...this.order] });
    const queued = this.queued; this.queued = null;
    if (queued) this._begin(queued, false, queued.direction, queued.targetId);
    this._emit(active.rollback ? 'rollback-complete' : 'complete');
  }
  shuffle(direction = 1) {
    if (direction !== 1 && direction !== -1) throw new RangeError('Shuffle direction must be 1 or -1.');
    if (this.dead) return Promise.resolve({ status: 'destroyed' });
    if (this.active) { if (!this.queued) this.queued = deferred(); this.queued.direction = direction; this.queued.targetId = null; this._emit('queued'); return this.queued.promise; }
    const request = deferred(); this._begin(request, false, direction); return request.promise;
  }
  next() { return this.shuffle(1); }
  previous() { return this.shuffle(-1); }
  select(id) {
    if (!this.content.has(id)) throw new RangeError('Unknown card id.');
    if (this.dead) return Promise.resolve({ status: 'destroyed' });
    if (!this.active && this.order[0] === id) return Promise.resolve({ status: 'unchanged', order: [...this.order] });
    if (this.active) {
      if (!this.queued) this.queued = deferred();
      Object.assign(this.queued, { direction: 1, targetId: id }); this._emit('queued'); return this.queued.promise;
    }
    const request = deferred(); this._begin(request, false, 1, id); return request.promise;
  }
  /** A gesture scrubs only the pre-crossover portion, so cancellation never pops a layer. */
  drag(direction, amount) {
    if (this.dead || this.reducedMotion.matches || !this.options.animate || this.active && !this.active.dragging) return false;
    if (!this.active) { this._begin(deferred(), true, direction); this.active.dragging = true; }
    if (this.active.direction !== direction) return false;
    const p = clamp(amount, 0, .28), time = p * this.options.duration;
    this.active.animations.forEach(animation => { animation.currentTime = Math.min(this.options.duration - .001, Math.max(.001, time)); });
    this._emit('drag'); return true;
  }
  releaseDrag(commit, velocity = 0) {
    const active = this.active; if (!active?.dragging) return;
    const progress = this.snapshot().progress;
    active.dragging = false; active.rollback = !commit; active.paused = false;
    if (!commit && progress < .001) { this._commit(active); return; }
    active.rate = commit ? 1 + clamp(Math.abs(velocity), 0, 1.5) * .3 : -1.8;
    const time = active.animations[0].currentTime || 0, start = document.timeline.currentTime - time / active.rate;
    active.animations.forEach(animation => { animation.playbackRate = active.rate; animation.play(); animation.startTime = start; });
    this._watch(active); this._emit(commit ? 'release' : 'rollback');
  }
  /** Cancel future requests, keeping the current extraction/landing intact. */
  cancelQueued() { this.queued?.resolve({ status: 'canceled' }); this.queued = null; this._emit('queue-cleared'); }
  pause() { if (this.active) { this.active.paused = true; this.active.animations.forEach(animation => animation.pause()); this._emit('pause'); } }
  resume() {
    const active = this.active; if (!active?.paused) return;
    const time = active.animations[0].currentTime || 0, start = document.timeline.currentTime - time / active.rate;
    active.paused = false;
    active.animations.forEach(animation => { animation.play(); animation.startTime = start; }); this._emit('resume');
  }
  /** Deterministic inspection of real native animations, with no order commit. */
  seek(progress) {
    if (this.dead || this.reducedMotion.matches || !this.options.animate) return;
    this.cancelQueued(); if (!this.active) this._begin(deferred(), true); else this.pause();
    const time = Math.min(clamp(progress) * this.options.duration, this.options.duration - .001);
    this.active.animations.forEach(animation => { animation.currentTime = time; }); this._emit('seek');
  }
  configure(input) {
    const next = optionsOf({ ...(this.pendingOptions || this.options), ...input });
    if (this.active) this.pendingOptions = next;
    else { this.options = next; this._measure(); this._rest(); }
    this._emit('configure');
  }
  reset() {
    // Explicit reset returns instantly to a stable original deck; it is not a shuffle.
    this.cancelQueued(); const active = this.active; this.active = null;
    clearTimeout(active?.watchdog);
    active?.animations.forEach(animation => animation.cancel()); active?.request.resolve({ status: 'reset' });
    if (this.pendingOptions) { this.options = this.pendingOptions; this.pendingOptions = null; this._measure(); }
    this.order = [...this.initialOrder]; this.cycles = 0; this._rest(); this._emit('reset');
  }
  snapshot() {
    const time = this.active ? clamp((this.active.animations[0]?.currentTime || 0) / this.options.duration) : 0;
    const progress = this.active ? time : 0;
    return { order: [...this.order], nextOrder: [this.order[3], ...this.order.slice(0, 3)], previousOrder: [...this.order.slice(1), this.order[0]], targetId: this.active?.targetId || null, progress, cycles: this.cycles, queued: !!this.queued, running: !!this.active, paused: !!this.active?.paused, dragging: !!this.active?.dragging, direction: this.active?.direction || 1, options: { ...(this.pendingOptions || this.options) }, height: this.height, reducedMotion: this.reducedMotion.matches };
  }
  destroy() {
    if (this.dead) return; this.dead = true; this.queued?.resolve({ status: 'destroyed' });
    const active = this.active; this.active = null; clearTimeout(active?.watchdog); active?.animations.forEach(animation => animation.cancel()); active?.request.resolve({ status: 'destroyed' });
    this.resizeObserver.disconnect(); document.removeEventListener('visibilitychange', this.visibility); this.reducedMotion.removeEventListener('change', this.reducedChange);
    this.plane.remove(); for (const pick of this.pickers.values()) pick.remove(); this.pickers.clear(); this.root.style.height = ''; this.elements.clear();
  }
}
