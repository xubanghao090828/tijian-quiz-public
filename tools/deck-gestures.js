/** A swipe starts on a card rail. An untouched rear rail remains a normal button. */
export class DeckGestures {
  constructor(deck) {
    this.deck = deck;
    this.root = deck.root;
    this.stroke = null;
    this.frame = 0;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    const on = (type, handler, options) => this.root.addEventListener(type, handler, { signal, ...options });
    on('pointerdown', event => {
      if (!event.isPrimary) { this.cancel(); return; }
      if (event.button !== 0 || this.stroke || !event.target.closest('[data-card-rail], .pcd-pick') || event.target.closest('[data-card-step]')) return;
      this.suppressPointer = null;
      this.stroke = { id: event.pointerId, x: event.clientX, y: event.clientY, lastY: event.clientY, lastTime: event.timeStamp, velocity: 0, direction: 0, preview: false };
    });
    on('pointermove', event => this.move(event));
    window.addEventListener('pointerup', event => this.end(event), { signal });
    for (const type of ['pointercancel', 'lostpointercapture']) on(type, event => {
      // Capture can transfer from a touched rail to the root after intent locks.
      if (type === 'lostpointercapture' && event.target !== this.root) return;
      if (this.stroke?.id === event.pointerId) this.cancel();
    });
    on('click', event => {
      // A swipe ending over a picker must never also select that picker.
      if (event.detail && this.suppressPointer && performance.now() <= this.suppressPointer.until &&
          (event.pointerId === undefined || event.pointerId === this.suppressPointer.id)) {
        this.suppressPointer = null;
        event.stopImmediatePropagation(); event.preventDefault(); return;
      }
      const step = event.target.closest('[data-card-step]');
      if (step) this.activate(() => deck.shuffle(Number(step.dataset.cardStep)), event.detail === 0);
      else if (event.detail === 0) {
        const pick = event.target.closest('.pcd-pick');
        if (pick) {
          event.stopImmediatePropagation();
          this.activate(() => deck.select(pick.dataset.cardId), true);
        }
      }
    }, { capture: true });
    on('keydown', event => {
      if (!event.target.closest('[data-card-rail], .pcd-pick') || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); this.activate(() => deck.shuffle(event.key === 'ArrowUp' ? 1 : -1), true);
    });
    window.addEventListener('blur', () => this.cancel(), { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancel(); }, { signal });
  }

  activate(select, keyboard) {
    select().then(({ status }) => {
      if (keyboard && status === 'completed' && document.activeElement === document.body) {
        this.root.querySelector('.pcd-card[data-depth="0"] [data-card-rail]')?.focus({ preventScroll: true });
      }
    });
  }

  move(event) {
    const stroke = this.stroke;
    if (stroke?.id !== event.pointerId) return;
    const dx = event.clientX - stroke.x, dy = event.clientY - stroke.y;
    if (!stroke.direction) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (Math.abs(dx) >= Math.abs(dy)) { this.cancel(); return; }
      stroke.direction = dy < 0 ? 1 : -1;
      this.root.setPointerCapture(event.pointerId);
      this.root.dataset.dragging = '';
    }
    const dt = event.timeStamp - stroke.lastTime;
    if (dt > 0) stroke.velocity = (event.clientY - stroke.lastY) / dt;
    stroke.lastY = event.clientY; stroke.lastTime = event.timeStamp;
    if (!this.frame) this.frame = requestAnimationFrame(() => this.draw());
  }

  draw() {
    this.frame = 0;
    const stroke = this.stroke;
    if (!stroke?.direction || !this.root.isConnected || document.hidden) return;
    const distance = (stroke.y - stroke.lastY) * stroke.direction;
    stroke.preview = this.deck.drag(stroke.direction, Math.max(0, Math.min(.28, distance / 285)));
  }

  end(event) {
    const stroke = this.stroke;
    if (stroke?.id !== event.pointerId) return;
    if (!stroke.direction) { this.clear(); return; }
    if (this.frame) cancelAnimationFrame(this.frame);
    stroke.lastY = event.clientY;
    this.draw();
    const distance = (stroke.y - event.clientY) * stroke.direction;
    const velocity = event.timeStamp - stroke.lastTime < 85 ? -stroke.velocity * stroke.direction : 0;
    const commit = distance >= 36 || distance >= 21 && velocity >= .45;
    this.suppressPointer = { id: event.pointerId, until: performance.now() + 350 };
    this.clear();
    if (stroke.preview) this.deck.releaseDrag(commit, velocity);
    else if (commit) this.deck.shuffle(stroke.direction);
  }

  clear() {
    const stroke = this.stroke;
    this.stroke = null;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    delete this.root.dataset.dragging;
    if (stroke && this.root.hasPointerCapture(stroke.id)) this.root.releasePointerCapture(stroke.id);
  }

  cancel() {
    const preview = this.stroke?.preview;
    this.clear();
    if (preview) this.deck.releaseDrag(false);
  }

  destroy() { this.cancel(); this.abort.abort(); }
}
