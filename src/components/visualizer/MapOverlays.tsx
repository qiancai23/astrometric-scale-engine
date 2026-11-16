import React from 'react';
import { useFlightStore } from '../../state/useFlightStore';
import { ObjectCard } from './ObjectCard';
import type { MapRuntime, OverlayElements } from './mapRuntime';

type Key = keyof OverlayElements;

/** Callback ref that registers an element with the runtime so the render loop can move it. */
const reg =
  <T extends HTMLElement>(runtime: MapRuntime, key: Key) =>
  (el: T | null) => {
    (runtime.dom as unknown as Record<string, HTMLElement | null>)[key] = el;
  };

const ZoomInIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <path d="M9 4v10M4 9h10" />
  </svg>
);
const ZoomOutIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <path d="M4 9h10" />
  </svg>
);
const FrameIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6.5V3h3.5M11.5 3H15v3.5M15 11.5V15h-3.5M6.5 15H3v-3.5" />
    <circle cx="6.5" cy="11" r="1.2" />
    <circle cx="11.5" cy="7" r="1.2" />
    <path d="M7.5 10.2l3-2.4" />
  </svg>
);
const ArrowIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 6h8M7 3l3 3-3 3" />
  </svg>
);

const ZOOM_STEP = 0.55;

/**
 * Everything drawn over the canvas in DOM: rings, labels, markers, the ship, the object card,
 * the beacon, the scale bar, the zoom buttons and the first-visit hint. Elements are rendered
 * once; the overlay driver moves them every frame.
 */
