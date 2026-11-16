import React from 'react';
import { useFlightStore } from '../../state/useFlightStore';
import { FAMOUS_FLIGHTS } from '../../data/famousFlights';
import { getEntry } from '../../data/catalog';

/** The wrapping row of famous-flight shortcuts. The chip for the flight that is loaded is marked. */
export const FamousFlightChips: React.FC<{ compact?: boolean; interactive?: boolean }> = ({ compact = false, interactive = true }) => {
  const fromSlug = useFlightStore((s) => (s.origin ? getEntry(s.origin.id)?.slug : undefined));
  const toSlug = useFlightStore((s) => (s.destination ? getEntry(s.destination.id)?.slug : undefined));
  const engineId = useFlightStore((s) => s.engineId);
  const loadFlight = useFlightStore((s) => s.loadFlight);

  return (
    <div className={`playback-chips${compact ? ' is-scroll' : ''}`}>
      {FAMOUS_FLIGHTS.map((f, i) => {
        const current = f.spec.from === fromSlug && f.spec.to === toSlug && f.spec.engine === engineId;
        return (
          <button
            key={f.id}
            type="button"
            className={`btn playback-chip enter${current ? ' btn-accent' : ''}`}
            style={{ '--i': i } as React.CSSProperties}
            title={f.blurb}
            aria-pressed={current}
            tabIndex={interactive ? 0 : -1}
            onClick={() => loadFlight(f.spec)}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
};
