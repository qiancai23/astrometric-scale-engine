import { SPEED_OF_LIGHT } from './kinematicsEngine';

/**
 * Flight profile: the state of the ship at any moment of a flight.
 *
 * `KinematicsEngine` (kinematicsEngine.ts) answers "how long does the whole trip take".
 * This module answers "where is the ship, how fast is it going and what do the two clocks read
 * at moment t". It uses the same model and must agree with the engine's totals:
 *
 * - Sublight: constant proper acceleration `a` from rest, an optional coast at the speed limit,
 *   then a mirror-image deceleration ("flip and burn"). With e = a·t/c for Earth time t since
 *   launch during the burn:
 *     speed            v   = c·e / √(1+e²)
 *     distance         x   = (c²/a)·(√(1+e²) − 1)
 *     ship time        τ   = (c/a)·asinh(e)
 *     Lorentz factor   γ   = √(1+e²)
 * - Warp: constant speed `warpFactor·c`, both clocks run together (Lorentz factor 1).
 *
 * All times are seconds, distances metres, speeds metres per second.
 */

/**
 * `orbit`: coasting on an orbit round the Sun (or Earth) with the engine off.
 * `spiral`: a low-thrust engine pushing all the way along a slow spiral.
 */
export type FlightPhase = 'accel' | 'coast' | 'decel' | 'warp' | 'orbit' | 'spiral' | 'arrived';

/**
 * The shape of a flight in space, for flights on the solar-system map. Without one, a flight is
 * a straight line between two fixed points (the star map).
 */
export interface Trajectory {
  /**
   * `ballistic`: a coasting orbit. `spiral`: a low-thrust spiral. `direct`: a straight line from
   * where the origin is at launch to where the destination will be on arrival.
   */
  kind: 'ballistic' | 'spiral' | 'direct';
  /** Catalog name of the body the points are measured from, or null for the Sun. */
  frame: string | null;
  /** The path as a polyline: three numbers (x, y, z in AU, ecliptic) per point. */
  points: Float64Array;
  count: number;
  /** How far along the polyline (0 = first point, 1 = last) the ship is at fraction `f` of the flight's Earth time. */
  paramAt(f: number): number;
}

export interface FlightSample {
  /** 0..1 fraction of the Earth-time duration of the flight. */
  fraction: number;
  /** Earth (coordinate) time since launch. */
  t: number;
  /** Ship (proper) time since launch. */
  tau: number;
  /** Current speed. */
  v: number;
  /** Distance covered so far. */
  x: number;
  /** Distance still to go. */
  remaining: number;
  /** Current Lorentz factor (1 for warp). */
  gamma: number;
  phase: FlightPhase;
}

export interface FlightProfile {
  drive: 'Sublight' | 'Warp';
  distance: number;
  /** Earth time for the whole flight. */
  totalTime: number;
  /** Ship time for the whole flight. */
  totalProperTime: number;
  /**
   * Earth time minus ship time for the whole flight, computed in a way that stays accurate
   * even when the two differ by a fraction of a second on a trip of days.
   */
  timeGap: number;
  /** Earth-time length of the speeding-up burn (same for the slowing-down burn). 0 for warp. */
  accelTime: number;
  /** Earth-time length of the coast at the speed limit. 0 when the ship flips at the midpoint. */
  coastTime: number;
  /** Distance covered while speeding up. */
  accelDistance: number;
  /** True when the ship reaches its speed limit and coasts. */
  hasCoast: boolean;
  peakVelocity: number;
  peakGamma: number;
  /** Fraction (0..1 of Earth time) at which the ship stops speeding up. 0 for warp. */
  accelEndFraction: number;
  /** Fraction (0..1 of Earth time) at which the ship starts slowing down. 1 for warp. */
  decelStartFraction: number;
  /** State at Earth time `t` (clamped to the flight). */
  at(t: number): FlightSample;
  /** State at fraction `f` (0..1) of the Earth-time duration. */
  atFraction(f: number): FlightSample;
  /** Earth-time fraction at which the ship has covered `distanceFraction` (0..1) of the route. */
  fractionAtDistance(distanceFraction: number): number;
  /** The path through the solar system. Absent on the star map. */
  trajectory?: Trajectory;
}

export interface SublightProfileParams {
  /** metres */
  distance: number;
  /** proper acceleration, m/s² */
  acceleration: number;
  /** speed limit, m/s (below c) */
  velocityCeiling: number;
}

const c = SPEED_OF_LIGHT;

/** √(1+e²) − 1 without cancellation for small e. */
const gammaMinusOne = (e: number): number => {
  const e2 = e * e;
  return e2 / (1 + Math.sqrt(1 + e2));
};

