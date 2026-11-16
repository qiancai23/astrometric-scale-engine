import React, { useEffect, useRef, useState } from 'react';
import { useFlightStore } from '../../state/useFlightStore';
import { getEntry } from '../../data/catalog';
import { formatDurationLong } from '../../lib/format';
import { PHASE_LABEL } from './Readouts';
import type { FlightPhase } from '../../physics/flightProfile';

/** Visually hidden live region. Announces start, phase changes and arrival; never every frame. */
export const Announcer: React.FC = () => {
  const [message, setMessage] = useState('');
  const playing = useFlightStore((s) => s.playing);
  const arrivalCount = useFlightStore((s) => s.arrivalCount);
  const phase = useFlightStore((s): FlightPhase | 'ready' =>
    !s.profile || s.progress <= 0 ? 'ready' : s.profile.atFraction(s.progress).phase,
  );
  const firstPlaying = useRef(true);
  const firstArrival = useRef(true);
  const lastPhase = useRef(phase);

  useEffect(() => {
    if (firstPlaying.current) {
      firstPlaying.current = false;
      return;
    }
    if (playing) setMessage('Flight started');
  }, [playing]);

  useEffect(() => {
    const before = lastPhase.current;
    lastPhase.current = phase;
    if (before === phase || !useFlightStore.getState().playing) return;
    if (phase !== 'ready' && phase !== 'arrived' && before !== 'ready') setMessage(PHASE_LABEL[phase]);
  }, [phase]);

  useEffect(() => {
    if (firstArrival.current) {
      firstArrival.current = false;
      return;
    }
    const s = useFlightStore.getState();
    if (!s.profile) return;
    const name = s.destination ? (getEntry(s.destination.id)?.name ?? s.destination.name) : 'the destination';
    setMessage(
      `Arrived at ${name}. You aged ${formatDurationLong(s.profile.totalProperTime)}; Earth aged ${formatDurationLong(s.profile.totalTime)}.`,
    );
  }, [arrivalCount]);

  return (
    <div className="visually-hidden" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
};
