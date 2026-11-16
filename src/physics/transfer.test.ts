import {
  ballisticProfile,
  lunarProfile,
  porkchop,
  porkchopCost,
  solveBallistic,
  solveDirect,
  solveLunar,
  solveSpiral,
  spiralProfile,
  transferCost,
  departureBurn,
  arrivalBurn,
} from './transfer';
import { bodyPosition, dayFromIso } from './ephemeris';

const day = (iso: string): number => dayFromIso(iso) as number;

describe('burns', () => {
  it('leaving low Earth orbit for Mars costs about 3.6 km/s', () => {
    expect(departureBurn('Earth', 2.94)).toBeGreaterThan(3.4);
    expect(departureBurn('Earth', 2.94)).toBeLessThan(3.8);
  });
  it('a fly-past needs no arrival burn; a small body needs the full approach speed', () => {
    expect(arrivalBurn('Mars', 2.65, 'flyby')).toBe(0);
    expect(arrivalBurn('Mars', 2.65, 'orbit')).toBeGreaterThan(0.4);
    expect(arrivalBurn('Mars', 2.65, 'orbit')).toBeLessThan(1.0);
    expect(arrivalBurn('Bennu', 2, 'orbit')).toBe(2);
  });
});

describe('real missions', () => {
  it('Mariner 7: 27 March 1969 to 5 August 1969, a 131-day fly-past', () => {
    const plan = solveBallistic({ origin: 'Earth', dest: 'Mars', earliestDay: day('1969-03-27'), budgetKms: 6, mode: 'flyby', pinnedTofDays: 131 })!;
    expect(plan.pinned).toBe(true);
    expect(plan.tofDays).toBe(131);
    // The real launch needed a little over 4 km/s from low Earth orbit.
    expect(plan.dvTotalKms).toBeGreaterThan(3.6);
    expect(plan.dvTotalKms).toBeLessThan(5.0);
    expect(plan.feasible).toBe(true);
  });

  it('Perseverance: 30 July 2020, 203 days', () => {
    const c = transferCost('Earth', 'Mars', day('2020-07-30'), 203)!;
    expect(c.dvDepart).toBeGreaterThan(3.5);
    expect(c.dvDepart).toBeLessThan(4.1);
  });
});

