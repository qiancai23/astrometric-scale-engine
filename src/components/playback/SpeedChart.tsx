import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFlightStore } from '../../state/useFlightStore';
import {
  chartPosition,
  fractionFromChartPosition,
  sampleProfile,
  FlightProfile,
  FlightSample,
  TimeAxis,
} from '../../physics/flightProfile';
import { formatDuration, formatSpeed } from '../../lib/format';

const PAD = 5; // horizontal padding inside the svg so the end dots are not clipped
const TOP = 6; // headroom above the peak speed
/* Orbit-following flights keep a strip clear above and below the line for the two scale labels. */
const ORBIT_TOP = 17;
const ORBIT_BOTTOM = 15;

interface Geometry {
  width: number;
  height: number;
  base: number;
  xOf: (position: number) => number;
  yOf: (sample: FlightSample) => number;
  /** Orbit-following flights only: the speeds at the lowest and the highest point of the line. */
  scale: { slowest: number; fastest: number } | null;
}

/** Flights that follow an orbit (coasting or spiralling): speed changes smoothly and never reaches zero. */
const orbitKind = (profile: FlightProfile | null): 'ballistic' | 'spiral' | null => {
  const kind = profile?.trajectory?.kind;
  return kind === 'ballistic' || kind === 'spiral' ? kind : null;
};

