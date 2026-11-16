import React, { useState } from 'react';
import type { PanelProps } from '../panelProps';
import { useFlightStore, PLAYBACK_BASE_SECONDS, PLAYBACK_RATES } from '../../state/useFlightStore';
import { formatDuration } from '../../lib/format';
import { SpeedChart } from './SpeedChart';
import { Readouts, PhaseChip } from './Readouts';
import { FamousFlightChips } from './FamousFlightChips';
import { Announcer } from './Announcer';
import { PlayIcon, PauseIcon, ReplayIcon, ChevronIcon } from './icons';
import '../../styles/playback.css';

/** Round transport button: play, pause or replay, cross-fading between the three icons. */
const TransportButton: React.FC = () => {
  const playing = useFlightStore((s) => s.playing);
  const atEnd = useFlightStore((s) => s.progress >= 1);
  const hasProfile = useFlightStore((s) => s.profile !== null);
  const togglePlay = useFlightStore((s) => s.togglePlay);
  const mode = playing ? 'pause' : atEnd ? 'replay' : 'play';
  const label = mode === 'pause' ? 'Pause the flight' : mode === 'replay' ? 'Fly it again' : 'Play the flight';
  return (
    <button
      type="button"
      className="btn btn-accent btn-icon playback-transport"
      aria-label={label}
      title={label}
      disabled={!hasProfile}
      onClick={togglePlay}
    >
      <span className={`playback-ico${mode === 'play' ? ' is-on' : ''}`}><PlayIcon /></span>
      <span className={`playback-ico${mode === 'pause' ? ' is-on' : ''}`}><PauseIcon /></span>
      <span className={`playback-ico${mode === 'replay' ? ' is-on' : ''}`}><ReplayIcon /></span>
    </button>
  );
};

const RateSelector: React.FC = () => {
  const rate = useFlightStore((s) => s.playbackRate);
  const setPlaybackRate = useFlightStore((s) => s.setPlaybackRate);
  return (
    <div className="playback-rates" role="group" aria-label="Playback speed">
      {PLAYBACK_RATES.map((r) => (
        <button
          key={r}
          type="button"
          className="playback-rate"
          aria-pressed={rate === r}
          onClick={() => setPlaybackRate(r)}
        >
          {r}×
        </button>
      ))}
    </div>
  );
};

/** State A: before the first playback. */
const LaunchPrompt: React.FC<{ compact: boolean }> = ({ compact }) => {
  const profile = useFlightStore((s) => s.profile);
  const rate = useFlightStore((s) => s.playbackRate);
  const play = useFlightStore((s) => s.play);
  const seconds = Math.round(PLAYBACK_BASE_SECONDS / rate);
  return (
    <div className="playback-launch">
      <div className="playback-launch-row">
        <button type="button" className="btn btn-solid playback-fly" disabled={!profile} onClick={play}>
          <PlayIcon size={16} />
          Fly this flight
        </button>
        {profile && (
          <p className="playback-launch-text">
            Watch the ship cross, with both clocks running. {formatDuration(profile.totalTime)} in {seconds} seconds.
          </p>
        )}
      </div>
      <div className="micro-label playback-launch-label">Or try a famous flight</div>
      <FamousFlightChips compact={compact} />
    </div>
  );
};

/** State B: flying or flown. */
const Transport: React.FC<{ compact: boolean }> = ({ compact }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="playback-flying">
      <div className="playback-transport-row">
        <TransportButton />
        <RateSelector />
        <PhaseChip />
        <button
          type="button"
          className="btn btn-ghost playback-famous-toggle"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          Famous flights
          <span className={`playback-chevron${open ? ' is-open' : ''}`}><ChevronIcon /></span>
        </button>
      </div>
      <Readouts />
      <div className={`playback-drawer${open ? ' is-open' : ''}`} aria-hidden={!open}>
        <div className="playback-drawer-inner">
          <FamousFlightChips compact={compact} interactive={open} />
        </div>
      </div>
    </div>
  );
};

export const PlaybackPanel: React.FC<PanelProps> = ({ compact = false }) => {
  const active = useFlightStore((s) => s.hasFlown || s.progress > 0);
  const profile = useFlightStore((s) => s.profile);
  const showChart = active || !compact || !profile;

  return (
    <div className={`playback-root${compact ? ' is-compact' : ''}`}>
      <Announcer />
      {profile && (
        <div key={active ? 'b' : 'a'} className="playback-swap">
          {active ? <Transport compact={compact} /> : <LaunchPrompt compact={compact} />}
        </div>
      )}
      {showChart && <SpeedChart compact={compact} />}
    </div>
  );
};
