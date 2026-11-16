import { SPEED_OF_LIGHT } from './kinematicsEngine';
import type { FlightPhase, FlightProfile, FlightSample, Trajectory } from './flightProfile';
import {
  AU_KM,
  AU_PER_DAY_TO_KMS,
  MU_SUN,
  SECONDS_PER_DAY,
  Vec3,
  bodyGravity,
  bodyPosition,
  bodyState,
  elementsAt,
  moonOffset,
} from './ephemeris';
import { lambert, propagate } from './lambert';

/**
 * Trips inside the solar system that respect orbits and dates.
 *
 * - Ballistic transfers (chemical rocket): a short burn at the start, a coast along an orbit
 *   round the Sun, and a short burn at the end. Found with the Lambert solver. The cost is the
 *   total change of velocity ("fuel budget"), counted from a low orbit round the starting body to
 *   a loose capture orbit round the destination (or nothing at the end for a fly-past).
 * - Earth ↔ Moon: the same idea round Earth instead of the Sun.
 * - Low-thrust spirals (ion drive): a weak engine pushing all the way, slowly widening or
 *   shrinking its orbit round the Sun (Edelbaum's approximation).
 * - Direct flights (fast engines): a straight line aimed at where the destination will be.
 *
 * Velocity changes are in km/s, dates in day numbers (see ephemeris.ts), durations in days.
 */

export type ArrivalMode = 'orbit' | 'flyby';

const KMS = AU_PER_DAY_TO_KMS;
/** Parking and capture orbits skim the body at 5% above its radius. */
const LOW_ORBIT = 1.05;

/** The Moon rides with Earth for trips round the Sun. */
const helio = (name: string): string => (name === 'Moon' ? 'Earth' : name);

/** Burn to leave a low circular orbit round `name` with `vInf` km/s to spare once clear of it. */
export function departureBurn(name: string, vInf: number): number {
  const g = bodyGravity(name);
  if (!(g.gm > 0)) return vInf;
  const rp = g.radiusKm * LOW_ORBIT;
  return Math.sqrt(vInf * vInf + (2 * g.gm) / rp) - Math.sqrt(g.gm / rp);
}

/**
 * Burn on arriving at `name` with `vInf` km/s of approach speed: nothing for a fly-past;
 * otherwise just enough, fired at the lowest point, to be caught in a loose orbit. Bodies with
 * negligible gravity need the whole approach speed cancelled.
 */
export function arrivalBurn(name: string, vInf: number, mode: ArrivalMode): number {
  if (mode === 'flyby') return 0;
  const g = bodyGravity(name);
  if (!(g.gm > 0)) return vInf;
  const rp = g.radiusKm * LOW_ORBIT;
  return Math.sqrt(vInf * vInf + (2 * g.gm) / rp) - Math.sqrt((2 * g.gm) / rp);
}

/* ------------------------------------------------------------------ */
/* Ballistic transfers round the Sun                                   */
/* ------------------------------------------------------------------ */

export interface TransferCost {
  /** Burn at the start, km/s. */
  dvDepart: number;
  /** Burn at the end when entering orbit, km/s (a fly-past needs none). */
  dvArrive: number;
  /** Speed relative to the starting body once clear of it, km/s. */
  vInfDepart: number;
  /** Approach speed relative to the destination, km/s. */
  vInfArrive: number;
  /** Position (AU) and velocity (AU/day) at the start of the coast. */
  r1: Vec3;
  v1: Vec3;
}

/** The coasting orbit from `origin` on `departDay` to `dest` `tofDays` later, and what it costs. */
export function transferCost(origin: string, dest: string, departDay: number, tofDays: number): TransferCost | null {
  const a = bodyState(helio(origin), departDay);
  const b = bodyState(helio(dest), departDay + tofDays);
  const sol = lambert(a.r, b.r, tofDays, MU_SUN);
  if (!sol) return null;
  const vInfDepart = Math.hypot(sol.v1[0] - a.v[0], sol.v1[1] - a.v[1], sol.v1[2] - a.v[2]) * KMS;
  const vInfArrive = Math.hypot(sol.v2[0] - b.v[0], sol.v2[1] - b.v[1], sol.v2[2] - b.v[2]) * KMS;
  if (!Number.isFinite(vInfDepart) || !Number.isFinite(vInfArrive)) return null;
  return {
    dvDepart: departureBurn(helio(origin), vInfDepart),
    dvArrive: arrivalBurn(helio(dest), vInfArrive, 'orbit'),
    vInfDepart,
    vInfArrive,
    r1: a.r,
    v1: sol.v1,
  };
}

const totalCost = (c: TransferCost | null, mode: ArrivalMode): number =>
  c ? c.dvDepart + (mode === 'orbit' ? c.dvArrive : 0) : Infinity;

/**
 * The launch-window grid ("porkchop plot"): the fuel needed for every combination of launch
 * date and travel time.
 */
