import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Motion helpers shared by every panel.
 * The house rule: values never jump. Numbers roll, bars glide, things arrive with a short ease.
 * Everything here stands still when the visitor's system asks for reduced motion.
 */

/* Easing curves (t in 0..1). Match the CSS tokens --ease-out and --ease-in-out in index.css. */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

const subscribeReduced = (onChange: () => void): (() => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};

/** Non-hook check, for code outside React (for example inside a render loop). */
export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(REDUCED_QUERY).matches;

/** True when the visitor's system asks for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, prefersReducedMotion, () => false);
}

export interface TweenOptions {
  /** Milliseconds. Default 600. */
  duration?: number;
  easing?: (t: number) => number;
  /**
   * Interpolate in logarithmic space. Use for quantities that jump across orders of magnitude
   * (a travel time going from 2 days to 40,000 years) so the roll passes through the units
   * instead of crawling and then leaping. Values must be positive; falls back to linear otherwise.
   */
  log?: boolean;
  /** When true the value is applied instantly (use while the value is already animating, e.g. during playback). */
  immediate?: boolean;
}

/**
 * Returns `target`, but animated: whenever `target` changes the returned number glides from
 * its current value to the new one. Re-renders the calling component each frame while moving,
 * so use it in small leaf components.
 */
export function useTween(target: number, options: TweenOptions = {}): number {
  const { duration = 600, easing = easeOutExpo, log = false, immediate = false } = options;
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(target);
  const current = useRef(target);
  const frame = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(frame.current);
    const from = current.current;
    if (reduced || immediate || duration <= 0 || from === target || !Number.isFinite(from) || !Number.isFinite(target)) {
      current.current = target;
      setValue(target);
      return;
    }
    const useLog = log && from > 0 && target > 0;
    const a = useLog ? Math.log(from) : from;
    const b = useLog ? Math.log(target) : target;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = a + (b - a) * easing(t);
      const next = t >= 1 ? target : useLog ? Math.exp(eased) : eased;
      current.current = next;
      setValue(next);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration, easing, log, immediate, reduced]);

  return value;
}

/**
 * True for `duration` ms after `trigger` changes (not on first mount). Use it to replay a CSS
 * animation when a value changes: `className={flash ? 'is-flashing' : ''}`.
 */
export function usePulse(trigger: unknown, duration = 600): boolean {
  const [active, setActive] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setActive(true);
    const id = window.setTimeout(() => setActive(false), duration);
    return () => window.clearTimeout(id);
  }, [trigger, duration]);
  return active;
}

/** True once the component has been mounted for one frame. Use to trigger enter transitions. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return mounted;
}

/** Tracks a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const subscribe = (onChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
    const mq = window.matchMedia(query);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  };
  const get = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches;
  return useSyncExternalStore(subscribe, get, () => false);
}

/** The layout switches from floating desktop panels to the phone/tablet bottom sheet below this width. */
export const COMPACT_QUERY = '(max-width: 1023px)';
export const useIsCompact = (): boolean => useMediaQuery(COMPACT_QUERY);
