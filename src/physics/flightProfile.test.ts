import { KinematicsEngine, SPEED_OF_LIGHT } from './kinematicsEngine';
import { buildSublightProfile, buildWarpProfile, chartPosition, fractionFromChartPosition, sampleProfile } from './flightProfile';

const G = 9.80665;
const LY = 9.4607304725808e15;
const AU = 1.495978707e11;

const close = (actual: number, expected: number, relative = 1e-9) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relative + 1e-12);
};

describe('flightProfile (sublight)', () => {
  const cases = [
    { name: 'Sol to Proxima, 1 g, 0.999 c (flip at midpoint)', distance: 4.2465 * LY, a: G, v: 0.999 * SPEED_OF_LIGHT },
    { name: 'Sol to Proxima, 1 g, 0.5 c (coast)', distance: 4.2465 * LY, a: G, v: 0.5 * SPEED_OF_LIGHT },
    { name: 'Earth to Mars, 1 g, 0.2 c', distance: 0.64 * AU, a: G, v: 0.2 * SPEED_OF_LIGHT },
    { name: 'Chemical rocket to Proxima (tiny burn, long coast)', distance: 4.2465 * LY, a: G, v: 0.0001 * SPEED_OF_LIGHT },
    { name: 'Andromeda, 1 g, 0.999 c', distance: 2.537e6 * LY, a: G, v: 0.999 * SPEED_OF_LIGHT },
  ];

  it.each(cases)('agrees with KinematicsEngine totals: $name', ({ distance, a, v }) => {
    const engine = KinematicsEngine.calculateSublight({ distance, acceleration: a, velocityCeiling: v, mass: 1e6 });
    const profile = buildSublightProfile({ distance, acceleration: a, velocityCeiling: v });
    close(profile.totalTime, engine.coordinateTime, 1e-7);
    close(profile.totalProperTime, engine.properTime, 1e-7);
    close(profile.peakVelocity, engine.peakVelocity, 1e-7);
    expect(profile.hasCoast).toBe(engine.coastingPhaseSeconds > 0);
  });

  it.each(cases)('starts at rest at the origin and ends at rest at the destination: $name', ({ distance, a, v }) => {
    const p = buildSublightProfile({ distance, acceleration: a, velocityCeiling: v });
    const start = p.atFraction(0);
    const end = p.atFraction(1);
    expect(start.x).toBe(0);
    expect(start.v).toBe(0);
    expect(start.tau).toBe(0);
    expect(end.phase).toBe('arrived');
    close(end.x, distance);
    expect(end.v).toBe(0);
    close(end.tau, p.totalProperTime);
  });

  it.each(cases)('is symmetric and monotonic: $name', ({ distance, a, v }) => {
    const p = buildSublightProfile({ distance, acceleration: a, velocityCeiling: v });
    const mid = p.atFraction(0.5);
    close(mid.x, distance / 2, 1e-9);
    close(mid.tau, p.totalProperTime / 2, 1e-9);
    let previous = p.atFraction(0);
    for (let i = 1; i <= 400; i++) {
      const s = p.atFraction(i / 400);
      expect(s.x).toBeGreaterThanOrEqual(previous.x);
      expect(s.tau).toBeGreaterThanOrEqual(previous.tau);
      expect(s.v).toBeLessThanOrEqual(p.peakVelocity * (1 + 1e-12));
      expect(s.tau).toBeLessThanOrEqual(s.t * (1 + 1e-12));
      previous = s;
    }
    const early = p.atFraction(0.2);
    const late = p.atFraction(0.8);
    close(early.v, late.v, 1e-9);
    close(early.x, distance - late.x, 1e-9);
  });

  it('labels the phases of a coasting flight', () => {
    const p = buildSublightProfile({ distance: 4.2465 * LY, a: G, v: 0.5 * SPEED_OF_LIGHT } as never);
    expect(p).toBeDefined();
    const q = buildSublightProfile({ distance: 4.2465 * LY, acceleration: G, velocityCeiling: 0.5 * SPEED_OF_LIGHT });
    expect(q.hasCoast).toBe(true);
    expect(q.atFraction(q.accelEndFraction / 2).phase).toBe('accel');
    expect(q.atFraction(0.5).phase).toBe('coast');
    expect(q.atFraction((1 + q.decelStartFraction) / 2).phase).toBe('decel');
    close(q.atFraction(0.5).v, 0.5 * SPEED_OF_LIGHT);
  });

  it('computes the gap between the two clocks accurately at low speed', () => {
    // Earth to Mars at 1 g: the clocks differ by a fraction of a second over about two days.
    const distance = 0.64 * AU;
    const p = buildSublightProfile({ distance, acceleration: G, velocityCeiling: 0.2 * SPEED_OF_LIGHT });
    expect(p.timeGap).toBeGreaterThan(0);
    expect(p.timeGap).toBeLessThan(2);
    // First-order estimate: gap ≈ ∫ v²/(2c²) dt = T · v_peak² / (6c²) for a symmetric triangle profile.
    const estimate = (p.totalTime * p.peakVelocity * p.peakVelocity) / (6 * SPEED_OF_LIGHT * SPEED_OF_LIGHT);
    close(p.timeGap, estimate, 1e-3);
  });

  it('matches the direct difference of the clocks at high speed', () => {
    const p = buildSublightProfile({ distance: 4.2465 * LY, acceleration: G, velocityCeiling: 0.999 * SPEED_OF_LIGHT });
    close(p.timeGap, p.totalTime - p.totalProperTime, 1e-9);
    // The textbook figures for 1 g to Proxima Centauri: about 5.9 years on Earth, 3.5 on the ship.
    expect(p.totalTime / 31557600).toBeGreaterThan(5.8);
    expect(p.totalTime / 31557600).toBeLessThan(6.0);
    expect(p.totalProperTime / 31557600).toBeGreaterThan(3.5);
    expect(p.totalProperTime / 31557600).toBeLessThan(3.6);
  });

  it('caps the Lorentz factor near 22.4 at 0.999 c', () => {
    const p = buildSublightProfile({ distance: 2.537e6 * LY, acceleration: G, velocityCeiling: 0.999 * SPEED_OF_LIGHT });
    expect(p.hasCoast).toBe(true);
    close(p.peakGamma, 22.366, 1e-3);
  });

  it('inverts distance to time', () => {
    const p = buildSublightProfile({ distance: 4.2465 * LY, acceleration: G, velocityCeiling: 0.5 * SPEED_OF_LIGHT });
    for (const d of [0, 0.01, 0.2, 0.5, 0.8, 0.99, 1]) {
      const f = p.fractionAtDistance(d);
      close(p.atFraction(f).x, d * p.distance, 1e-7);
    }
  });
});