export interface Porkchop {
  origin: string;
  dest: string;
  /** Launch date of the first column (day number). */
  startDay: number;
  /** Days between columns. */
  dateStep: number;
  nDates: number;
  /** Travel time of the first row, days. */
  tofMin: number;
  /** Days between rows. */
  tofStep: number;
  nTofs: number;
  /** Burn at the start, km/s, for column j and row i at index j·nTofs + i. NaN where no orbit exists. */
  dvDepart: Float32Array;
  /** Burn at the end when entering orbit, km/s. */
  dvArrive: Float32Array;
  /** Travel time of the minimum-fuel transfer between the two orbits (half an ellipse), days. */
  hohmannDays: number;
  /** Days between launch windows (how long until the two bodies line up the same way again). */
  synodicDays: number;
}

export const PORKCHOP_DATES = 96;
export const PORKCHOP_TOFS = 72;

const periodOf = (a: number): number => 2 * Math.PI * Math.sqrt((a * a * a) / MU_SUN);

/** Days between repeats of the same line-up of two bodies. */
export function synodicDays(origin: string, dest: string, day: number): number {
  const e1 = elementsAt(helio(origin), day);
  const e2 = elementsAt(helio(dest), day);
  if (!e1 || !e2) return 0;
  const p1 = periodOf(e1.a);
  const p2 = periodOf(e2.a);
  const diff = Math.abs(1 / p1 - 1 / p2);
  return diff > 1e-9 ? 1 / diff : 1e9;
}

const porkchopCache = new Map<string, Porkchop>();
const PORKCHOP_CACHE_SIZE = 8;

/** Fuel for every launch date from `startDay` on and every sensible travel time. Cached. */
export function porkchop(origin: string, dest: string, startDay: number): Porkchop {
  const key = `${origin}|${dest}|${startDay}`;
  const hit = porkchopCache.get(key);
  if (hit) return hit;

  // Sizes come from where the two bodies are now, not their average orbits, so very elongated
  // orbits (Sedna) get a sensible range of travel times.
  const p1 = [0, 0, 0];
  const p2 = [0, 0, 0];
  bodyPosition(helio(origin), startDay, p1);
  bodyPosition(helio(dest), startDay, p2);
  const mean = (Math.hypot(p1[0], p1[1], p1[2]) + Math.hypot(p2[0], p2[1], p2[2])) / 2;
  const hohmannDays = Math.PI * Math.sqrt((mean * mean * mean) / MU_SUN);
  const synodic = synodicDays(origin, dest, startDay);
  // Look far enough ahead to include a whole launch window, up to 30 years.
  const horizon = Math.min(Math.max(1.25 * synodic, 400), 10957);
  const nDates = PORKCHOP_DATES;
  const nTofs = PORKCHOP_TOFS;
  const dateStep = horizon / (nDates - 1);
  const tofMin = 0.1 * hohmannDays;
  const tofStep = (1.6 * hohmannDays - tofMin) / (nTofs - 1);
  const dvDepart = new Float32Array(nDates * nTofs);
  const dvArrive = new Float32Array(nDates * nTofs);
  for (let j = 0; j < nDates; j++) {
    const day = startDay + j * dateStep;
    for (let i = 0; i < nTofs; i++) {
      const c = transferCost(origin, dest, day, tofMin + i * tofStep);
      dvDepart[j * nTofs + i] = c ? c.dvDepart : NaN;
      dvArrive[j * nTofs + i] = c ? c.dvArrive : NaN;
    }
  }
  const grid: Porkchop = { origin, dest, startDay, dateStep, nDates, tofMin, tofStep, nTofs, dvDepart, dvArrive, hohmannDays, synodicDays: synodic };
  if (porkchopCache.size >= PORKCHOP_CACHE_SIZE) porkchopCache.delete(porkchopCache.keys().next().value as string);
  porkchopCache.set(key, grid);
  return grid;
}

/** Fuel (km/s) for one cell of the grid; Infinity where no orbit exists. */
export function porkchopCost(g: Porkchop, dateIndex: number, tofIndex: number, mode: ArrivalMode): number {
  const k = dateIndex * g.nTofs + tofIndex;
  const v = g.dvDepart[k] + (mode === 'orbit' ? g.dvArrive[k] : 0);
  return Number.isFinite(v) ? v : Infinity;
}

export interface BallisticPlan {
  /** Actual launch date (day number): the requested date, or later if the ship had to wait. */
  departDay: number;
  tofDays: number;
  /** Days spent waiting for a launch window after the requested date. */
  waitDays: number;
  dvDepartKms: number;
  /** Burn at the end; 0 for a fly-past. */
  dvArriveKms: number;
  dvTotalKms: number;
  vInfDepartKms: number;
  vInfArriveKms: number;
  /** False when the flight needs more than the fuel budget. */
  feasible: boolean;
  /** True when the visitor chose this exact launch date and travel time. */
  pinned: boolean;
  /** Cheapest possible flight if leaving on the requested date itself, km/s. */
  dvOnRequestedDayKms: number;
  /** Start of the coast: position (AU) and velocity (AU/day) round the Sun. */
  r1: Vec3;
  v1: Vec3;
}