/** e − asinh(e), accurate for small e (where direct subtraction loses every digit). */
const eMinusAsinh = (e: number): number => {
  if (e < 1e-2) {
    const e2 = e * e;
    // Series: e³/6 − 3e⁵/40 + 15e⁷/336
    return e * e2 * (1 / 6 - (3 / 40) * e2 + (15 / 336) * e2 * e2);
  }
  return e - Math.asinh(e);
};

const clamp01 = (f: number): number => (f < 0 ? 0 : f > 1 ? 1 : f);

export function buildSublightProfile(params: SublightProfileParams): FlightProfile {
  const { distance, acceleration: a } = params;
  const vCap = Math.min(params.velocityCeiling, 0.99999999 * c);
  const beta = vCap / c;
  const root = Math.sqrt(1 - beta * beta);
  const gammaCap = 1 / root;
  // γ − 1 written to avoid cancellation at low speed.
  const gammaCapMinusOne = (beta * beta) / (root * (1 + root));
  const capAccelDistance = ((c * c) / a) * gammaCapMinusOne;

  const hasCoast = capAccelDistance < distance / 2;

  let accelTime: number;
  let accelDistance: number;
  let coastTime: number;
  let peakVelocity: number;
  let peakGamma: number;

  if (hasCoast) {
    accelTime = (vCap * gammaCap) / a;
    accelDistance = capAccelDistance;
    coastTime = (distance - 2 * accelDistance) / vCap;
    peakVelocity = vCap;
    peakGamma = gammaCap;
  } else {
    const k = (a * (distance / 2)) / (c * c); // γ_peak − 1
    accelTime = (c / a) * Math.sqrt(k * (k + 2));
    accelDistance = distance / 2;
    coastTime = 0;
    peakGamma = 1 + k;
    const ePeak = (a * accelTime) / c;
    peakVelocity = (c * ePeak) / Math.sqrt(1 + ePeak * ePeak);
  }

  const ePeakBurn = (a * accelTime) / c;
  const tauAccel = (c / a) * Math.asinh(ePeakBurn);
  const tauCoast = coastTime / peakGamma;
  const totalTime = 2 * accelTime + coastTime;
  const totalProperTime = 2 * tauAccel + tauCoast;

  const gapPerBurn = (c / a) * eMinusAsinh(ePeakBurn);
  const peakBeta = peakVelocity / c;
  const peakRoot = Math.sqrt(1 - peakBeta * peakBeta);
  // 1 − 1/γ = 1 − √(1−β²) = β² / (1 + √(1−β²))
  const gapCoast = coastTime * ((peakBeta * peakBeta) / (1 + peakRoot));
  const timeGap = 2 * gapPerBurn + gapCoast;

  /** State after burning from rest for Earth time `t`. */
  const burn = (t: number) => {
    const e = (a * t) / c;
    const g = Math.sqrt(1 + e * e);
    return {
      v: (c * e) / g,
      x: ((c * c) / a) * gammaMinusOne(e),
      tau: (c / a) * Math.asinh(e),
      gamma: g,
    };
  };

  const at = (tRaw: number): FlightSample => {
    const t = totalTime > 0 ? Math.min(Math.max(tRaw, 0), totalTime) : 0;
    const fraction = totalTime > 0 ? t / totalTime : 0;
    if (t >= totalTime) {
      return { fraction: 1, t: totalTime, tau: totalProperTime, v: 0, x: distance, remaining: 0, gamma: 1, phase: 'arrived' };
    }
    if (t <= accelTime) {
      const s = burn(t);
      return { fraction, t, tau: s.tau, v: s.v, x: s.x, remaining: distance - s.x, gamma: s.gamma, phase: 'accel' };
    }
    if (t <= accelTime + coastTime) {
      const dt = t - accelTime;
      const x = accelDistance + peakVelocity * dt;
      return { fraction, t, tau: tauAccel + dt / peakGamma, v: peakVelocity, x, remaining: distance - x, gamma: peakGamma, phase: 'coast' };
    }
    const s = burn(totalTime - t);
    return { fraction, t, tau: totalProperTime - s.tau, v: s.v, x: distance - s.x, remaining: s.x, gamma: s.gamma, phase: 'decel' };
  };

  /** Earth time needed to cover distance `x` while burning from rest. */
  const burnTimeForDistance = (x: number): number => {
    const k = (a * x) / (c * c);
    return (c / a) * Math.sqrt(k * (k + 2));
  };

  const fractionAtDistance = (distanceFraction: number): number => {
    if (!(totalTime > 0)) return 0;
    const x = clamp01(distanceFraction) * distance;
    let t: number;
    if (x <= accelDistance) t = burnTimeForDistance(x);
    else if (x <= distance - accelDistance) t = accelTime + (x - accelDistance) / peakVelocity;
    else t = totalTime - burnTimeForDistance(distance - x);
    return clamp01(t / totalTime);
  };

  return {
    drive: 'Sublight',
    distance,
    totalTime,
    totalProperTime,
    timeGap,
    accelTime,
    coastTime,
    accelDistance,
    hasCoast,
    peakVelocity,
    peakGamma,
    accelEndFraction: totalTime > 0 ? accelTime / totalTime : 0,
    decelStartFraction: totalTime > 0 ? (accelTime + coastTime) / totalTime : 1,
    at,
    atFraction: (f) => at(clamp01(f) * totalTime),
    fractionAtDistance,
  };
}