describe('flightProfile (warp)', () => {
  it('moves at constant speed with both clocks together', () => {
    const distance = 4.2465 * LY;
    const p = buildWarpProfile(distance, 10);
    const engine = KinematicsEngine.calculateWarp(distance, 10, 1e6);
    close(p.totalTime, engine.coordinateTime);
    expect(p.timeGap).toBe(0);
    const s = p.atFraction(0.25);
    close(s.x, distance / 4);
    expect(s.tau).toBe(s.t);
    expect(s.gamma).toBe(1);
    expect(s.phase).toBe('warp');
    expect(p.atFraction(1).phase).toBe('arrived');
  });
});

describe('chart sampling', () => {
  const p = buildSublightProfile({ distance: 4.2465 * LY, acceleration: G, velocityCeiling: 0.0001 * SPEED_OF_LIGHT });

  it('includes the phase boundaries and both ends', () => {
    const samples = sampleProfile(p, 50);
    expect(samples[0].fraction).toBe(0);
    expect(samples[samples.length - 1].fraction).toBe(1);
    expect(samples.some((s) => Math.abs(s.fraction - p.accelEndFraction) < 1e-15)).toBe(true);
  });

  it('log axis is monotonic, symmetric and invertible', () => {
    let previous = -1;
    for (let i = 0; i <= 200; i++) {
      const f = i / 200;
      const pos = chartPosition(p, f, 'log');
      expect(pos).toBeGreaterThanOrEqual(previous);
      previous = pos;
      close(chartPosition(p, 1 - f, 'log'), 1 - pos, 1e-9);
    }
    expect(chartPosition(p, 0, 'log')).toBe(0);
    expect(chartPosition(p, 1, 'log')).toBe(1);
    for (const u of [0, 0.01, 0.1, 0.3, 0.5, 0.7, 0.95, 1]) {
      close(chartPosition(p, fractionFromChartPosition(p, u, 'log'), 'log'), u, 1e-9);
    }
  });

  it('log axis gives the burn a visible share of the chart', () => {
    // The burn is a vanishing part of this flight in linear time…
    expect(p.accelEndFraction).toBeLessThan(1e-6);
    // …but takes a readable slice of the log axis.
    expect(chartPosition(p, p.accelEndFraction, 'log')).toBeGreaterThan(0.03);
  });

  it('linear axis is the identity', () => {
    expect(chartPosition(p, 0.37, 'linear')).toBe(0.37);
    expect(fractionFromChartPosition(p, 0.37, 'linear')).toBe(0.37);
  });
});