export interface BallisticQuery {
  origin: string;
  dest: string;
  /** Earliest launch date (whole day number). */
  earliestDay: number;
  budgetKms: number;
  mode: ArrivalMode;
  /** Fly exactly this travel time from the earliest date, whatever it costs. */
  pinnedTofDays?: number | null;
}

/** Shortest travel time within budget when leaving on `day`, or null if nothing fits. */
function fastestOnDay(q: BallisticQuery, g: Porkchop, day: number): { tof: number; cost: TransferCost } | null {
  let prevTof = 0;
  let found: { tof: number; cost: TransferCost } | null = null;
  for (let i = 0; i < g.nTofs; i++) {
    const tof = g.tofMin + i * g.tofStep;
    const c = transferCost(q.origin, q.dest, day, tof);
    if (c && totalCost(c, q.mode) <= q.budgetKms) {
      found = { tof, cost: c };
      break;
    }
    prevTof = tof;
  }
  if (!found) return null;
  // The first row already fits: look for even faster trips below the grid.
  if (prevTof === 0) {
    prevTof = found.tof;
    for (let k = 0; k < 5; k++) {
      prevTof /= 2;
      const c = transferCost(q.origin, q.dest, day, prevTof);
      if (c && totalCost(c, q.mode) <= q.budgetKms) found = { tof: prevTof, cost: c };
      else break;
    }
    if (found.tof === prevTof) return found;
  }
  // Narrow down between the last trip that was too costly and the first that fits.
  let lo = prevTof;
  let hi = found.tof;
  for (let k = 0; k < 18 && hi - lo > 0.02; k++) {
    const mid = 0.5 * (lo + hi);
    const c = transferCost(q.origin, q.dest, day, mid);
    if (c && totalCost(c, q.mode) <= q.budgetKms) {
      hi = mid;
      found = { tof: mid, cost: c };
    } else lo = mid;
  }
  return found;
}

let lastBallistic: { key: string; plan: BallisticPlan | null } | null = null;

/**
 * Plan a chemical-rocket flight: of all launches on or after the earliest date that the fuel
 * budget allows, the one that arrives soonest. That may mean waiting for a launch window. When no
 * date within the search range fits, returns the cheapest flight found with `feasible: false`.
 */
export function solveBallistic(q: BallisticQuery): BallisticPlan | null {
  const key = `${q.origin}|${q.dest}|${q.earliestDay}|${q.budgetKms}|${q.mode}|${q.pinnedTofDays ?? ''}`;
  if (lastBallistic && lastBallistic.key === key) return lastBallistic.plan;
  const plan = solveBallisticUncached(q);
  lastBallistic = { key, plan };
  return plan;
}

function solveBallisticUncached(q: BallisticQuery): BallisticPlan | null {
  const g = porkchop(q.origin, q.dest, q.earliestDay);
  let dvOnRequestedDay = Infinity;
  for (let i = 0; i < g.nTofs; i++) dvOnRequestedDay = Math.min(dvOnRequestedDay, porkchopCost(g, 0, i, q.mode));

  const finish = (day: number, tof: number, c: TransferCost, pinned: boolean): BallisticPlan => {
    const dvArrive = q.mode === 'orbit' ? c.dvArrive : 0;
    const total = c.dvDepart + dvArrive;
    return {
      departDay: day,
      tofDays: tof,
      waitDays: day - q.earliestDay,
      dvDepartKms: c.dvDepart,
      dvArriveKms: dvArrive,
      dvTotalKms: total,
      vInfDepartKms: c.vInfDepart,
      vInfArriveKms: c.vInfArrive,
      feasible: total <= q.budgetKms * (1 + 1e-9),
      pinned,
      dvOnRequestedDayKms: dvOnRequestedDay,
      r1: c.r1,
      v1: c.v1,
    };
  };

  if (q.pinnedTofDays && q.pinnedTofDays > 0) {
    const c = transferCost(q.origin, q.dest, q.earliestDay, q.pinnedTofDays);
    if (c) return finish(q.earliestDay, q.pinnedTofDays, c, true);
  }

  // The grid cell inside the budget that arrives soonest.
  let soonest = Infinity;
  let column = -1;
  for (let j = 0; j < g.nDates; j++) {
    for (let i = 0; i < g.nTofs; i++) {
      if (porkchopCost(g, j, i, q.mode) <= q.budgetKms) {
        // Rows are in order of travel time, so the first that fits is this date's soonest arrival.
        const arrival = j * g.dateStep + g.tofMin + i * g.tofStep;
        if (arrival < soonest) {
          soonest = arrival;
          column = j;
        }
        break;
      }
    }
  }

  if (column >= 0) {
    // The grid is coarse in launch date: try the days around that column and keep the soonest arrival.
    const step = Math.max(1, Math.round(g.dateStep / 16));
    const from = Math.max(q.earliestDay, Math.floor(q.earliestDay + (column - 1) * g.dateStep));
    const to = q.earliestDay + (column + 1) * g.dateStep;
    let best: { day: number; tof: number; cost: TransferCost } | null = null;
    for (let day = from; day <= to; day += step) {
      const f = fastestOnDay(q, g, day);
      if (f && (!best || day + f.tof < best.day + best.tof)) best = { day, tof: f.tof, cost: f.cost };
    }
    if (best) return finish(best.day, best.tof, best.cost, false);
  }

  // Nothing fits: report the cheapest flight in the grid.
  let best = Infinity;
  let bj = 0;
  let bi = 0;
  for (let j = 0; j < g.nDates; j++) {
    for (let i = 0; i < g.nTofs; i++) {
      const cost = porkchopCost(g, j, i, q.mode);
      if (cost < best) {
        best = cost;
        bj = j;
        bi = i;
      }
    }
  }
  if (!Number.isFinite(best)) return null;
  const day = Math.round(q.earliestDay + bj * g.dateStep);
  const tof = g.tofMin + bi * g.tofStep;
  const c = transferCost(q.origin, q.dest, day, tof);
  return c ? finish(day, tof, c, false) : null;
}

