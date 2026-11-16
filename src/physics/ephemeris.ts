import * as elementsData from '../../scripts/elements.json';

/**
 * Ephemeris: where every body of the solar-system map is on a given date.
 *
 * Positions and velocities are heliocentric, in the ecliptic plane of J2000 (the same frame as
 * the coordinates in `scripts/systemic.json`), in astronomical units and AU per day.
 *
 * - The eight planets use NASA JPL's "approximate positions of the planets" table (Standish):
 *   orbital elements at J2000 plus a rate per century. Good to a small fraction of a degree
 *   between 1800 and 2050, a little coarser outside.
 * - Pluto, the dwarf planets and the asteroids use fixed orbital elements from the JPL Small-Body
 *   Database (`scripts/elements.json`, written by `scripts/build_elements.py`).
 * - The Moon uses mean elements of its orbit round Earth (good to a degree or two).
 *
 * Dates are "day numbers": days since 2000-01-01 12:00 UT (J2000). A whole day number is noon.
 */

export type Vec3 = [number, number, number];

/** The Sun's gravitational parameter, AU³/day² (the Gaussian constant squared). */
export const MU_SUN = 0.01720209895 * 0.01720209895;
export const AU_KM = 1.495978707e8;
export const SECONDS_PER_DAY = 86400;
/** Multiply AU/day by this to get km/s. */
export const AU_PER_DAY_TO_KMS = AU_KM / SECONDS_PER_DAY;
/** Earth's gravitational parameter in AU³/day². */
export const MU_EARTH = (398600.4418 / (AU_KM * AU_KM * AU_KM)) * SECONDS_PER_DAY * SECONDS_PER_DAY;

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const MS_PER_DAY = 86400000;
/** Day number of the Unix epoch (1970-01-01 00:00 UT). */
const UNIX_EPOCH_DAY = -10957.5;

/** Day number (may be fractional) of a JavaScript date. */
export const dayFromDate = (date: Date): number => date.getTime() / MS_PER_DAY + UNIX_EPOCH_DAY;
export const dateFromDay = (day: number): Date => new Date((day - UNIX_EPOCH_DAY) * MS_PER_DAY);

/** Whole day number (noon UT) of a calendar date given as YYYY-MM-DD, or null if it cannot be read. */
export function dayFromIso(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / MS_PER_DAY + UNIX_EPOCH_DAY);
}

