/**
 * A pool of absolutely positioned DOM labels for the map, updated imperatively every frame.
 * Labels keep a fixed pixel size at every zoom (they are DOM text, not textures).
 */

/** Width in CSS px of a label: 12px monospace caps (0.6em advance) plus 0.06em tracking. */
export const labelWidth = (text: string): number => text.length * 7.92 + 2;
export const LABEL_HEIGHT = 16;
/** Gap between a dot and its label. */
export const LABEL_GAP = 8;

interface Slot {
  el: HTMLDivElement;
  /** Entry index shown, -1 when free. */
  index: number;
  shown: boolean;
  /** performance.now() when it started hiding. */
  hiddenAt: number;
  x: number;
  y: number;
  keep: boolean;
}

const FADE_MS = 360;

export class LabelPool {
  private slots: Slot[] = [];
  private byIndex = new Map<number, Slot>();
  private container: HTMLDivElement;

  constructor(container: HTMLDivElement, size: number) {
    this.container = container;
    for (let i = 0; i < size; i++) {
      const el = document.createElement('div');
      el.className = 'map-label';
      el.setAttribute('aria-hidden', 'true');
      container.appendChild(el);
      this.slots.push({ el, index: -1, shown: false, hiddenAt: 0, x: -9999, y: -9999, keep: false });
    }
  }

  dispose(): void {
    for (const s of this.slots) {
      if (s.el.parentNode === this.container) this.container.removeChild(s.el);
    }
    this.slots = [];
    this.byIndex.clear();
  }

  /** True when the entry's label was visible last frame (used for hysteresis). */
  isShown(index: number): boolean {
    const s = this.byIndex.get(index);
    return !!s && s.shown;
  }

  /** Start a frame: every label is a loser until `show` is called for it. */
  begin(): void {
    for (const s of this.slots) s.keep = false;
  }

  /** Show (or keep showing) the label for entry `index` with its dot at screen (x, y). */
  show(index: number, text: string, x: number, y: number): boolean {
    let s = this.byIndex.get(index);
    if (!s) {
      s = this.slots.find((c) => c.index === -1);
      if (!s) return false;
      s.index = index;
      s.el.textContent = text;
      s.shown = false;
      this.byIndex.set(index, s);
    }
    s.keep = true;
    this.place(s, x, y);
    if (!s.shown) {
      s.shown = true;
      s.el.classList.add('is-on');
    }
    return true;
  }

  /**
   * End a frame: hide labels that lost their slot (they fade out while following their object),
   * and free slots whose fade has finished.
   */
  end(now: number, positionOf: (index: number, out: { x: number; y: number; ok: boolean }) => void): void {
    const p = { x: 0, y: 0, ok: false };
    for (const s of this.slots) {
      if (s.index === -1 || s.keep) continue;
      if (s.shown) {
        s.shown = false;
        s.hiddenAt = now;
        s.el.classList.remove('is-on');
      }
      positionOf(s.index, p);
      if (p.ok) this.place(s, p.x, p.y);
      if (now - s.hiddenAt > FADE_MS) {
        this.byIndex.delete(s.index);
        s.index = -1;
      }
    }
  }

  /** Hide everything immediately (map change). */
  clear(): void {
    for (const s of this.slots) {
      s.el.classList.remove('is-on');
      s.shown = false;
      s.index = -1;
    }
    this.byIndex.clear();
  }

  private place(s: Slot, x: number, y: number): void {
    const rx = Math.round(x + LABEL_GAP);
    const ry = Math.round(y - LABEL_HEIGHT / 2);
    if (rx === s.x && ry === s.y) return;
    s.x = rx;
    s.y = ry;
    s.el.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
  }
}