/* ------------------------------------------------------------------ */
/* Earth ↔ Moon                                                        */
/* ------------------------------------------------------------------ */

const GM_EARTH = 398600.4418;
const MOON_DISTANCE_KM = 384400;
const MOON_SPEED_KMS = Math.sqrt((GM_EARTH + 4902.8) / MOON_DISTANCE_KM);
const EARTH_PARK_KM = 6371 * LOW_ORBIT;

export interface LunarPlan {
  tofDays: number;
  dvDepartKms: number;
  dvArriveKms: number;
  dvTotalKms: number;
  feasible: boolean;
  /** Samples along the flight: time (days), distance from Earth's centre (km), speed relative to Earth (km/s). */
  times: number[];
  radii: number[];
  speeds: number[];
}

interface LunarOrbit {
  tofDays: number;
  dvEarth: number;
  dvMoon: number;
  a: number;
  e: number;
}

/**
 * The orbit round Earth that leaves a low parking orbit at `vp` km/s and reaches the Moon's
 * distance. `toMoon` chooses which end is the start (the orbit is the same either way).
 */
function lunarOrbit(vp: number, toMoon: boolean, mode: ArrivalMode): LunarOrbit {
  const rp = EARTH_PARK_KM;
  const rm = MOON_DISTANCE_KM;
  const a = 1 / (2 / rp - (vp * vp) / GM_EARTH); // negative for a hyperbola
  const e = 1 - rp / a;
  let tofSeconds: number;
  if (a > 0) {
    const E = Math.acos(Math.min(Math.max((1 - rm / a) / e, -1), 1));
    tofSeconds = Math.sqrt((a * a * a) / GM_EARTH) * (E - e * Math.sin(E));
  } else {
    const F = Math.acosh(Math.max((1 - rm / a) / e, 1));
    tofSeconds = Math.sqrt((-a * a * a) / GM_EARTH) * (e * Math.sinh(F) - F);
  }
  const v = Math.sqrt(Math.max(GM_EARTH * (2 / rm - 1 / a), 0));
  const vt = (rp * vp) / rm;
  const vr = Math.sqrt(Math.max(v * v - vt * vt, 0));
  const vInfMoon = Math.hypot(vt - MOON_SPEED_KMS, vr);
  const vCircEarth = Math.sqrt(GM_EARTH / rp);
  const vEscEarth = Math.SQRT2 * vCircEarth;
  const dvEarth = toMoon ? vp - vCircEarth : mode === 'orbit' ? Math.max(vp - vEscEarth, 0) : 0;
  const dvMoon = toMoon ? arrivalBurn('Moon', vInfMoon, mode) : departureBurn('Moon', vInfMoon);
  return { tofDays: tofSeconds / SECONDS_PER_DAY, dvEarth, dvMoon, a, e };
}

