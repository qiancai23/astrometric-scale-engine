import { useEffect } from 'react';
import { useFlightStore, PLAYBACK_BASE_SECONDS } from '../state/useFlightStore';

/**
 * The clock behind "fly this flight". Mount once (in the app shell).
 * While the store's `playing` flag is on, it advances `progress` every animation frame so the
 * map, the chart and both clocks move together. Playback is linear in Earth time.
 */
export function usePlaybackDriver(): void {
  const playing = useFlightStore((s) => s.playing);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // Cap the step so a background tab does not leap to the destination on return.
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const { playbackRate, advance } = useFlightStore.getState();
      advance((dt * playbackRate) / PLAYBACK_BASE_SECONDS);
      if (useFlightStore.getState().playing) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  // Space bar toggles playback when focus is not in a text field or on a control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || el?.isContentEditable) return;
      e.preventDefault();
      useFlightStore.getState().togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Playback length in wall-clock seconds at the given rate. */
export const playbackSeconds = (rate: number): number => PLAYBACK_BASE_SECONDS / rate;
