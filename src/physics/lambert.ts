/**
 * Two-body orbit tools.
 *
 * - `lambert`: given where a coasting ship starts, where it must end up and how long it has,
 *   find the orbit that joins the two (Lambert's problem). This is what turns "leave Earth on this
 *   date, reach Mars on that date" into the velocity the ship needs at each end.
 * - `propagate`: where a coasting ship is after a given time, from its position and velocity.
 *
 * Both use the "universal variable" formulation, so the same code handles ellipses and
 * hyperbolas. Units are whatever the caller uses consistently (the app uses AU, days and
 * AU³/day² for the gravitational parameter `mu`).
 */

type V3 = readonly number[];

/** Stumpff functions C(z) and S(z), written into `out` as [C, S]. */
function stumpff(z: number, out: number[]): void {
  if (z > 1e-6) {
    const s = Math.sqrt(z);
    out[0] = (1 - Math.cos(s)) / z;
    out[1] = (s - Math.sin(s)) / (s * z);
  } else if (z < -1e-6) {
    const s = Math.sqrt(-z);
    out[0] = (1 - Math.cosh(s)) / z;
    out[1] = (Math.sinh(s) - s) / (s * -z);
  } else {
    // Series around zero.
    out[0] = 0.5 - z / 24 + (z * z) / 720;
    out[1] = 1 / 6 - z / 120 + (z * z) / 5040;
  }
}

export interface LambertResult {
  /** Velocity on leaving the start point. */
  v1: [number, number, number];
  /** Velocity on reaching the end point. */
  v2: [number, number, number];
}

const cs = [0, 0];
const Z_UPPER = 4 * Math.PI * Math.PI; // one full revolution
const Z_LOWER_LIMIT = -4e5;

/**
 * Solve Lambert's problem for a transfer of less than one revolution that goes round the central
 * body the same way the planets do (counter-clockwise seen from the north of the ecliptic).
 *
 * Returns null when no such orbit exists for the inputs (zero time, or the two points and the
 * central body in a straight line).
 */
export function lambert(r1: V3, r2: V3, tof: number, mu: number): LambertResult | null {
  if (!(tof > 0)) return null;
  const m1 = Math.hypot(r1[0], r1[1], r1[2]);
  const m2 = Math.hypot(r2[0], r2[1], r2[2]);
  if (!(m1 > 0) || !(m2 > 0)) return null;
  const cosNu = Math.min(Math.max((r1[0] * r2[0] + r1[1] * r2[1] + r1[2] * r2[2]) / (m1 * m2), -1), 1);
  // Short way round when the end point is less than half a turn ahead, long way otherwise.
  const crossZ = r1[0] * r2[1] - r1[1] * r2[0];
  const way = crossZ >= 0 ? 1 : -1;
  const A = way * Math.sqrt(m1 * m2 * (1 + cosNu));
  if (Math.abs(A) < 1e-14) return null;

  const sqrtMu = Math.sqrt(mu);
  let lastY = 0;
  /** Flight time for a value of the universal variable z (−1 when z is too low to be an orbit). */
  const timeFor = (z: number): number => {
    stumpff(z, cs);
    const y = m1 + m2 + (A * (z * cs[1] - 1)) / Math.sqrt(cs[0]);
    lastY = y;
    if (y < 0) return -1;
    const chi = Math.sqrt(y / cs[0]);
    return (chi * chi * chi * cs[1] + A * Math.sqrt(y)) / sqrtMu;
  };

  // Flight time grows with z. Bracket the answer, then bisect.
  let lo = -Z_UPPER;
  let hi = Z_UPPER;
  let tLo = timeFor(lo);
  while (tLo > tof && lo > Z_LOWER_LIMIT) {
    lo *= 2;
    tLo = timeFor(lo);
  }
  if (tLo > tof) return null; // faster than this solver's limit
  let z = 0;
  for (let k = 0; k < 80; k++) {
    z = 0.5 * (lo + hi);
    const t = timeFor(z);
    if (t < tof) lo = z;
    else hi = z;
    if (hi - lo < 1e-11 * (1 + Math.abs(z))) break;
  }
  const t = timeFor(z);
  if (t < 0 || !Number.isFinite(t)) return null;
  const y = lastY;
  const f = 1 - y / m1;
  const g = A * Math.sqrt(y / mu);
  const gDot = 1 - y / m2;
  if (!(Math.abs(g) > 0)) return null;
  return {
    v1: [(r2[0] - f * r1[0]) / g, (r2[1] - f * r1[1]) / g, (r2[2] - f * r1[2]) / g],
    v2: [(gDot * r2[0] - r1[0]) / g, (gDot * r2[1] - r1[1]) / g, (gDot * r2[2] - r1[2]) / g],
  };
}