/** Slowest and fastest speed of an orbit-following flight, and its speed just before arrival. */
const orbitSpeeds = (profile: FlightProfile): { lo: number; hi: number; end: number } => {
  let lo = Infinity;
  let hi = 0;
  for (let k = 0; k <= 200; k++) {
    // Stop just short of the end: the "arrived" sample reports speed 0.
    const v = profile.atFraction(Math.min(k / 200, 1 - 1e-9)).v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { lo, hi, end: profile.atFraction(1 - 1e-9).v };
};

const makeGeometry = (profile: FlightProfile, width: number, height: number): Geometry => {
  const base = height - 3;
  const xOf = (p: number) => PAD + p * (width - 2 * PAD);
  const peak = profile.peakVelocity > 0 ? profile.peakVelocity : 1;

  if (orbitKind(profile)) {
    // Measured from zero the curve would sit flat along the top (Earth to Mars swings between
    // about 21 and 33 km/s). The line spans the slowest to the fastest speed between two label
    // strips, and each strip names the speed at its end of the line.
    const { lo, hi, end } = orbitSpeeds(profile);
    const top = hi > 0 ? hi : 1;
    const low = Math.min(lo, top * 0.96);
    const lineSpan = Math.max(base - ORBIT_BOTTOM - ORBIT_TOP, 1);
    return {
      width,
      height,
      base,
      xOf,
      // The final burn is an instant: keep the line at the speed it reached, not the "arrived" 0.
      yOf: (s) => {
        const v = s.phase === 'arrived' ? end : s.v;
        const u = (v - low) / Math.max(top - low, 1e-9);
        return base - ORBIT_BOTTOM - Math.min(Math.max(u, 0), 1) * lineSpan;
      },
      scale: { slowest: lo, fastest: top },
    };
  }

  return {
    width,
    height,
    base,
    xOf,
    // The "arrived" sample reports speed 0; a warp ship does not slow down at the end, so keep it level.
    yOf: (s) => {
      const v = s.phase === 'arrived' && profile.drive === 'Warp' ? peak : s.v;
      return base - Math.min(v / peak, 1) * (base - TOP);
    },
    scale: null,
  };
};

const pathOf = (points: [number, number][]): string =>
  points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join('');

/** The cursor, the flown part of the curve and its fill. The only part of the chart that follows `progress`. */
const ChartCursor: React.FC<{
  profile: FlightProfile;
  axis: TimeAxis;
  geo: Geometry;
  line: string;
  area: string;
  clipId: string;
  scrubbing: boolean;
}> = ({ profile, axis, geo, line, area, clipId, scrubbing }) => {
  const progress = useFlightStore((s) => s.progress);
  const cx = geo.xOf(chartPosition(profile, progress, axis));
  const sample = profile.atFraction(progress);
  const cy = geo.yOf(sample);
  const show = progress > 0 || scrubbing;
  return (
    <>
      <clipPath id={clipId}>
        <rect x={0} y={0} width={show ? cx : 0} height={geo.height} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <path d={area} className="playback-chart-area" />
        <path d={line} className="playback-chart-flown" />
      </g>
      {show && (
        <g className="playback-chart-cursor">
          <line x1={cx} x2={cx} y1={0} y2={geo.base} className="playback-chart-cursor-line" />
          <circle cx={cx} cy={cy} r={8} className="playback-chart-cursor-glow" />
          <circle cx={cx} cy={cy} r={3.5} className="playback-chart-cursor-dot" />
        </g>
      )}
    </>
  );
};

export const SpeedChart: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const profile = useFlightStore((s) => s.profile);
  const flightRevision = useFlightStore((s) => s.flightRevision);
  const routeRevision = useFlightStore((s) => s.routeRevision);
  const seek = useFlightStore((s) => s.seek);
  const pct = useFlightStore((s) => Math.round(s.progress * 100));

  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [axis, setAxis] = useState<TimeAxis>('linear');
  const [scrubbing, setScrubbing] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const userChose = useRef(false);
  const orbit = orbitKind(profile);
  const flyby = useFlightStore((s) => s.plan?.arrivalMode === 'flyby');
  const frame = profile?.trajectory?.frame ?? null;
  // Orbit-following flights have no burns worth stretching: always even time.
  const axisShown: TimeAxis = orbit ? 'linear' : axis;
  const lastRoute = useRef(routeRevision);
  const drag = useRef<{ wasPlaying: boolean } | null>(null);
  const clipId = `pb-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const height = orbitKind(profile) ? (compact ? 64 : 72) : compact ? 44 : 56;

  /* The wrapper is always mounted, so this observer is attached once and survives the empty state. */
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Pick the time axis for each new flight, unless the visitor chose one for this route. */
  useEffect(() => {
    if (lastRoute.current !== routeRevision) {
      lastRoute.current = routeRevision;
      userChose.current = false;
    }
    if (userChose.current || !profile) return;
    setAxis(profile.drive === 'Sublight' && !orbitKind(profile) && profile.accelEndFraction < 0.03 ? 'log' : 'linear');
  }, [profile, flightRevision, routeRevision]);

  const chooseAxis = (next: TimeAxis) => {
    userChose.current = true;
    setAxis(next);
  };

  const geo = useMemo(() => (profile && width > 0 ? makeGeometry(profile, width, height) : null), [profile, width, height]);

  const paths = useMemo(() => {
    if (!profile || !geo) return null;
    const samples = sampleProfile(profile, 160, axisShown);
    if (samples.length < 2) return null;
    const pts = samples.map((s): [number, number] => [geo.xOf(chartPosition(profile, s.fraction, axisShown)), geo.yOf(s)]);
    const line = pathOf(pts);
    const area = `${line}L${pts[pts.length - 1][0].toFixed(1)},${geo.base}L${pts[0][0].toFixed(1)},${geo.base}Z`;
    // On an orbit there are no phase boundaries: a coasting orbit is one long coast (shaded
    // edge to edge), a spiral is one long burn (unshaded).
    const bounds: number[] = profile.drive === 'Warp' || orbit
      ? []
      : profile.hasCoast
        ? [profile.accelEndFraction, profile.decelStartFraction]
        : [0.5];
    const xs = bounds.map((f) => geo.xOf(chartPosition(profile, f, axisShown)));
    const band: [number, number] | null = orbit === 'ballistic'
      ? [geo.xOf(0), geo.xOf(1)]
      : !orbit && profile.drive === 'Sublight' && profile.hasCoast && xs.length === 2
        ? [xs[0], xs[1]]
        : null;
    return { line, area, xs, band };
  }, [profile, geo, axisShown, orbit]);


  /* ----- pointer scrubbing ----- */
  const fractionAt = useCallback(
    (clientX: number): number => {
      const el = wrapRef.current;
      if (!el || !profile) return 0;
      const rect = el.getBoundingClientRect();
      const pos = (clientX - rect.left - PAD) / Math.max(rect.width - 2 * PAD, 1);
      return fractionFromChartPosition(profile, Math.min(Math.max(pos, 0), 1), axisShown);
    },
    [profile, axisShown],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!profile || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const st = useFlightStore.getState();
    drag.current = { wasPlaying: st.playing };
    if (st.playing) st.pause();
    setScrubbing(true);
    setHover(null);
    seek(fractionAt(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!profile) return;
    if (drag.current) {
      seek(fractionAt(e.clientX));
    } else if (e.pointerType === 'mouse') {
      setHover(e.clientX - e.currentTarget.getBoundingClientRect().left);
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setScrubbing(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const st = useFlightStore.getState();
    if (d.wasPlaying && st.progress < 1) st.play();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!profile) return;
    const now = useFlightStore.getState().progress;
    const step = e.shiftKey ? 0.1 : 0.01;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = now + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = now - step;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 1;
    if (next === null) return;
    e.preventDefault();
    seek(next);
  };

  /* ----- derived text ----- */
  const sampleAtPct = profile ? profile.atFraction(pct / 100) : null;
  const valueText = sampleAtPct
    ? `${pct} percent: ship clock ${formatDuration(sampleAtPct.tau)}, speed ${formatSpeed(sampleAtPct.v)}`
    : undefined;

  const hoverSample = useMemo(
    () => (hover !== null && profile ? profile.atFraction(fractionAt(hover + (wrapRef.current?.getBoundingClientRect().left ?? 0))) : null),
    [hover, profile, fractionAt],
  );
  const tipHalf = 78;
  const tipLeft = hover === null ? 0 : Math.min(Math.max(hover, tipHalf), Math.max(width - tipHalf, tipHalf));

  const relativeTo = frame ? `relative to ${frame}` : 'round the Sun';
  const captions = profile
    ? orbit === 'ballistic'
      ? ['LAUNCH BURN', 'COASTING ON AN ORBIT, ENGINE OFF', flyby ? 'FLY PAST' : 'ARRIVAL BURN']
      : orbit === 'spiral'
        ? ['LAUNCH', 'ENGINE ON THE WHOLE WAY, SPIRALLING', 'ARRIVE']
        : profile.drive === 'Warp'
          ? ['ENGAGE', `${formatSpeed(profile.peakVelocity)} the whole way`, 'ARRIVE']
          : profile.hasCoast
            ? ['LAUNCH', `COASTING at ${formatSpeed(profile.peakVelocity)} for ${formatDuration(profile.coastTime)}`, 'ARRIVE']
            : ['LAUNCH · speeding up', `FLIP at ${formatDuration(profile.totalTime / 2)}`, 'slowing down · ARRIVE']
    : null;

  return (
    <div className="playback-chart-block">
      <div
        ref={wrapRef}
        className={`playback-chart${scrubbing ? ' is-scrubbing' : ''}${profile ? '' : ' is-empty'}`}
        style={{ height }}
        role="slider"
        tabIndex={profile ? 0 : -1}
        aria-label="Position in the flight"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={valueText}
        aria-disabled={!profile}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
      >
        {!profile && <div className="playback-chart-empty">Pick two places to plan a flight</div>}
        {profile && geo && paths && (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            <defs>
              <clipPath id={`${clipId}-reveal`}>
                <rect key={flightRevision} className="playback-reveal-rect" x={0} y={0} width={width} height={height} />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clipId}-reveal)`}>
              <g key={axisShown} className="playback-chart-fade">
                <line x1={PAD} x2={width - PAD} y1={geo.base} y2={geo.base} className="playback-chart-baseline" />
                {paths.band && (
                  <rect x={paths.band[0]} y={0} width={Math.max(paths.band[1] - paths.band[0], 0)} height={geo.base} className="playback-chart-coast" />
                )}
                {paths.xs.map((x, i) => (
                  <line key={i} x1={x} x2={x} y1={0} y2={geo.base} className="playback-chart-boundary" />
                ))}
                <path d={paths.line} className="playback-chart-ahead" />
                <ChartCursor
                  profile={profile}
                  axis={axisShown}
                  geo={geo}
                  line={paths.line}
                  area={paths.area}
                  clipId={clipId}
                  scrubbing={scrubbing}
                />
              </g>
            </g>
            {hover !== null && !scrubbing && (
              <line x1={hover} x2={hover} y1={0} y2={geo.base} className="playback-chart-hairline" />
            )}
          </svg>
        )}
        {geo?.scale && (
          <div className="playback-chart-scale" aria-hidden="true">
            <span>Fastest {formatSpeed(geo.scale.fastest)}</span>
            <span>Slowest {formatSpeed(geo.scale.slowest)}</span>
          </div>
        )}
        {hoverSample && hover !== null && !scrubbing && (
          <div className="playback-tip" style={{ left: tipLeft }} aria-hidden="true">
            <span>Earth {formatDuration(hoverSample.t)}</span>
            <span>Ship {formatDuration(hoverSample.tau)}</span>
            <span>{formatSpeed(hoverSample.v)}{orbit ? ` ${relativeTo}` : ''}</span>
          </div>
        )}
      </div>

      {captions && (
        <div className={`playback-captions${orbit ? ' is-orbit' : ''}`} aria-hidden="true">
          <span title={captions[0]}>{captions[0]}</span>
          <span title={captions[1]}>{captions[1]}</span>
          <span title={captions[2]}>{captions[2]}</span>
        </div>
      )}

      {profile && !orbit && (
        <div className="playback-axis" role="group" aria-label="Time axis of the chart">
          <button
            type="button"
            className="playback-axis-btn"
            aria-pressed={axis === 'linear'}
            title="Even time: every moment of the trip gets the same width."
            onClick={() => chooseAxis('linear')}
          >
            Even time
          </button>
          <button
            type="button"
            className="playback-axis-btn"
            aria-pressed={axis === 'log'}
            title="Stretching uses a logarithmic time axis, so a burn of days stays visible inside a trip of decades."
            onClick={() => chooseAxis('log')}
          >
            Stretch the burns
          </button>
        </div>
      )}
    </div>
  );
};