/** Calendar date (UT) of a day number as YYYY-MM-DD. */
export function isoFromDay(day: number): string {
  const d = dateFromDay(day);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${String(y).padStart(4, '0')}-${mo}-${da}`;
}

/** Today's whole day number. */
export const todayDay = (): number => Math.round(dayFromDate(new Date()));

/** Earliest and latest launch dates the interface offers (1900-01-01 and 2199-12-31). */
export const MIN_DAY = -36524;
export const MAX_DAY = 73048;

/* ------------------------------------------------------------------ */
/* Orbital elements                                                    */
/* ------------------------------------------------------------------ */

/** A Kepler orbit at one moment. Angles in radians, `a` in AU. */
export interface KeplerElements {
  a: number;
  e: number;
  /** Inclination to the ecliptic. */
  i: number;
  /** Longitude of the ascending node. */
  node: number;
  /** Argument of perihelion. */
  peri: number;
  /** Mean anomaly. */
  M: number;
}

/** JPL table row: a, e, I, L, long. of perihelion, long. of node; then the same per century. */
type PlanetRow = readonly [number, number, number, number, number, number, number, number, number, number, number, number];

const PLANETS: Record<string, PlanetRow> = {
  Mercury: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  Venus: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255, 0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  // The Earth-Moon barycentre, used for Earth (at most 4,700 km from Earth's centre).
  Earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  Mars: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  Jupiter: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  Saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  Uranus: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503, -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  Neptune: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574, 0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
};

interface FixedElements {
  a: number;
  e: number;
  i: number;
  node: number;
  peri: number;
  M: number;
  epochJD: number;
}

const unwrap = (mod: unknown): Record<string, FixedElements> => {
  const m = mod as { default?: Record<string, FixedElements> };
  return m.default ?? (mod as Record<string, FixedElements>);
};
const SMALL_BODIES: Record<string, FixedElements> = unwrap(elementsData);

const J2000_JD = 2451545.0;
const mod2pi = (x: number): number => {
  const r = x % TWO_PI;
  return r < 0 ? r + TWO_PI : r;
};

/** True when the body's position can be computed for any date (every body of the solar-system map). */
export function hasEphemeris(name: string): boolean {
  return name === 'Sol' || name === 'Moon' || name in PLANETS || name in SMALL_BODIES;
}

/** True for the Sun, which sits at the origin. */
export const isSun = (name: string): boolean => name === 'Sol';

/**
 * Elements of a body's orbit round the Sun on a day, or null for the Sun and unknown names.
 * The Moon returns Earth's orbit (use `moonOffset` for its place round Earth).
 */
export function elementsAt(name: string, day: number): KeplerElements | null {
  const key = name === 'Moon' ? 'Earth' : name;
  const p = PLANETS[key];
  if (p) {
    const T = day / 36525;
    const a = p[0] + p[6] * T;
    const e = p[1] + p[7] * T;
    const i = (p[2] + p[8] * T) * DEG;
    const L = (p[3] + p[9] * T) * DEG;
    const longPeri = (p[4] + p[10] * T) * DEG;
    const node = (p[5] + p[11] * T) * DEG;
    return { a, e, i, node, peri: longPeri - node, M: mod2pi(L - longPeri) };
  }
  const s = SMALL_BODIES[key];
  if (s) {
    const n = Math.sqrt(MU_SUN / (s.a * s.a * s.a)); // rad/day
    const dt = day - (s.epochJD - J2000_JD);
    return { a: s.a, e: s.e, i: s.i * DEG, node: s.node * DEG, peri: s.peri * DEG, M: mod2pi(s.M * DEG + n * dt) };
  }
  return null;
}

/** Solve Kepler's equation M = E − e·sin E for the eccentric anomaly E. */
export function solveKepler(M: number, e: number): number {
  let m = M % TWO_PI;
  if (m > Math.PI) m -= TWO_PI;
  else if (m < -Math.PI) m += TWO_PI;
  let E = e < 0.8 ? m + e * Math.sin(m) : Math.PI * Math.sign(m || 1);
  for (let k = 0; k < 40; k++) {
    const f = E - e * Math.sin(E) - m;
    const d = f / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}

/**
 * Position (and optionally velocity) on a Kepler orbit, written into `r` and `v`.
 * `mu` is the central body's gravitational parameter in AU³/day².
 */
export function elementsToState(el: KeplerElements, mu: number, r: number[], v?: number[]): void {
  const E = solveKepler(el.M, el.e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const root = Math.sqrt(1 - el.e * el.e);
  // In the orbit's own plane, x toward perihelion.
  const px = el.a * (cosE - el.e);
  const py = el.a * root * sinE;
  const cw = Math.cos(el.peri);
  const sw = Math.sin(el.peri);
  const cO = Math.cos(el.node);
  const sO = Math.sin(el.node);
  const ci = Math.cos(el.i);
  const si = Math.sin(el.i);
  // Rotation: perihelion argument, then inclination, then node.
  const xx = cw * cO - sw * sO * ci;
  const xy = -sw * cO - cw * sO * ci;
  const yx = cw * sO + sw * cO * ci;
  const yy = -sw * sO + cw * cO * ci;
  const zx = sw * si;
  const zy = cw * si;
  r[0] = xx * px + xy * py;
  r[1] = yx * px + yy * py;
  r[2] = zx * px + zy * py;
  if (v) {
    const dist = el.a * (1 - el.e * cosE);
    const k = Math.sqrt(mu * el.a) / dist;
    const vx = -k * sinE;
    const vy = k * root * cosE;
    v[0] = xx * vx + xy * vy;
    v[1] = yx * vx + yy * vy;
    v[2] = zx * vx + zy * vy;
  }
}

/** Mean elements of the Moon's orbit round Earth on a day. */
function moonElements(day: number): KeplerElements {
  const L = (218.316 + 13.176396 * day) * DEG;
  const M = (134.963 + 13.064993 * day) * DEG;
  const node = (125.045 - 0.0529539 * day) * DEG;
  return { a: 384400 / AU_KM, e: 0.0549, i: 5.145 * DEG, node, peri: L - M - node, M: mod2pi(M) };
}

/** The Moon's position (and velocity) relative to Earth. */
export function moonOffset(day: number, r: number[], v?: number[]): void {
  elementsToState(moonElements(day), MU_EARTH, r, v);
}

const scratchR = [0, 0, 0];
const scratchV = [0, 0, 0];

/** Heliocentric position of a body on a day, written into `out` (AU). Unknown names give the origin. */
export function bodyPosition(name: string, day: number, out: number[]): void {
  const el = elementsAt(name, day);
  if (!el) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return;
  }
  elementsToState(el, MU_SUN, out);
  if (name === 'Moon') {
    moonOffset(day, scratchR);
    out[0] += scratchR[0];
    out[1] += scratchR[1];
    out[2] += scratchR[2];
  }
}

export interface BodyState {
  /** AU */
  r: Vec3;
  /** AU per day */
  v: Vec3;
}

/** Heliocentric position and velocity of a body on a day. */
export function bodyState(name: string, day: number): BodyState {
  const r: Vec3 = [0, 0, 0];
  const v: Vec3 = [0, 0, 0];
  const el = elementsAt(name, day);
  if (el) {
    elementsToState(el, MU_SUN, r, v);
    if (name === 'Moon') {
      moonOffset(day, scratchR, scratchV);
      for (let k = 0; k < 3; k++) {
        r[k] += scratchR[k];
        v[k] += scratchV[k];
      }
    }
  }
  return { r, v };
}

/** Length of a body's year in days (Earth's for the Moon), or 0 for the Sun. */
export function orbitalPeriodDays(name: string, day = 0): number {
  const el = elementsAt(name, day);
  return el ? TWO_PI * Math.sqrt((el.a * el.a * el.a) / MU_SUN) : 0;
}

/**
 * The outline of a body's orbit as `count` points (closed: the last repeats the first), AU.
 * For the Moon the points are relative to Earth; for everything else, to the Sun.
 */
export function orbitOutline(name: string, day: number, count: number, out: Float32Array | number[]): void {
  const base = name === 'Moon' ? moonElements(day) : elementsAt(name, day);
  if (!base) return;
  const el = { ...base };
  const p = [0, 0, 0];
  for (let k = 0; k < count; k++) {
    // Even steps in eccentric anomaly: denser near perihelion, where the curve bends most.
    const E = (k / (count - 1)) * TWO_PI;
    el.M = E - el.e * Math.sin(E);
    elementsToState(el, 1, p);
    out[k * 3] = p[0];
    out[k * 3 + 1] = p[1];
    out[k * 3 + 2] = p[2];
  }
}

/* ------------------------------------------------------------------ */
/* Physical data used for departure and arrival burns                  */
/* ------------------------------------------------------------------ */

export interface BodyGravity {
  /** Gravitational parameter, km³/s². 0 for bodies too small to matter. */
  gm: number;
  /** Mean radius, km. */
  radiusKm: number;
}

const GRAVITY_TABLE: Record<string, BodyGravity> = {
  Mercury: { gm: 22032, radiusKm: 2440 },
  Venus: { gm: 324859, radiusKm: 6052 },
  Earth: { gm: 398600.4418, radiusKm: 6371 },
  Moon: { gm: 4902.8, radiusKm: 1737 },
  Mars: { gm: 42828.4, radiusKm: 3390 },
  Jupiter: { gm: 126686534, radiusKm: 69911 },
  Saturn: { gm: 37931187, radiusKm: 58232 },
  Uranus: { gm: 5793939, radiusKm: 25362 },
  Neptune: { gm: 6836529, radiusKm: 24622 },
  Pluto: { gm: 869.6, radiusKm: 1188 },
  Eris: { gm: 1108, radiusKm: 1163 },
  Ceres: { gm: 62.6, radiusKm: 470 },
  Haumea: { gm: 267, radiusKm: 800 },
  Makemake: { gm: 207, radiusKm: 715 },
  Vesta: { gm: 17.3, radiusKm: 263 },
};

/** Gravity of a body for burn calculations. Small bodies return zero gravity. */
export const bodyGravity = (name: string): BodyGravity => GRAVITY_TABLE[name] ?? { gm: 0, radiusKm: 1 };