/** Plan a chemical-rocket flight between Earth and the Moon: the fastest the budget allows. */
export function solveLunar(toMoon: boolean, budgetKms: number, mode: ArrivalMode, pinnedTofDays?: number | null): LunarPlan {
  const rp = EARTH_PARK_KM;
  const rm = MOON_DISTANCE_KM;
  // Slowest useful orbit: one that only just reaches the Moon's distance (about five days).
  const vMin = Math.sqrt(GM_EARTH * (2 / rp - 2 / (rp + rm))) * 1.000001;
  const vMax = 40;
  const cost = (vp: number): number => {
    const o = lunarOrbit(vp, toMoon, mode);
    return o.dvEarth + o.dvMoon;
  };
  let vp = vMin;
  if (pinnedTofDays && pinnedTofDays > 0) {
    // Faster launch speed means a shorter trip: bisect for the pinned travel time.
    let lo = vMin;
    let hi = vMax;
    for (let k = 0; k < 50; k++) {
      const mid = 0.5 * (lo + hi);
      if (lunarOrbit(mid, toMoon, mode).tofDays > pinnedTofDays) lo = mid;
      else hi = mid;
    }
    vp = hi;
  } else if (cost(vMin) <= budgetKms) {
    let lo = vMin;
    let hi = vMax;
    if (cost(hi) <= budgetKms) lo = hi;
    for (let k = 0; k < 50 && hi - lo > 1e-9; k++) {
      const mid = 0.5 * (lo + hi);
      if (cost(mid) <= budgetKms) lo = mid;
      else hi = mid;
    }
    vp = lo;
  }
  const o = lunarOrbit(vp, toMoon, mode);
  const total = o.dvEarth + o.dvMoon;

  // Samples from the low point out to the Moon's distance, evenly spaced in the orbit's angle.
  const n = 96;
  const times: number[] = [];
  const radii: number[] = [];
  const speeds: number[] = [];
  const end = o.a > 0 ? Math.acos(Math.min(Math.max((1 - rm / o.a) / o.e, -1), 1)) : Math.acosh(Math.max((1 - rm / o.a) / o.e, 1));
  for (let k = 0; k < n; k++) {
    const x = (end * k) / (n - 1);
    let t: number;
    let r: number;
    if (o.a > 0) {
      t = Math.sqrt((o.a * o.a * o.a) / GM_EARTH) * (x - o.e * Math.sin(x));
      r = o.a * (1 - o.e * Math.cos(x));
    } else {
      t = Math.sqrt((-o.a * o.a * o.a) / GM_EARTH) * (o.e * Math.sinh(x) - x);
      r = o.a * (1 - o.e * Math.cosh(x));
    }
    times.push(t / SECONDS_PER_DAY);
    radii.push(r);
    speeds.push(Math.sqrt(Math.max(GM_EARTH * (2 / r - 1 / o.a), 0)));
  }
  if (!toMoon) {
    // The same orbit flown inward: reverse the samples.
    const T = times[n - 1];
    times.reverse();
    radii.reverse();
    speeds.reverse();
    for (let k = 0; k < n; k++) times[k] = T - times[k];
  }
  return {
    tofDays: o.tofDays,
    dvDepartKms: toMoon ? o.dvEarth : o.dvMoon,
    dvArriveKms: toMoon ? o.dvMoon : o.dvEarth,
    dvTotalKms: total,
    feasible: total <= budgetKms * (1 + 1e-9),
    times,
    radii,
    speeds,
  };
}

/* ------------------------------------------------------------------ */
/* Low-thrust spirals (ion drive)                                      */
/* ------------------------------------------------------------------ */

export interface SpiralPlan {
  departDay: number;
  tofDays: number;
  waitDays: number;
  /** Velocity change the spiral needs, km/s. */
  dvNeededKms: number;
  feasible: boolean;
  /** True for Earth ↔ Moon: a spiral round Earth instead of the Sun. */
  geocentric: boolean;
  /** Circular orbit speed at the start and end of the spiral, km/s. */
  v1Kms: number;
  v2Kms: number;
}

const wrapPi = (x: number): number => {
  let r = x % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  else if (r < -Math.PI) r += 2 * Math.PI;
  return r;
};

/** Angle swept round the Sun (radians) after `t` days of a spiral whose circular speed goes from v1 to v2 (AU/day) over `T` days. */
function spiralSweep(v1: number, v2: number, T: number, t: number): number {
  const kt = ((v2 - v1) / T) * t;
  // Integral of v³/mu, with v = v1 + k·t, written so it also works when v1 = v2.
  return (t / MU_SUN) * (v1 * v1 * v1 + 1.5 * v1 * v1 * kt + v1 * kt * kt + (kt * kt * kt) / 4);
}

const longitudeOf = (name: string, day: number): number => {
  const p = [0, 0, 0];
  bodyPosition(name, day, p);
  return Math.atan2(p[1], p[0]);
};

/**
 * Plan an ion-drive flight. The engine pushes the whole way with acceleration `accel` (m/s²),
 * turning one near-circular orbit into the other (Edelbaum's approximation: the velocity change
 * is the difference of the two orbital speeds, more if the orbits are tilted to each other).
 * The launch waits until the spiral will end where the destination is.
 */
