import React from 'react';
import { useFlightStore } from '../../state/useFlightStore';
import { formatDuration, formatSpeed, formatDistance } from '../../lib/format';
import { usePulse } from '../../lib/motion';
import type { FlightPhase } from '../../physics/flightProfile';

/** The four live readouts. Leaf component: the only one (with the chart cursor) that follows `progress`. */
export const Readouts: React.FC = () => {
  const profile = useFlightStore((s) => s.profile);
  const progress = useFlightStore((s) => s.progress);
  const arrivalCount = useFlightStore((s) => s.arrivalCount);
  const flash = usePulse(arrivalCount, 1100);
  const sample = profile ? profile.atFraction(progress) : null;

  const items: { label: string; value: string; accent?: boolean }[] = [
    { label: 'Ship clock', value: sample ? formatDuration(sample.tau) : '–', accent: true },
    { label: 'Earth clock', value: sample ? formatDuration(sample.t) : '–' },
    { label: 'Speed now', value: sample ? formatSpeed(sample.v) : '–' },
    { label: 'Still to go', value: sample ? formatDistance(sample.remaining) : '–' },
  ];

  return (
    <dl className="playback-readouts">
      {items.map((it, i) => (
        <div key={it.label} className="playback-readout enter" style={{ '--i': i } as React.CSSProperties}>
          <dt>{it.label}</dt>
          <dd
            className={`num${it.accent ? ' is-accent' : ''}${flash ? ' is-flash' : ''}`}
            title={it.value}
          >
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
};

export const PHASE_LABEL: Record<FlightPhase | 'ready', string> = {
  ready: 'Ready to launch',
  accel: 'Speeding up',
  coast: 'Coasting, engines off',
  decel: 'Slowing down',
  warp: 'Inside the warp bubble',
  arrived: 'Arrived',
};

/** Phase chip: pops whenever the phase changes. */
export const PhaseChip: React.FC = () => {
  const phase = useFlightStore((s): FlightPhase | 'ready' =>
    !s.profile || s.progress <= 0 ? 'ready' : s.profile.atFraction(s.progress).phase,
  );
  return (
    <span key={phase} className={`playback-phase is-${phase}`} role="status">
      <span className="playback-phase-dot" aria-hidden="true" />
      {PHASE_LABEL[phase]}
    </span>
  );
};
