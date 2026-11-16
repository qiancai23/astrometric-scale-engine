import React from 'react';
import { useFlightStore, AU_TO_METERS, PARSEC_TO_METERS } from '../../state/useFlightStore';
import { getEntry } from '../../data/catalog';
import { formatDistance } from '../../lib/format';
import { bodyPosition, hasEphemeris } from '../../physics/ephemeris';

const CloseIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

/**
 * The card for the object selected on the map: what it is, how far it is, and buttons to fly
 * there or start from there. Positioned next to the object each frame by the overlay driver.
 */
export const ObjectCard: React.FC = () => {
  const selectedId = useFlightStore((s) => s.selectedId);
  const origin = useFlightStore((s) => s.origin);
  const destination = useFlightStore((s) => s.destination);
  const regime = useFlightStore((s) => s.regime);
  // Solar-system distances are for the launch date.
  const day = useFlightStore((s) => s.plan?.launchDay ?? s.departureDay);
  const entry = selectedId ? getEntry(selectedId) : undefined;
  if (!entry || entry.regime !== regime) return null;

  const { setEndpoint, selectObject } = useFlightStore.getState();
  const isOrigin = origin?.id === entry.id;
  const isDestination = destination?.id === entry.id;
  const unit = regime === 'Systemic' ? AU_TO_METERS : PARSEC_TO_METERS;
  let fromOrigin: number | null = null;
  const place = (obj: { name: string; coords: [number, number, number] }): number[] => {
    if (regime !== 'Systemic' || !hasEphemeris(obj.name)) return obj.coords;
    const out = [0, 0, 0];
    bodyPosition(obj.name, day, out);
    return out;
  };
  const here = place(entry.obj);
  const fromSol = regime === 'Systemic' ? Math.hypot(here[0], here[1], here[2]) * unit : entry.distanceFromSolMeters;
  // When the flight starts at the Sun the two distances are the same; show only one.
  if (origin && !isOrigin && getEntry(origin.id)?.slug !== 'sol') {
    const a = place(origin);
    const b = here;
    fromOrigin = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * unit;
  }
  const subtitle = [entry.kindLabel, entry.starType, entry.constellation ? `in ${entry.constellation}` : undefined].filter(Boolean).join(' · ');
  const titleId = `map-card-title-${entry.slug}`;

  return (
    <section className="map-card panel" key={entry.id} aria-labelledby={titleId}>
      <header className="map-card-head">
        <div className="map-card-titles">
          <p className="micro-label map-card-kind">{subtitle}</p>
          <h3 className="map-card-name" id={titleId}>
            {entry.name}
          </h3>
        </div>
        <button type="button" className="btn btn-icon btn-ghost map-card-close" aria-label="Close" onClick={() => selectObject(null)}>
          <CloseIcon />
        </button>
      </header>
      <dl className="map-card-facts">
        <div>
          <dt className="micro-label">From the Sun</dt>
          <dd className="num">{fromSol > 0 ? formatDistance(fromSol) : 'This is the Sun'}</dd>
        </div>
        {fromOrigin !== null && origin && (
          <div>
            <dt className="micro-label">From {origin.name}</dt>
            <dd className="num">{formatDistance(fromOrigin)}</dd>
          </div>
        )}
      </dl>
      {entry.description && <p className="map-card-desc">{entry.description}</p>}
      <div className="map-card-actions">
        {isDestination ? (
          <span className="map-card-note map-card-note--dest">Your destination</span>
        ) : (
          <button type="button" className="btn btn-accent" onClick={() => setEndpoint('destination', entry.id)}>
            Fly here
          </button>
        )}
        {isOrigin ? (
          <span className="map-card-note">Your starting point</span>
        ) : (
          <button type="button" className="btn" onClick={() => setEndpoint('origin', entry.id)}>
            Start here
          </button>
        )}
      </div>
    </section>
  );
};