/**
 * Coast for time `dt` (zero or positive) from position `r0` and velocity `v0` round a body of
 * gravitational parameter `mu`. Writes the new position into `r` and, if given, the new velocity
 * into `v`.
 */
export function propagate(r0: V3, v0: V3, dt: number, mu: number, r: number[], v?: number[]): void {
  if (!(dt > 0)) {
    r[0] = r0[0];
    r[1] = r0[1];
    r[2] = r0[2];
    if (v) {
      v[0] = v0[0];
      v[1] = v0[1];
      v[2] = v0[2];
    }
    return;
  }
  const m0 = Math.hypot(r0[0], r0[1], r0[2]);
  const speed2 = v0[0] * v0[0] + v0[1] * v0[1] + v0[2] * v0[2];
  const sqrtMu = Math.sqrt(mu);
  const vr0 = (r0[0] * v0[0] + r0[1] * v0[1] + r0[2] * v0[2]) / m0;
  const alpha = 2 / m0 - speed2 / mu; // 1/a: positive for an ellipse, negative for a hyperbola
  const k = (m0 * vr0) / sqrtMu;

  // F(chi) = 0 defines the universal anomaly chi. F grows with chi (its slope is the distance
  // from the central body), so bracket the root and use a safeguarded Newton iteration.
  let slope = m0;
  const F = (chi: number): number => {
    const z = alpha * chi * chi;
    stumpff(z, cs);
    const c = cs[0];
    const s = cs[1];
    slope = k * chi * (1 - z * s) + (1 - alpha * m0) * chi * chi * c + m0;
    return k * chi * chi * c + (1 - alpha * m0) * chi * chi * chi * s + m0 * chi - sqrtMu * dt;
  };
  let lo = 0;
  let hi = Math.max((sqrtMu * dt) / m0, sqrtMu * dt * Math.abs(alpha), 1e-9);
  for (let n = 0; n < 200 && F(hi) < 0; n++) {
    lo = hi;
    hi *= 2;
  }
  let chi = 0.5 * (lo + hi);
  for (let n = 0; n < 100; n++) {
    const f = F(chi);
    if (f > 0) hi = chi;
    else lo = chi;
    let next = chi - f / slope;
    if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);
    const done = Math.abs(next - chi) < 1e-14 * (1 + Math.abs(chi));
    chi = next;
    if (done) break;
  }
  const z = alpha * chi * chi;
  stumpff(z, cs);
  const c = cs[0];
  const s = cs[1];
  const f = 1 - (chi * chi * c) / m0;
  const g = dt - (chi * chi * chi * s) / sqrtMu;
  const x = f * r0[0] + g * v0[0];
  const y = f * r0[1] + g * v0[1];
  const w = f * r0[2] + g * v0[2];
  if (v) {
    const m = Math.hypot(x, y, w);
    const fDot = (sqrtMu / (m * m0)) * chi * (z * s - 1);
    const gDot = 1 - (chi * chi * c) / m;
    v[0] = fDot * r0[0] + gDot * v0[0];
    v[1] = fDot * r0[1] + gDot * v0[1];
    v[2] = fDot * r0[2] + gDot * v0[2];
  }
  r[0] = x;
  r[1] = y;
  r[2] = w;
}
