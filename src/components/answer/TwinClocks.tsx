import React from 'react';
import { RollingValue } from '../common/RollingValue';
import { formatDuration } from '../../lib/format';
import { useFlightStore } from '../../state/useFlightStore';
import type { FlightProfile } from '../../physics/flightProfile';

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0);

/** Font size for the clock value, stepped down by the length of its text so it never overflows. */
const clockSize = (text: string): string => {
  const n = text.length;
  if (n <= 9) return 'var(--text-display)';
  if (n <= 11) return 'calc(var(--text-display) * 0.82)';
  if (n <= 13) return 'calc(var(--text-display) * 0.68)';
  return 'calc(var(--text-display) * 0.56)';
};

interface BarProps {
  kind: 'ship' | 'earth';
  profile: FlightProfile;
}

/**
 * One bar under a clock. At rest it is a single bar whose width glides to its new length.
 * During playback it shows a dim full-length layer (the final value) and a bright layer that has
 * grown to the current moment. This leaf is the only thing here that follows `progress`.
 */
const ClockBar: React.FC<BarProps> = ({ kind, profile }) => {
  const progress = useFlightStore((s) => s.progress);
  const total = profile.totalTime;
  const finalRatio = kind === 'earth' ? 1 : total > 0 ? clamp01(profile.totalProperTime / total) : 1;
  const live = progress > 0 && progress < 1;
  const liveRatio = kind === 'earth' ? progress : total > 0 ? clamp01(profile.atFraction(progress).tau / total) : 0;
  return (
    <div className="answer-bar-track" aria-hidden="true">
      <div
        className={`answer-bar answer-bar-${kind}${live ? ' is-dim' : ''}`}
        style={{ width: `${finalRatio * 100}%` }}
      />
      {live && (
        <div className={`answer-bar answer-bar-live answer-bar-${kind}`} style={{ width: `${liveRatio * 100}%` }} />
      )}
    </div>
  );
};

interface ClockProps {
  kind: 'ship' | 'earth';
  label: string;
  seconds: number;
  profile: FlightProfile;
  flash: boolean;
  index: number;
}

const Clock: React.FC<ClockProps> = ({ kind, label, seconds, profile, flash, index }) => (
  <div className="answer-clock enter" style={{ ['--i' as string]: index }}>
    <div className="answer-clock-row">
      <span className="answer-clock-label">{label}</span>
      <RollingValue
        value={seconds}
        format={formatDuration}
        log
        duration={800}
        className={`answer-clock-value answer-clock-${kind}${flash ? ' is-flashing' : ''}`}
        style={{ fontSize: clockSize(formatDuration(seconds)) }}
      />
    </div>
    <ClockBar kind={kind} profile={profile} />
  </div>
);

interface TwinClocksProps {
  profile: FlightProfile;
  flash: boolean;
}

export const TwinClocks: React.FC<TwinClocksProps> = ({ profile, flash }) => (
  <div className="answer-clocks">
    <Clock kind="ship" label="You age" seconds={profile.totalProperTime} profile={profile} flash={flash} index={1} />
    <Clock kind="earth" label="Earth ages" seconds={profile.totalTime} profile={profile} flash={flash} index={2} />
  </div>
);