export const MapOverlays: React.FC<{ runtime: MapRuntime; showHint: boolean; coarse: boolean }> = ({ runtime, showHint, coarse }) => {
  const origin = useFlightStore((s) => s.origin);
  const destination = useFlightStore((s) => s.destination);
  const warp = useFlightStore((s) => s.driveCore === 'Warp');
  const arrivalCount = useFlightStore((s) => s.arrivalCount);
  const selectedId = useFlightStore((s) => s.selectedId);

  const zoom = (ratio: number) => {
    runtime.touch();
    runtime.pendingZoom *= ratio;
  };

  return (
    <div className="map-overlay">
      <div className="map-label-layer" ref={reg<HTMLDivElement>(runtime, 'labelLayer')} />

      {/* Mid-flight markers */}
      <div className="map-anchor is-hidden" ref={reg<HTMLDivElement>(runtime, 'markerA')} aria-hidden="true">
        <span className="map-marker-diamond" />
        <span className="map-marker-label is-above" ref={reg<HTMLSpanElement>(runtime, 'markerALabel')} />
      </div>
      <div className="map-anchor is-hidden" ref={reg<HTMLDivElement>(runtime, 'markerB')} aria-hidden="true">
        <span className="map-marker-diamond" />
        <span className="map-marker-label is-above" ref={reg<HTMLSpanElement>(runtime, 'markerBLabel')} />
      </div>

      {/* Origin and destination */}
      <div className="map-anchor is-hidden" ref={reg<HTMLDivElement>(runtime, 'originRing')} aria-hidden="true">
        <span className="map-ring map-ring--origin" />
      </div>
      <div className="map-anchor is-hidden" ref={reg<HTMLDivElement>(runtime, 'destRing')} aria-hidden="true">
        <span className="map-ring map-ring--dest" />
      </div>
      <div className="map-anchor is-hidden" ref={reg<HTMLDivElement>(runtime, 'originLabel')} aria-hidden="true">
        <span className="map-endlabel map-endlabel--origin">
          <span className="map-endlabel-tag">origin</span>
          <span className="map-endlabel-name">{origin?.name ?? ''}</span>
        </span>
      </div>
      <div className="map-anchor is-hidden" ref={reg<HTMLDivElement>(runtime, 'destLabel')} aria-hidden="true">
        <span className="map-endlabel map-endlabel--dest">
          <span className="map-endlabel-tag">destination</span>
          <span className="map-endlabel-name">{destination?.name ?? ''}</span>
        </span>
      </div>

      {/* Arrival burst (re-keyed so its animation replays on every arrival) */}
      <div className="map-anchor is-hidden" ref={reg<HTMLDivElement>(runtime, 'burst')} aria-hidden="true">
        <span className="map-burst" key={arrivalCount}>
          <span className="map-burst-ring" />
          <span className="map-burst-ring" />
          <span className="map-burst-ring" />
        </span>
      </div>

      {/* The ship */}
      <div className="map-anchor is-hidden" ref={reg<HTMLDivElement>(runtime, 'ship')} aria-hidden="true">
        <span className={`map-ship${warp ? ' is-warp' : ''}`}>
          <span className="map-ship-halo" />
          <span className="map-ship-core" />
        </span>
      </div>
      <div className="map-anchor is-hidden" ref={reg<HTMLDivElement>(runtime, 'shipTag')} aria-hidden="true">
        <span className="map-shiptag num" />
      </div>

      {/* Beacon for the search result under the pointer */}
      <div className="map-anchor is-hidden" ref={reg<HTMLDivElement>(runtime, 'beacon')} aria-hidden="true">
        <span className="map-beacon-ring" />
        <span className="map-beacon-ring" />
        <span className="map-beacon-dot" />
      </div>
      <div className="map-anchor is-hidden" ref={reg<HTMLDivElement>(runtime, 'beaconChip')} aria-hidden="true">
        <span className="map-chip">
          <span className="map-chip-arrow" ref={reg<HTMLSpanElement>(runtime, 'beaconArrow')}>
            <ArrowIcon />
          </span>
          <span ref={reg<HTMLSpanElement>(runtime, 'beaconChipName')} />
        </span>
      </div>

      {/* Hover and selection */}
      <div className="map-anchor is-hidden" ref={reg<HTMLDivElement>(runtime, 'hoverRing')} aria-hidden="true">
        <span className="map-hover-ring" />
      </div>
      <div className="map-anchor is-hidden" ref={reg<HTMLDivElement>(runtime, 'reticle')} aria-hidden="true">
        <span className="map-reticle" key={selectedId ?? 'none'}>
          <span className="map-reticle-c map-reticle-c1" />
          <span className="map-reticle-c map-reticle-c2" />
          <span className="map-reticle-c map-reticle-c3" />
          <span className="map-reticle-c map-reticle-c4" />
        </span>
      </div>
      <div className="map-anchor is-hidden" ref={reg<HTMLDivElement>(runtime, 'hoverLabel')} aria-hidden="true">
        <span className="map-hover-label">
          <span className="map-hover-name" ref={reg<HTMLSpanElement>(runtime, 'hoverName')} />
          <span className="map-hover-meta" ref={reg<HTMLSpanElement>(runtime, 'hoverMeta')} />
        </span>
      </div>

      {/* Object card */}
      <div className="map-anchor map-card-anchor is-hidden" ref={reg<HTMLDivElement>(runtime, 'card')}>
        <ObjectCard />
      </div>

      {/* Chrome */}
      <div className="map-scale" aria-hidden="true">
        <span className="map-scale-label num" ref={reg<HTMLSpanElement>(runtime, 'scaleLabel')} />
        <div className="map-scale-bar" ref={reg<HTMLDivElement>(runtime, 'scaleBar')} />
      </div>

      <div className="map-controls">
        <button type="button" className="btn btn-icon map-control" aria-label="Zoom in" onClick={() => zoom(ZOOM_STEP)}>
          <ZoomInIcon />
        </button>
        <button type="button" className="btn btn-icon map-control" aria-label="Zoom out" onClick={() => zoom(1 / ZOOM_STEP)}>
          <ZoomOutIcon />
        </button>
        <button
          type="button"
          className="btn btn-icon map-control"
          aria-label="Frame the flight"
          onClick={() => {
            runtime.touch();
            useFlightStore.getState().frameFlight();
          }}
        >
          <FrameIcon />
        </button>
      </div>

      <p className={`map-hint${showHint ? '' : ' is-gone'}`} aria-hidden={!showHint}>
        <span className="map-hint-text">
          {coarse ? 'Drag · pinch · tap a star' : 'Drag to rotate · scroll to zoom · click a star to fly there'}
        </span>
      </p>
    </div>
  );
};