export function solveSpiral(origin: string, dest: string, earliestDay: number, accel: number, budgetKms: number): SpiralPlan | null {
  const moonTrip = (origin === 'Moon' && dest === 'Earth') || (origin === 'Earth' && dest === 'Moon');
  if (moonTrip) {
    const vLow = Math.sqrt(GM_EARTH / EARTH_PARK_KM);
    const dv = vLow - MOON_SPEED_KMS;
    const tofDays = (dv * 1000) / accel / SECONDS_PER_DAY;
    const out = origin === 'Earth';
    return { departDay: earliestDay, tofDays, waitDays: 0, dvNeededKms: dv, feasible: dv <= budgetKms, geocentric: true, v1Kms: out ? vLow : MOON_SPEED_KMS, v2Kms: out ? MOON_SPEED_KMS : vLow };
  }
  const o = helio(origin);
  const d = helio(dest);
  const e1 = elementsAt(o, earliestDay);
  const e2 = elementsAt(d, earliestDay);
  if (!e1 || !e2 || o === d) return null;
  const v1 = Math.sqrt(MU_SUN / e1.a);
  const v2 = Math.sqrt(MU_SUN / e2.a);
  // Angle between the two orbit planes.
  const n1 = [Math.sin(e1.i) * Math.sin(e1.node), -Math.sin(e1.i) * Math.cos(e1.node), Math.cos(e1.i)];
  const n2 = [Math.sin(e2.i) * Math.sin(e2.node), -Math.sin(e2.i) * Math.cos(e2.node), Math.cos(e2.i)];
  const tilt = Math.acos(Math.min(Math.max(n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2], -1), 1));
  const dvAu = Math.sqrt(Math.max(v1 * v1 + v2 * v2 - 2 * v1 * v2 * Math.cos((Math.PI / 2) * tilt), 0));
  const dvKms = dvAu * KMS;
  const tofDays = (dvKms * 1000) / accel / SECONDS_PER_DAY;
  const sweep = spiralSweep(v1, v2, tofDays, tofDays);

  // Wait until the spiral ends where the destination will be.
  const miss = (day: number): number => wrapPi(longitudeOf(d, day + tofDays) - longitudeOf(o, day) - sweep);
  const synodic = synodicDays(o, d, earliestDay);
  const span = Math.min(1.05 * synodic, 14610);
  const steps = 720;
  let departDay = earliestDay;
  let prev = miss(earliestDay);
  let bestAbs = Math.abs(prev);
  let found = Math.abs(prev) < 0.01;
  for (let k = 1; k <= steps && !found; k++) {
    const day = earliestDay + (span * k) / steps;
    const m = miss(day);
    if (Math.abs(m) < bestAbs) {
      bestAbs = Math.abs(m);
      departDay = day;
    }
    if (prev * m <= 0 && Math.abs(prev) < Math.PI / 2 && Math.abs(m) < Math.PI / 2) {
      let lo = earliestDay + (span * (k - 1)) / steps;
      let hi = day;
      let mLo = prev;
      for (let n = 0; n < 40 && hi - lo > 0.01; n++) {
        const mid = 0.5 * (lo + hi);
        const mm = miss(mid);
        if (mLo * mm <= 0) hi = mid;
        else {
          lo = mid;
          mLo = mm;
        }
      }
      departDay = 0.5 * (lo + hi);
      found = true;
    }
    prev = m;
  }
  return { departDay, tofDays, waitDays: departDay - earliestDay, dvNeededKms: dvKms, feasible: dvKms <= budgetKms, geocentric: false, v1Kms: v1 * KMS, v2Kms: v2 * KMS };
}

/* ------------------------------------------------------------------ */
/* Direct flights (fast engines)                                       */
/* ------------------------------------------------------------------ */

export interface DirectPlan {
  tofDays: number;
  distanceMeters: number;
  r1: Vec3;
  r2: Vec3;
}

/**
 * A straight line from where `origin` is on `departDay` to where `dest` will be on arrival.
 * `secondsFor` gives the engine's travel time for a distance in metres.
 */
export function solveDirect(origin: string, dest: string, departDay: number, secondsFor: (meters: number) => number): DirectPlan {
  const r1: Vec3 = [0, 0, 0];
  const r2: Vec3 = [0, 0, 0];
  bodyPosition(origin, departDay, r1);
  let tofDays = 0;
  let distanceMeters = 0;
  for (let k = 0; k < 8; k++) {
    bodyPosition(dest, departDay + tofDays, r2);
    distanceMeters = Math.hypot(r2[0] - r1[0], r2[1] - r1[1], r2[2] - r1[2]) * AU_KM * 1000;
    const next = secondsFor(distanceMeters) / SECONDS_PER_DAY;
    const settled = Math.abs(next - tofDays) < 1e-6 * (1 + next);
    tofDays = Number.isFinite(next) ? next : 0;
    if (settled) break;
  }
  return { tofDays, distanceMeters, r1, r2 };
}

