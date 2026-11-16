import React, { useEffect, useMemo, useState } from 'react';
import type { PanelProps } from '../panelProps';
import { selectResult, useFlightStore } from '../../state/useFlightStore';
import { getEntry } from '../../data/catalog';
import type { AstroObject } from '../../types';
import { usePulse } from '../../lib/motion';
import {
  formatAccel,
  formatCount,
  formatDate,
  formatDeltaV,
  formatDistance,
  formatDuration,
  formatDurationLong,
  SECONDS_IN_DAY,
  formatGamma,
  formatSpeed,
  formatWarpFactor,
  sig,
} from '../../lib/format';
import { buildPerspective } from '../../lib/perspective';
import { RollingValue } from '../common/RollingValue';
import { TwinClocks } from './TwinClocks';
import { CrossFade } from './CrossFade';
import { PerspectiveList } from './PerspectiveList';
import '../../styles/answer.css';

const NBSP = ' ';

const nameOf = (obj: AstroObject): string => getEntry(obj.id)?.name ?? obj.name;

/** "1 g", "0.1 g": formatAccel without trailing zeros. */
const accelText = (g: number): string => `${parseFloat(formatAccel(g))}${NBSP}g`;

/** The stat tile value steps down in size with the length of its text. */
const tileSize = (text: string): string => {
  const n = text.length;
  if (n <= 7) return 'var(--text-title)';
  if (n <= 8) return 'var(--text-body)';
  if (n <= 9) return 'var(--text-small)';
  return 'var(--text-micro)';
};

interface TileProps {
  label: string;
  value: number;
  format: (n: number) => string;
  log?: boolean;
  quiet?: boolean;
  sub?: string;
  index: number;
}

const Tile: React.FC<TileProps> = ({ label, value, format, log, quiet, sub, index }) => (
  <div className="answer-tile enter" style={{ ['--i' as string]: index }}>
    <div className="answer-tile-label">{label}</div>
    <RollingValue
      value={value}
      format={format}
      log={log}
      className={`answer-tile-value num${quiet ? ' is-quiet' : ''}`}
      style={{ fontSize: tileSize(format(value)) }}
    />
    {sub && <div className="answer-tile-sub">{sub}</div>}
  </div>
);

/** Screen-reader summary of the two clocks; settles 400 ms after the flight stops changing. */
const useSettled = (text: string): string => {
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(text), 400);
    return () => window.clearTimeout(id);
  }, [text]);
  return settled;
};