export function buildWarpProfile(distance: number, warpFactor: number): FlightProfile {
  const v = warpFactor * c;
  const totalTime = distance / v;

  const at = (tRaw: number): FlightSample => {
    const t = totalTime > 0 ? Math.min(Math.max(tRaw, 0), totalTime) : 0;
    const fraction = totalTime > 0 ? t / totalTime : 0;
    if (t >= totalTime) {
      return { fraction: 1, t: totalTime, tau: totalTime, v: 0, x: distance, remaining: 0, gamma: 1, phase: 'arrived' };
    }
    const x = v * t;
    return { fraction, t, tau: t, v, x, remaining: distance - x, gamma: 1, phase: 'warp' };
  };

  return {
    drive: 'Warp',
    distance,
    totalTime,
    totalProperTime: totalTime,
    timeGap: 0,
    accelTime: 0,
    coastTime: totalTime,
    accelDistance: 0,
    hasCoast: true,
    peakVelocity: v,
    peakGamma: 1,
    accelEndFraction: 0,
    decelStartFraction: 1,
    at,
    atFraction: (f) => at(clamp01(f) * totalTime),
    fractionAtDistance: (d) => clamp01(d),
  };
}

export type TimeAxis = 'linear' | 'log';

/**
 * Sample a profile for drawing a chart.
 *
 * - `linear`: evenly spaced in Earth time, plus the exact phase boundaries.
 * - `log`: evenly spaced in "time to the nearer end of the flight" on a logarithmic scale, mirrored
 *   around the midpoint. This stretches the burns at each end, so a burn of days stays visible
 *   inside a trip of decades. Use `chartPosition` to place a moment on that axis.
 */
export function sampleProfile(profile: FlightProfile, count = 160, axis: TimeAxis = 'linear'): FlightSample[] {
  if (!(profile.totalTime > 0)) return [];
  const fractions = new Set<number>([0, 1, profile.accelEndFraction, profile.decelStartFraction, 0.5]);
  for (let i = 0; i <= count; i++) {
    const u = i / count;
    fractions.add(axis === 'log' ? fractionFromChartPosition(profile, u, 'log') : u);
  }
  return Array.from(fractions)
    .filter((f) => f >= 0 && f <= 1)
    .sort((p, q) => p - q)
    .map((f) => profile.atFraction(f));
}

/**
 * How many decades the log time axis spans on each half of the flight.
 * Chosen per flight so the burn occupies a readable share of the axis.
 */
function logDecades(profile: FlightProfile): number {
  const burnShare = profile.accelEndFraction > 0 ? profile.accelEndFraction : 0.5;
  // Half-flight is fraction 0.5. Show from a tenth of the burn up to the midpoint.
  const span = Math.log10(0.5 / Math.max(burnShare / 10, 1e-12));
  return Math.min(Math.max(span, 1.5), 9);
}

/** Horizontal chart position (0..1) of Earth-time fraction `f` on the chosen axis. */
export function chartPosition(profile: FlightProfile, f: number, axis: TimeAxis): number {
  const frac = clamp01(f);
  if (axis === 'linear') return frac;
  const decades = logDecades(profile);
  const floor = 0.5 * Math.pow(10, -decades);
  const half = (d: number): number => {
    // d = distance in fraction from the nearer end, 0..0.5 → position 0..0.5
    if (d <= floor) return (d / floor) * 0.02; // a short linear lead-in so 0 maps to 0
    return 0.02 + 0.48 * (Math.log10(d / floor) / decades);
  };
  return frac <= 0.5 ? half(frac) : 1 - half(1 - frac);
}

/** Inverse of `chartPosition`. */
export function fractionFromChartPosition(profile: FlightProfile, position: number, axis: TimeAxis): number {
  const p = clamp01(position);
  if (axis === 'linear') return p;
  const decades = logDecades(profile);
  const floor = 0.5 * Math.pow(10, -decades);
  const half = (u: number): number => {
    if (u <= 0.02) return (u / 0.02) * floor;
    return floor * Math.pow(10, ((u - 0.02) / 0.48) * decades);
  };
  return p <= 0.5 ? half(p) : 1 - half(1 - p);
}