/* ------------------------------------------------------------------ */
/* Flight profiles for these trips                                     */
/* ------------------------------------------------------------------ */

export interface TableProfileInput {
  /** Earth time since launch at each sample, seconds, rising from 0. */
  times: ArrayLike<number>;
  /** Speed at each sample, m/s. */
  speeds: ArrayLike<number>;
  phase: FlightPhase;
  trajectory: Omit<Trajectory, 'paramAt'>;
  /** Position along the trajectory's polyline (0..1) at each sample. Default: evenly spread. */
  params?: ArrayLike<number>;
}

/**
 * A flight profile from a table of samples (linear interpolation between them). Used for
 * coasting orbits and spirals, where there is no neat formula for "where is the ship at time t".
 */
export function buildTableProfile(input: TableProfileInput): FlightProfile {
  const { times, speeds, phase } = input;
  const n = times.length;
  const c = SPEED_OF_LIGHT;
  const x = new Float64Array(n);
  const gap = new Float64Array(n);
  let peak = 0;
  for (let k = 0; k < n; k++) {
    if (speeds[k] > peak) peak = speeds[k];
    if (k === 0) continue;
    const dt = times[k] - times[k - 1];
    const v0 = speeds[k - 1];
    const v1 = speeds[k];
    x[k] = x[k - 1] + 0.5 * (v0 + v1) * dt;
    // Clock lag: the ship's clock runs slow by v²/2c² (exact enough far below light speed).
    gap[k] = gap[k - 1] + ((v0 * v0 + v0 * v1 + v1 * v1) / 3 / (2 * c * c)) * dt;
  }
  const totalTime = n > 0 ? times[n - 1] : 0;
  const distance = n > 0 ? x[n - 1] : 0;
  const timeGap = n > 0 ? gap[n - 1] : 0;
  const totalProperTime = totalTime - timeGap;
  const gammaOf = (v: number): number => 1 / Math.sqrt(1 - (v * v) / (c * c));

  /** Index k and blend w so that time t lies between samples k and k+1. */
  const locate = (t: number): [number, number] => {
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) lo = mid;
      else hi = mid;
    }
    const span = times[hi] - times[lo];
    return [lo, span > 0 ? (t - times[lo]) / span : 0];
  };

  const at = (tRaw: number): FlightSample => {
    const t = totalTime > 0 ? Math.min(Math.max(tRaw, 0), totalTime) : 0;
    if (!(totalTime > 0) || t >= totalTime) {
      return { fraction: 1, t: totalTime, tau: totalProperTime, v: 0, x: distance, remaining: 0, gamma: 1, phase: 'arrived' };
    }
    const [k, w] = locate(t);
    const v = speeds[k] + (speeds[k + 1] - speeds[k]) * w;
    const xs = x[k] + (x[k + 1] - x[k]) * w;
    const g = gap[k] + (gap[k + 1] - gap[k]) * w;
    return { fraction: t / totalTime, t, tau: t - g, v, x: xs, remaining: distance - xs, gamma: gammaOf(v), phase };
  };

  const paramAt = (f: number): number => {
    if (n < 2) return 0;
    const t = Math.min(Math.max(f, 0), 1) * totalTime;
    const [k, w] = locate(t);
    if (input.params) return input.params[k] + (input.params[k + 1] - input.params[k]) * w;
    return (k + w) / (n - 1);
  };

  const fractionAtDistance = (distanceFraction: number): number => {
    if (!(totalTime > 0) || !(distance > 0)) return 0;
    const target = Math.min(Math.max(distanceFraction, 0), 1) * distance;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (x[mid] <= target) lo = mid;
      else hi = mid;
    }
    const span = x[hi] - x[lo];
    const w = span > 0 ? (target - x[lo]) / span : 0;
    return (times[lo] + (times[hi] - times[lo]) * w) / totalTime;
  };

  return {
    drive: 'Sublight',
    distance,
    totalTime,
    totalProperTime,
    timeGap,
    accelTime: 0,
    coastTime: totalTime,
    accelDistance: 0,
    hasCoast: true,
    peakVelocity: peak,
    peakGamma: gammaOf(peak),
    accelEndFraction: 0,
    decelStartFraction: 1,
    at,
    atFraction: (f) => at(Math.min(Math.max(f, 0), 1) * totalTime),
    fractionAtDistance,
    trajectory: { ...input.trajectory, paramAt },
  };
}

const M_PER_AU_DAY = (AU_KM * 1000) / SECONDS_PER_DAY;