export const AnswerPanel: React.FC<PanelProps> = ({ compact }) => {
  const profile = useFlightStore((s) => s.profile);
  const origin = useFlightStore((s) => s.origin);
  const destination = useFlightStore((s) => s.destination);
  const distanceMeters = useFlightStore((s) => s.distanceMeters);
  const regime = useFlightStore((s) => s.regime);
  const drive = useFlightStore((s) => s.driveCore);
  const accelerationG = useFlightStore((s) => s.accelerationG);
  const warpFactor = useFlightStore((s) => s.warpFactor);
  const energy = useFlightStore((s) => selectResult(s)?.energyExajoules ?? 0);
  const plan = useFlightStore((s) => s.plan);
  const flightRevision = useFlightStore((s) => s.flightRevision);
  const arrivalCount = useFlightStore((s) => s.arrivalCount);

  const flightFlash = usePulse(flightRevision);
  const arrivalFlash = usePulse(arrivalCount, 900);
  const arrivedShown = usePulse(arrivalCount, 5000);

  const originName = origin ? nameOf(origin) : '';
  const destinationName = destination ? nameOf(destination) : '';

  const curved = plan !== null && plan.model !== 'direct';

  const rows = useMemo(
    () =>
      profile
        ? buildPerspective({
            distanceMeters,
            earthSeconds: profile.totalTime,
            shipSeconds: profile.totalProperTime,
            energyExajoules: energy,
            drive,
            regime,
            originName,
            destinationName,
            curvedPath: curved,
          })
        : [],
    [profile, distanceMeters, energy, drive, regime, originName, destinationName, curved],
  );

  const summary = profile
    ? `You age ${formatDurationLong(profile.totalProperTime)}. Earth ages ${formatDurationLong(profile.totalTime)}.`
    : '';
  const spoken = useSettled(summary);

  if (!profile || !origin || !destination) {
    return (
      <div className="answer-panel" style={{ padding: 'var(--panel-padding)' }}>
        <div className="micro-label">The answer</div>
        <p className="answer-empty enter" style={{ ['--i' as string]: 1 }}>
          Pick two places to see how long the trip takes.
        </p>
      </div>
    );
  }

  const title =
    plan && (plan.model === 'ballistic' || plan.model === 'lunar')
      ? `${originName} to ${destinationName} by chemical rocket`
      : plan && plan.model === 'spiral'
        ? `${originName} to ${destinationName} by ion drive`
        : drive === 'Warp'
          ? `${originName} to ${destinationName} at ${formatWarpFactor(warpFactor)}`
          : `${originName} to ${destinationName} at ${accelText(accelerationG)}`;

  /* ----- dates, and the fuel warning ----- */
  let dateLine: string | null = null;
  if (plan) {
    dateLine = `Leaves ${formatDate(plan.launchDay)} · arrives ${formatDate(plan.arrivalDay)}`;
    if (plan.waitDays >= 1) {
      dateLine += `, after waiting ${formatDuration(plan.waitDays * SECONDS_IN_DAY)} ${plan.model === 'spiral' ? 'for the planets to line up' : 'for a launch window'}`;
    }
  }
  const short =
    plan && !plan.feasible && plan.dvNeededKms !== null && plan.dvBudgetKms !== null
      ? `This flight needs ${formatDeltaV(plan.dvNeededKms)} of velocity change, but the engine carries ${formatDeltaV(plan.dvBudgetKms)}.`
      : null;

  /* ----- the one-line meaning ----- */
  let sentence: React.ReactNode;
  let sentenceId: string;
  const gapShare = profile.totalTime > 0 ? profile.timeGap / profile.totalTime : 0;
  const gapText = formatDurationLong(profile.timeGap);
  if (drive === 'Warp') {
    sentenceId = 'warp';
    sentence = 'The same on the ship and on Earth: a warp bubble has no time dilation.';
  } else if (gapShare >= 0.005) {
    sentenceId = `younger:${gapText}`;
    sentence = (
      <>
        You step off <strong>{gapText} younger</strong> than everyone who stayed home.
      </>
    );
  } else {
    sentenceId = `slow:${gapText}:${regime}`;
    sentence = (
      <>
        Too slow for relativity to matter: your clock ends up <strong>{gapText}</strong> behind.{' '}
        {regime === 'Interstellar'
          ? 'Try a faster engine to see the clocks split.'
          : curved
            ? 'Try the antimatter rocket, or a star, to see the clocks split.'
            : 'Try a star to see the clocks split.'}
      </>
    );
  }

  /* ----- gloss under the tiles ----- */
  let gloss: string | null = null;
  if (drive === 'Sublight') {
    const excess = profile.peakGamma - 1;
    if (profile.peakGamma >= 1.01) {
      gloss = `At peak speed, one day on board is ${sig(profile.peakGamma, 2)} days on Earth.`;
    } else if (excess > 0 && Number.isFinite(excess)) {
      gloss = `Time on board runs the same as on Earth, to within one part in ${formatCount(1 / excess, 2)}.`;
    } else {
      gloss = 'Time on board runs the same as on Earth.';
    }
  }

  const clockFlash = flightFlash || arrivalFlash;

  return (
    <div className={`answer-panel${compact ? ' is-compact' : ''}`} style={{ padding: 'var(--panel-padding)' }}>
      <div className="answer-visually-hidden visually-hidden" role="status" aria-live="polite">
        {spoken}
      </div>

      <header className="answer-head enter" style={{ ['--i' as string]: 0 }}>
        <div className="micro-label">The answer</div>
        <h2 className="answer-title">{title}</h2>
        {dateLine && <p className="answer-dates">{dateLine}</p>}
      </header>

      {short && (
        <p className="answer-warning enter" style={{ ['--i' as string]: 1 }} role="note">
          {short}
        </p>
      )}

      <div className={`answer-arrival${arrivedShown ? ' is-on' : ''}`} aria-hidden="true">
        <div className="answer-arrival-inner">
          <span className="answer-arrival-line">Arrived at {destinationName}.</span>
        </div>
      </div>

      <TwinClocks profile={profile} flash={clockFlash} />

      <div className="answer-sentence enter" style={{ ['--i' as string]: 3 }}>
        <CrossFade id={sentenceId}>
          <p>{sentence}</p>
        </CrossFade>
      </div>

      <div className="answer-tiles">
        <Tile
          index={4}
          label={!curved ? 'Peak speed' : plan?.model === 'lunar' ? 'Top speed round Earth' : 'Top speed round the Sun'}
          value={profile.peakVelocity}
          format={formatSpeed}
          log
        />
        {curved && plan && plan.dvNeededKms !== null ? (
          <Tile
            index={5}
            label="Fuel needed"
            value={plan.dvNeededKms}
            format={formatDeltaV}
            sub={plan.dvBudgetKms !== null ? `of ${formatDeltaV(plan.dvBudgetKms)}` : undefined}
          />
        ) : (
          <Tile
            index={5}
            label="Lorentz γ"
            value={drive === 'Warp' ? 1 : profile.peakGamma}
            format={formatGamma}
            quiet={drive === 'Warp'}
            sub={drive === 'Warp' ? 'none' : undefined}
          />
        )}
        <Tile index={6} label={curved ? 'Path flown' : 'Distance'} value={distanceMeters} format={formatDistance} log />
      </div>
      {gloss && (
        <p className="answer-gloss enter" style={{ ['--i' as string]: 7 }}>
          {gloss}
        </p>
      )}

      <PerspectiveList rows={rows} startIndex={8} />
    </div>
  );
};
