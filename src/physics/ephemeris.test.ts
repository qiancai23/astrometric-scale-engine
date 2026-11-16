import * as systemicData from '../../scripts/systemic.json';
import {
  bodyPosition,
  bodyState,
  dayFromIso,
  isoFromDay,
  hasEphemeris,
  orbitalPeriodDays,
  solveKepler,
  MU_SUN,
  AU_PER_DAY_TO_KMS,
} from './ephemeris';

interface Raw {
  name: string;
  coords: [number, number, number];
  orbit_path?: [number, number, number][];
}
const raw = ((systemicData as unknown as { default?: Raw[] }).default ?? (systemicData as unknown as Raw[])) as Raw[];

/**
 * `scripts/build_data.py` sampled each orbit from JPL Horizons at 101 evenly spaced moments
 * between 1 January of (2024 − half a period) and 1 January of (2024 + half a period), clamped to
 * 1900..2190. These are the periods (years) that script used, so the sample dates can be rebuilt.
 */
const PERIODS: Record<string, number> = {
  Mercury: 0.24, Venus: 0.615, Earth: 1.0, Moon: 0.074, Mars: 1.88, Jupiter: 11.86, Saturn: 29.46,
  Uranus: 84.01, Neptune: 164.8, Pluto: 248.0, Ceres: 4.6, Eris: 558.0, Haumea: 284.0, Makemake: 306.0,
  Sedna: 11400.0, Quaoar: 288.0, Orcus: 247.0, Gonggong: 554.0, Vesta: 3.63, Pallas: 4.62, Juno: 4.36,
  Hygiea: 5.56, Psyche: 4.99, Eros: 1.76, Bennu: 1.19, Ryugu: 1.3,
};

const midnight = (year: number): number => (dayFromIso(`${year}-01-01`) as number) - 0.5;
const sampleDay = (name: string, k: number): number => {
  const half = PERIODS[name] / 2;
  const start = midnight(Math.trunc(Math.max(1900, 2024 - half)));
  const stop = midnight(Math.trunc(Math.min(2190, 2024 + half)));
  return start + ((stop - start) * k) / 100;
};

describe('dates', () => {
  it('round-trips calendar dates and day numbers', () => {
    expect(dayFromIso('2000-01-01')).toBe(0);
    expect(isoFromDay(0)).toBe('2000-01-01');
    expect(isoFromDay(dayFromIso('1969-03-27') as number)).toBe('1969-03-27');
    expect(dayFromIso('2026-11-16')).toBe(9816);
    expect(dayFromIso('not a date')).toBeNull();
  });
});

describe('Kepler equation', () => {
  it('solves for circular, moderate and very elongated orbits', () => {
    for (const e of [0, 0.1, 0.5, 0.86, 0.97]) {
      for (const M of [-3, -0.4, 0, 0.001, 1, 2.5, 3.1, 7]) {
        const E = solveKepler(M, e);
        const back = E - e * Math.sin(E);
        const diff = Math.atan2(Math.sin(back - M), Math.cos(back - M));
        expect(Math.abs(diff)).toBeLessThan(1e-10);
      }
    }
  });
});

describe('positions against the JPL Horizons samples stored in scripts/systemic.json', () => {
  const p = [0, 0, 0];
  for (const body of raw) {
    if (!body.orbit_path || body.name === 'Moon') continue;
    it(`${body.name} is where Horizons put it`, () => {
      expect(hasEphemeris(body.name)).toBe(true);
      const major = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(body.name);
      for (const k of [0, 25, 50, 75, 100]) {
        const want = body.orbit_path![k];
        bodyPosition(body.name, sampleDay(body.name, k), p);
        const err = Math.hypot(p[0] - want[0], p[1] - want[1], p[2] - want[2]);
        const dist = Math.hypot(want[0], want[1], want[2]);
        // Planets: within 0.3% of their distance from the Sun (about 0.2 degrees).
        // Small bodies use one fixed orbit for all dates, so allow 8% (about 5 degrees).
        expect(err / dist).toBeLessThan(major ? 0.003 : 0.08);
      }
    });
  }

  it('the Moon is within 5 degrees of where Horizons put it, relative to Earth', () => {
    const earth = raw.find((b) => b.name === 'Earth')!;
    const moon = raw.find((b) => b.name === 'Moon')!;
    const day = midnight(2023);
    const e = [0, 0, 0];
    const m = [0, 0, 0];
    bodyPosition('Earth', day, e);
    bodyPosition('Moon', day, m);
    const got = [m[0] - e[0], m[1] - e[1], m[2] - e[2]];
    const want = [moon.coords[0] - earth.coords[0], moon.coords[1] - earth.coords[1], moon.coords[2] - earth.coords[2]];
    const dot = got[0] * want[0] + got[1] * want[1] + got[2] * want[2];
    const angle = Math.acos(dot / (Math.hypot(...got) * Math.hypot(...want)));
    expect(angle).toBeLessThan((5 * Math.PI) / 180);
    expect(Math.hypot(...got)).toBeGreaterThan(0.0023);
    expect(Math.hypot(...got)).toBeLessThan(0.0028);
  });
});

describe('velocities and periods', () => {
  it('Earth moves at about 29.8 km/s and takes a year', () => {
    const s = bodyState('Earth', 9000);
    const speed = Math.hypot(...s.v) * AU_PER_DAY_TO_KMS;
    expect(speed).toBeGreaterThan(29.2);
    expect(speed).toBeLessThan(30.4);
    expect(orbitalPeriodDays('Earth')).toBeCloseTo(365.26, 1);
    expect(orbitalPeriodDays('Mars')).toBeCloseTo(686.98, 0);
  });

  it('velocity matches the change in position', () => {
    for (const name of ['Mercury', 'Mars', 'Ceres', 'Sedna']) {
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      const h = 0.01;
      bodyPosition(name, 5000 - h, a);
      bodyPosition(name, 5000 + h, b);
      const s = bodyState(name, 5000);
      for (let k = 0; k < 3; k++) {
        const numeric = (b[k] - a[k]) / (2 * h);
        expect(Math.abs(numeric - s.v[k])).toBeLessThan(2e-6 + 1e-3 * Math.abs(s.v[k]));
      }
    }
    expect(MU_SUN).toBeCloseTo(2.9591220828e-4, 12);
  });
});
