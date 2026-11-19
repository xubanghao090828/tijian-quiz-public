/** A fixed swipe area keeps touch capture independent of the moving card faces. */
export class DeckGestures {
  constructor(deck, controls) {
    this.deck = deck;
    this.track = controls.querySelector('[data-card-swipe]');
    this.stroke = null;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.track.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || this.stroke) return;
      this.track.setPointerCapture(event.pointerId);
      this.stroke = { id: event.pointerId, x: event.clientX, y: event.clientY };
      this.track.dataset.pressed = '';
    }, { signal });
    this.track.addEventListener('pointerup', event => {
      const start = this.stroke;
      if (start?.id !== event.pointerId) return;
      this.cancel();
      const distance = event.clientY - start.y;
      if (Math.abs(distance) >= 28 && Math.abs(distance) >= Math.abs(event.clientX - start.x) * 1.3) {
        deck.shuffle(distance < 0 ? 1 : -1);
      }
    }, { signal });
    for (const type of ['pointercancel', 'lostpointercapture']) {
      this.track.addEventListener(type, event => {
        if (this.stroke?.id === event.pointerId) this.cancel();
      }, { signal });
    }
    window.addEventListener('blur', () => this.cancel(), { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.cancel();
    }, { signal });
    controls.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      deck.shuffle(event.key === 'ArrowUp' ? 1 : -1);
    }, { signal });
    controls.querySelector('[data-card-previous]').addEventListener('click', () => deck.previous(), { signal });
    controls.querySelector('[data-card-next]').addEventListener('click', () => deck.next(), { signal });
  }

  cancel() {
    const previous = this.stroke;
    this.stroke = null;
    delete this.track.dataset.pressed;
    if (previous && this.track.hasPointerCapture(previous.id)) this.track.releasePointerCapture(previous.id);
  }

  destroy() {
    this.cancel();
    this.abort.abort();
  }
}
