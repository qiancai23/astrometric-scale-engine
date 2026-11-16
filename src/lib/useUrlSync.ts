import { useEffect } from 'react';
import { useFlightStore, specFromState } from '../state/useFlightStore';
import { buildFlightQuery, buildFlightUrl } from './urlState';
import { getEntry } from '../data/catalog';
import { getEngine } from '../data/engines';

/**
 * Keeps the page address and the browser-tab title in step with the current flight, so the
 * address bar is always a shareable link. Mount once (in the app shell).
 * Reading a flight *from* the address happens once at startup, in useFlightStore.
 */
export function useUrlSync(): void {
  useEffect(() => {
    let timer = 0;
    const write = () => {
      const state = useFlightStore.getState();
      const spec = specFromState(state);
      if (!spec) return;
      const query = buildFlightQuery(spec);
      if (query !== window.location.search) {
        window.history.replaceState(null, '', `${window.location.pathname}${query}`);
      }
      const from = state.origin ? getEntry(state.origin.id)?.name ?? state.origin.name : '';
      const to = state.destination ? getEntry(state.destination.id)?.name ?? state.destination.name : '';
      document.title = `${from} to ${to} by ${getEngine(state.engineId).label.toLowerCase()} · Astrometric Scale Engine`;
    };
    write();
    const unsubscribe = useFlightStore.subscribe((state, previous) => {
      if (state.flightRevision === previous.flightRevision) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(write, 250);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);
}

/** The shareable address of the current flight, or the bare page address when there is no route. */
export function currentFlightUrl(): string {
  const spec = specFromState(useFlightStore.getState());
  return spec ? buildFlightUrl(spec) : window.location.href;
}