describe('Earth to Mars launch windows', () => {
  const start = day('2026-11-16');
  const grid = porkchop('Earth', 'Mars', start);

  it('the cheapest launch costs about what a minimum-fuel transfer should, and takes most of a year', () => {
    let best = Infinity;
    let bi = 0;
    for (let j = 0; j < grid.nDates; j++) {
      for (let i = 0; i < grid.nTofs; i++) {
        const c = porkchopCost(grid, j, i, 'orbit');
        if (c < best) {
          best = c;
          bi = i;
        }
      }
    }
    expect(best).toBeGreaterThan(3.8);
    expect(best).toBeLessThan(5.5);
    const tof = grid.tofMin + bi * grid.tofStep;
    expect(tof).toBeGreaterThan(180);
    expect(tof).toBeLessThan(360);
    expect(grid.hohmannDays).toBeGreaterThan(230);
    expect(grid.hohmannDays).toBeLessThan(290);
    // Windows repeat about every 26 months.
    expect(grid.synodicDays).toBeGreaterThan(760);
    expect(grid.synodicDays).toBeLessThan(800);
  });

  it('with a realistic budget the trip takes months, and may have to wait for the window', () => {
    const plan = solveBallistic({ origin: 'Earth', dest: 'Mars', earliestDay: start, budgetKms: 6, mode: 'orbit' })!;
    expect(plan.feasible).toBe(true);
    expect(plan.dvTotalKms).toBeLessThanOrEqual(6.0001);
    expect(plan.tofDays).toBeGreaterThan(100);
    expect(plan.tofDays).toBeLessThan(330);
    expect(plan.waitDays).toBeGreaterThanOrEqual(0);
    expect(plan.waitDays).toBeLessThan(800);
  });

  it('a bigger budget never arrives later', () => {
    const small = solveBallistic({ origin: 'Earth', dest: 'Mars', earliestDay: start, budgetKms: 5, mode: 'orbit' })!;
    const big = solveBallistic({ origin: 'Earth', dest: 'Mars', earliestDay: start, budgetKms: 12, mode: 'orbit' })!;
    expect(big.feasible).toBe(true);
    expect(big.departDay + big.tofDays).toBeLessThanOrEqual(small.departDay + small.tofDays + 0.1);
  });

  it('arrives no later than any launch in the grid that fits the budget', () => {
    const plan = solveBallistic({ origin: 'Earth', dest: 'Mars', earliestDay: start, budgetKms: 6, mode: 'orbit' })!;
    let soonest = Infinity;
    for (let j = 0; j < grid.nDates; j++) {
      for (let i = 0; i < grid.nTofs; i++) {
        if (porkchopCost(grid, j, i, 'orbit') <= 6) soonest = Math.min(soonest, start + j * grid.dateStep + grid.tofMin + i * grid.tofStep);
      }
    }
    expect(plan.departDay + plan.tofDays).toBeLessThanOrEqual(soonest + 0.5);
  });

  it('a budget too small for any window is reported as not enough', () => {
    const plan = solveBallistic({ origin: 'Earth', dest: 'Mars', earliestDay: start, budgetKms: 3, mode: 'orbit' })!;
    expect(plan.feasible).toBe(false);
    expect(plan.dvTotalKms).toBeGreaterThan(3);
  });

  it('the coasting path ends where Mars is on arrival', () => {
    const plan = solveBallistic({ origin: 'Earth', dest: 'Mars', earliestDay: start, budgetKms: 6, mode: 'orbit' })!;
    const profile = ballisticProfile(plan);
    const t = profile.trajectory!;
    const mars = [0, 0, 0];
    bodyPosition('Mars', plan.departDay + plan.tofDays, mars);
    const last = (t.count - 1) * 3;
    expect(Math.hypot(t.points[last] - mars[0], t.points[last + 1] - mars[1], t.points[last + 2] - mars[2])).toBeLessThan(1e-5);
    expect(profile.totalTime).toBeCloseTo(plan.tofDays * 86400, 3);
    // Speeds round the Sun between Earth's and Mars's orbits.
    expect(profile.peakVelocity).toBeGreaterThan(25000);
    expect(profile.peakVelocity).toBeLessThan(45000);
    expect(profile.totalProperTime).toBeLessThan(profile.totalTime);
    expect(profile.atFraction(0.5).phase).toBe('orbit');
    expect(profile.atFraction(1).phase).toBe('arrived');
    expect(profile.fractionAtDistance(0)).toBe(0);
    expect(profile.fractionAtDistance(1)).toBeCloseTo(1, 6);
    expect(t.paramAt(0.25)).toBeCloseTo(0.25, 6);
  });
});

describe('other routes', () => {
  it('finds a flight to Jupiter and to a small asteroid', () => {
    const start = day('2026-11-16');
    const j = solveBallistic({ origin: 'Earth', dest: 'Jupiter', earliestDay: start, budgetKms: 8, mode: 'orbit' })!;
    expect(j.feasible).toBe(true);
    expect(j.tofDays).toBeGreaterThan(400);
    expect(j.tofDays).toBeLessThan(1500);
    const b = solveBallistic({ origin: 'Earth', dest: 'Bennu', earliestDay: start, budgetKms: 12, mode: 'orbit' })!;
    expect(b).not.toBeNull();
    expect(Number.isFinite(b.dvTotalKms)).toBe(true);
  });

  it('flies inward too (Earth to Venus)', () => {
    const v = solveBallistic({ origin: 'Earth', dest: 'Venus', earliestDay: day('2026-11-16'), budgetKms: 6, mode: 'orbit' })!;
    expect(v.feasible).toBe(true);
    expect(v.tofDays).toBeGreaterThan(60);
    expect(v.tofDays).toBeLessThan(260);
  });
});