/** The profile of a coasting orbit round the Sun: 200 samples along the real orbit. */
export function ballisticProfile(plan: BallisticPlan): FlightProfile {
  const n = 200;
  const times = new Float64Array(n);
  const speeds = new Float64Array(n);
  const points = new Float64Array(n * 3);
  const r = [0, 0, 0];
  const v = [0, 0, 0];
  for (let k = 0; k < n; k++) {
    const days = (plan.tofDays * k) / (n - 1);
    propagate(plan.r1, plan.v1, days, MU_SUN, r, v);
    times[k] = days * SECONDS_PER_DAY;
    speeds[k] = Math.hypot(v[0], v[1], v[2]) * M_PER_AU_DAY;
    points.set(r, k * 3);
  }
  return buildTableProfile({ times, speeds, phase: 'orbit', trajectory: { kind: 'ballistic', frame: null, points, count: n } });
}

/** The profile of an Earth ↔ Moon flight. The path is drawn as a line that moves with Earth. */
export function lunarProfile(plan: LunarPlan, toMoon: boolean, departDay: number): FlightProfile {
  const rel = [0, 0, 0];
  // The Moon's place relative to Earth when the ship is there.
  moonOffset(toMoon ? departDay + plan.tofDays : departDay, rel);
  const points = new Float64Array(6);
  if (toMoon) points.set(rel, 3);
  else points.set(rel, 0);
  const rp = EARTH_PARK_KM;
  const span = MOON_DISTANCE_KM - rp;
  const params = plan.radii.map((radius) => {
    const out = Math.min(Math.max((radius - rp) / span, 0), 1);
    return toMoon ? out : 1 - out;
  });
  return buildTableProfile({
    times: plan.times.map((d) => d * SECONDS_PER_DAY),
    speeds: plan.speeds.map((s) => s * 1000),
    phase: 'orbit',
    params,
    trajectory: { kind: 'ballistic', frame: 'Earth', points, count: 2 },
  });
}

/** The profile of an ion-drive spiral. */
export function spiralProfile(plan: SpiralPlan, origin: string, dest: string): FlightProfile {
  const seconds = plan.tofDays * SECONDS_PER_DAY;
  if (plan.geocentric) {
    const rel = [0, 0, 0];
    const out = origin === 'Earth';
    moonOffset(out ? plan.departDay + plan.tofDays : plan.departDay, rel);
    const points = new Float64Array(6);
    points.set(rel, out ? 3 : 0);
    return buildTableProfile({
      times: [0, seconds],
      speeds: [plan.v1Kms * 1000, plan.v2Kms * 1000],
      phase: 'spiral',
      trajectory: { kind: 'spiral', frame: 'Earth', points, count: 2 },
    });
  }
  const n = 360;
  const times = new Float64Array(n);
  const speeds = new Float64Array(n);
  const points = new Float64Array(n * 3);
  const v1 = plan.v1Kms / KMS;
  const v2 = plan.v2Kms / KMS;
  const start = [0, 0, 0];
  const end = [0, 0, 0];
  bodyPosition(helio(origin), plan.departDay, start);
  bodyPosition(helio(dest), plan.departDay + plan.tofDays, end);
  const lon0 = Math.atan2(start[1], start[0]);
  const flat = (k: number, out: number[]): void => {
    const t = (plan.tofDays * k) / (n - 1);
    const v = v1 + ((v2 - v1) * k) / (n - 1);
    const radius = MU_SUN / (v * v);
    const lon = lon0 + spiralSweep(v1, v2, plan.tofDays, t);
    out[0] = radius * Math.cos(lon);
    out[1] = radius * Math.sin(lon);
    out[2] = 0;
  };
  // The ideal spiral joins two circles in the ecliptic. Real orbits are slightly oval and tilted,
  // so blend in the small offsets that make the path start and end exactly on the two bodies.
  const p = [0, 0, 0];
  flat(0, p);
  const d0 = [start[0] - p[0], start[1] - p[1], start[2] - p[2]];
  flat(n - 1, p);
  const d1 = [end[0] - p[0], end[1] - p[1], end[2] - p[2]];
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1);
    flat(k, p);
    points[k * 3] = p[0] + d0[0] * (1 - u) + d1[0] * u;
    points[k * 3 + 1] = p[1] + d0[1] * (1 - u) + d1[1] * u;
    points[k * 3 + 2] = p[2] + d0[2] * (1 - u) + d1[2] * u;
    times[k] = seconds * u;
    speeds[k] = (v1 + (v2 - v1) * u) * M_PER_AU_DAY;
  }
  return buildTableProfile({ times, speeds, phase: 'spiral', trajectory: { kind: 'spiral', frame: null, points, count: n } });
}

/** Attach a straight-line path to a profile built by the constant-acceleration or warp model. */
export function withDirectPath(profile: FlightProfile, plan: DirectPlan): FlightProfile {
  const points = new Float64Array(6);
  points.set(plan.r1, 0);
  points.set(plan.r2, 3);
  profile.trajectory = {
    kind: 'direct',
    frame: null,
    points,
    count: 2,
    paramAt: (f) => (profile.distance > 0 ? profile.atFraction(f).x / profile.distance : 0),
  };
  return profile;
}
