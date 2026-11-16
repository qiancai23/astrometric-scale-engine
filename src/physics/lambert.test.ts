import { lambert, propagate } from './lambert';
import { bodyState, dayFromIso, MU_SUN, AU_PER_DAY_TO_KMS } from './ephemeris';

const sub = (a: readonly number[], b: readonly number[]): number[] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const kms = (v: readonly number[]): number => Math.hypot(v[0], v[1], v[2]) * AU_PER_DAY_TO_KMS;

describe('propagate', () => {
  it('follows a circular orbit', () => {
    const r0 = [1, 0, 0];
    const v0 = [0, Math.sqrt(MU_SUN), 0];
    const period = (2 * Math.PI) / Math.sqrt(MU_SUN);
    const r = [0, 0, 0];
    const v = [0, 0, 0];
    propagate(r0, v0, period, MU_SUN, r, v);
    expect(r[0]).toBeCloseTo(1, 9);
    expect(r[1]).toBeCloseTo(0, 8);
    propagate(r0, v0, period / 4, MU_SUN, r, v);
    expect(r[0]).toBeCloseTo(0, 9);
    expect(r[1]).toBeCloseTo(1, 9);
    expect(v[0]).toBeCloseTo(-Math.sqrt(MU_SUN), 10);
  });

  it('agrees with the planet positions for an elongated orbit', () => {
    const a = bodyState('Mercury', 1000);
    const b = bodyState('Mercury', 1030);
    const r = [0, 0, 0];
    propagate(a.r, a.v, 30, MU_SUN, r);
    expect(Math.hypot(...sub(r, b.r))).toBeLessThan(1e-5);
  });

  it('handles an escape (hyperbolic) path and conserves energy', () => {
    const r0 = [1, 0, 0];
    const v0 = [0.005, 0.03, 0.001]; // about 53 km/s: faster than escape speed at 1 AU
    const r = [0, 0, 0];
    const v = [0, 0, 0];
    propagate(r0, v0, 400, MU_SUN, r, v);
    const e0 = (v0[0] ** 2 + v0[1] ** 2 + v0[2] ** 2) / 2 - MU_SUN / 1;
    const e1 = (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) / 2 - MU_SUN / Math.hypot(...r);
    expect(e0).toBeGreaterThan(0);
    expect(e1).toBeCloseTo(e0, 12);
    expect(Math.hypot(...r)).toBeGreaterThan(5);
  });
});

describe('lambert', () => {
  it('recovers the minimum-fuel (Hohmann) transfer between circular orbits', () => {
    const r1 = [1, 0, 0];
    const rMars = 1.524;
    // Just short of half a turn (exactly half a turn leaves the plane of the orbit undefined).
    const angle = Math.PI * 0.9999;
    const r2 = [rMars * Math.cos(angle), rMars * Math.sin(angle), 0];
    const aT = (1 + rMars) / 2;
    const tof = Math.PI * Math.sqrt((aT * aT * aT) / MU_SUN);
    expect(tof).toBeGreaterThan(255);
    expect(tof).toBeLessThan(262);
    const sol = lambert(r1, r2, tof, MU_SUN)!;
    const vCirc = Math.sqrt(MU_SUN);
    // Leaves 2.9 km/s faster than Earth, arrives 2.6 km/s slower than Mars.
    expect((Math.hypot(...sol.v1) - vCirc) * AU_PER_DAY_TO_KMS).toBeCloseTo(2.94, 1);
    expect((Math.sqrt(MU_SUN / rMars) - Math.hypot(...sol.v2)) * AU_PER_DAY_TO_KMS).toBeCloseTo(2.65, 1);
  });

  it('gives an orbit that really arrives at the end point: short and long way, slow and fast', () => {
    const cases: [number[], number[], number][] = [
      [[1, 0, 0], [0, 1.5, 0.05], 120],
      [[1, 0, 0], [-1.2, -0.9, 0.1], 300],
      [[1, 0, 0], [0.4, -1.4, 0], 420],
      [[1, 0, 0], [3, 4, 0.2], 200], // fast: hyperbolic
      [[0.9, 0.3, 0], [-20, 22, 1], 1500],
    ];
    for (const [r1, r2, tof] of cases) {
      const sol = lambert(r1, r2, tof, MU_SUN)!;
      expect(sol).not.toBeNull();
      const r = [0, 0, 0];
      const v = [0, 0, 0];
      propagate(r1, sol.v1, tof, MU_SUN, r, v);
      expect(Math.hypot(...sub(r, r2))).toBeLessThan(1e-6 * (1 + Math.hypot(...r2)));
      expect(Math.hypot(...sub(v, sol.v2))).toBeLessThan(1e-7);
    }
  });

  it('reproduces the launch of Perseverance (30 July 2020 to 18 February 2021)', () => {
    const depart = dayFromIso('2020-07-30')!;
    const arrive = dayFromIso('2021-02-18')!;
    const e = bodyState('Earth', depart);
    const m = bodyState('Mars', arrive);
    const sol = lambert(e.r, m.r, arrive - depart, MU_SUN)!;
    // The real launch left Earth about 3.8 km/s faster than escape (launch energy C3 about 14.5 km²/s²).
    const vInf = kms(sub(sol.v1, e.v));
    expect(vInf).toBeGreaterThan(3.4);
    expect(vInf).toBeLessThan(4.2);
    const vArr = kms(sub(sol.v2, m.v));
    expect(vArr).toBeGreaterThan(2.2);
    expect(vArr).toBeLessThan(3.2);
  });

  it('rejects impossible inputs', () => {
    expect(lambert([1, 0, 0], [1.5, 0, 0], 0, MU_SUN)).toBeNull();
    expect(lambert([0, 0, 0], [1.5, 0, 0], 100, MU_SUN)).toBeNull();
  });
});