describe('Earth and the Moon', () => {
  it('the minimum-fuel trip takes about five days and a bit over 3 km/s', () => {
    const plan = solveLunar(true, 3.25, 'orbit');
    expect(plan.feasible).toBe(true);
    expect(plan.tofDays).toBeGreaterThan(3);
    expect(plan.tofDays).toBeLessThan(5.2);
    const none = solveLunar(true, 2.5, 'orbit');
    expect(none.feasible).toBe(false);
    expect(none.dvTotalKms).toBeGreaterThan(3.0);
    expect(none.tofDays).toBeGreaterThan(4.5);
    expect(none.tofDays).toBeLessThan(5.3);
  });

  it('more fuel gets there faster; Apollo took about three days', () => {
    const slow = solveLunar(true, 3.3, 'orbit');
    const fast = solveLunar(true, 6, 'orbit');
    expect(fast.tofDays).toBeLessThan(slow.tofDays);
    expect(fast.tofDays).toBeGreaterThan(0.3);
    const apollo = solveLunar(true, 6, 'orbit', 3.1);
    expect(apollo.tofDays).toBeCloseTo(3.1, 2);
    expect(apollo.dvTotalKms).toBeGreaterThan(3.1);
    expect(apollo.dvTotalKms).toBeLessThan(3.6);
    const profile = lunarProfile(apollo, true, 9000);
    expect(profile.totalTime).toBeCloseTo(3.1 * 86400, -2);
    expect(profile.trajectory!.frame).toBe('Earth');
    expect(profile.trajectory!.paramAt(0)).toBeCloseTo(0, 6);
    expect(profile.trajectory!.paramAt(1)).toBeCloseTo(1, 6);
  });

  it('the return trip mirrors the outward one', () => {
    const out = solveLunar(true, 6, 'flyby', 4);
    const back = solveLunar(false, 6, 'flyby', 4);
    expect(back.tofDays).toBeCloseTo(out.tofDays, 6);
    expect(back.radii[0]).toBeGreaterThan(back.radii[back.radii.length - 1]);
  });
});

describe('ion drive spiral', () => {
  const start = day('2026-11-16');
  it('Earth to Mars at one hundred-thousandth of a g takes about two years', () => {
    const plan = solveSpiral('Earth', 'Mars', start, 9.80665e-5, 30)!;
    expect(plan.dvNeededKms).toBeGreaterThan(5.5);
    expect(plan.dvNeededKms).toBeLessThan(6.5);
    expect(plan.tofDays).toBeGreaterThan(600);
    expect(plan.tofDays).toBeLessThan(800);
    expect(plan.feasible).toBe(true);
    expect(plan.waitDays).toBeGreaterThanOrEqual(0);
    expect(plan.waitDays).toBeLessThan(830);

    const profile = spiralProfile(plan, 'Earth', 'Mars');
    const t = profile.trajectory!;
    const earth = [0, 0, 0];
    const mars = [0, 0, 0];
    bodyPosition('Earth', plan.departDay, earth);
    bodyPosition('Mars', plan.departDay + plan.tofDays, mars);
    const last = (t.count - 1) * 3;
    expect(Math.hypot(t.points[0] - earth[0], t.points[1] - earth[1], t.points[2] - earth[2])).toBeLessThan(1e-9);
    expect(Math.hypot(t.points[last] - mars[0], t.points[last + 1] - mars[1], t.points[last + 2] - mars[2])).toBeLessThan(1e-9);
    // The launch waited until the ideal spiral ends near Mars: the correction blended in is small
    // (Mars's orbit is oval, so the ideal circle misses it by up to about 0.15 AU).
    const mid = Math.floor(t.count / 2) * 3;
    const radius = Math.hypot(t.points[mid], t.points[mid + 1]);
    expect(radius).toBeGreaterThan(0.95);
    expect(radius).toBeLessThan(1.7);
    expect(profile.atFraction(0.5).phase).toBe('spiral');
  });

  it('half the thrust takes twice as long; too small a budget is flagged', () => {
    const a = solveSpiral('Earth', 'Jupiter', start, 1e-4, 30)!;
    const b = solveSpiral('Earth', 'Jupiter', start, 5e-5, 10)!;
    expect(b.tofDays).toBeCloseTo(a.tofDays * 2, 3);
    expect(a.feasible).toBe(true);
    expect(b.feasible).toBe(false);
  });

  it('Earth to the Moon is a long spiral round Earth', () => {
    const plan = solveSpiral('Earth', 'Moon', start, 1e-4, 30)!;
    expect(plan.geocentric).toBe(true);
    expect(plan.dvNeededKms).toBeGreaterThan(6);
    expect(plan.dvNeededKms).toBeLessThan(7.2);
    expect(plan.tofDays).toBeGreaterThan(600);
  });
});

describe('direct flights', () => {
  it('aims at where the destination will be', () => {
    // A ship that always takes exactly 100 days.
    const plan = solveDirect('Earth', 'Mars', 9000, () => 100 * 86400);
    const mars = [0, 0, 0];
    bodyPosition('Mars', 9100, mars);
    expect(plan.tofDays).toBeCloseTo(100, 6);
    expect(plan.r2[0]).toBeCloseTo(mars[0], 9);
    expect(plan.distanceMeters).toBeGreaterThan(5e10);
  });
});
