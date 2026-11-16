import {
  formatDuration,
  formatDurationLong,
  formatDistance,
  formatSpeed,
  formatGamma,
  formatMass,
  formatCount,
  formatBeta,
  AU_METERS,
  LIGHTYEAR_METERS,
} from './format';
import { SPEED_OF_LIGHT } from '../physics/kinematicsEngine';
import { ENGINES, getSublightEngine, speedToSlider, sliderToSpeed, accelToSlider, sliderToAccel, massToSlider, sliderToMass, compareEngines, defaultEngineSettings } from '../data/engines';
import { parseFlightSpec, buildFlightQuery } from './urlState';

// The formatters put a non-breaking space between number and unit; compare with plain spaces.
const plain = (s: string) => s.replace(/ /g, ' ');

const MIN = 60;
const HOUR = 3600;
const DAY = 86400;
const YEAR = 31557600;
const MONTH = YEAR / 12;

describe('formatDuration', () => {
  it.each([
    [0, '0 s'],
    [NaN, '0 s'],
    [0.34, '0.34 s'],
    [32, '32 s'],
    [5 * MIN + 19, '5 min 19 s'],
    [2 * DAY + 6 * HOUR + 49 * MIN, '2 d 7 h'],
    [36 * DAY + 21 * HOUR, '1 mo 6 d'],
    [154 * DAY, '5 mo 2 d'],
    [3 * YEAR + 6 * MONTH, '3 y 6 mo'],
    [5 * YEAR + 10 * MONTH, '5 y 10 mo'],
    [423 * YEAR, '423 y'],
    [42_300 * YEAR, '42,300 y'],
    [2.54e6 * YEAR, '2.54 million y'],
  ])('%p → %p', (seconds, expected) => {
    expect(plain(formatDuration(seconds))).toBe(expected);
  });

  it('never prints an overflowing smaller unit', () => {
    expect(plain(formatDuration(59 * MIN + 59.7))).toBe('1 h');
    expect(plain(formatDuration(23 * HOUR + 59 * MIN + 40))).toBe('1 d');
    expect(plain(formatDuration(YEAR - 1))).toBe('11 mo 30 d');
    expect(plain(formatDuration(YEAR + 11.7 * MONTH))).toBe('2 y');
    expect(plain(formatDuration(99 * YEAR + 11.9 * MONTH))).toBe('100 y');
    expect(plain(formatDuration(59.6))).toBe('1 min');
  });

  it('supports one and three parts and long units', () => {
    expect(plain(formatDuration(2 * DAY + 6 * HOUR + 49 * MIN, { parts: 3 }))).toBe('2 d 6 h 49 min');
    expect(plain(formatDuration(3 * YEAR + 6 * MONTH, { parts: 1 }))).toBe('4 y');
    expect(plain(formatDurationLong(2 * YEAR + 4 * MONTH))).toBe('2 years 4 months');
    expect(plain(formatDurationLong(YEAR + MONTH))).toBe('1 year 1 month');
    expect(plain(formatDurationLong(0.34))).toBe('0.34 seconds');
  });

  it('is stable for every magnitude (no NaN, no negative, no "60")', () => {
    for (let e = -3; e <= 15; e += 0.137) {
      const text = plain(formatDuration(Math.pow(10, e)));
      expect(text).not.toMatch(/NaN|undefined|-/);
      expect(text).not.toMatch(/\b60 (s|min)\b|\b24 h\b|\b12 mo\b/);
    }
  });
});

describe('other formatters', () => {
  it('formats distances by scale', () => {
    expect(plain(formatDistance(384_400_000))).toBe('384,400 km');
    expect(plain(formatDistance(0.64 * AU_METERS))).toBe('0.64 AU');
    expect(plain(formatDistance(39.5 * AU_METERS))).toBe('39.5 AU');
    expect(plain(formatDistance(4.2465 * LIGHTYEAR_METERS))).toBe('4.25 ly');
    expect(plain(formatDistance(4.2465 * LIGHTYEAR_METERS, { long: true }))).toBe('4.25 light-years');
    expect(plain(formatDistance(26_673 * LIGHTYEAR_METERS))).toBe('26,700 ly');
    expect(plain(formatDistance(2.537e6 * LIGHTYEAR_METERS))).toBe('2.54 million ly');
    expect(plain(formatDistance(0))).toBe('0 km');
  });

  it('formats speeds by scale', () => {
    expect(plain(formatSpeed(968_000))).toBe('968 km/s');
    expect(plain(formatSpeed(16_300))).toBe('16.3 km/s');
    expect(plain(formatSpeed(0.949 * SPEED_OF_LIGHT))).toBe('0.949 c');
    expect(plain(formatSpeed(0.999 * SPEED_OF_LIGHT))).toBe('0.999 c');
    expect(plain(formatSpeed(10 * SPEED_OF_LIGHT))).toBe('10 × c');
    expect(formatBeta(0.99)).toBe('0.990');
  });

  it('formats Lorentz factors with the interesting digits', () => {
    expect(formatGamma(1)).toBe('1');
    expect(formatGamma(1.000005)).toBe('1.0000050');
    expect(formatGamma(1.25)).toBe('1.25');
    expect(formatGamma(3.18)).toBe('3.18');
    expect(formatGamma(22.366)).toBe('22.4');
  });

  it('formats mass and counts', () => {
    expect(plain(formatMass(1_000_000))).toBe('1,000 t');
    expect(plain(formatMass(2.5e9))).toBe('2.5 million t');
    expect(formatCount(42_300)).toBe('42,300');
    expect(formatCount(2.54e6)).toBe('2.54 million');
  });
});

describe('engines', () => {
  it('tops out the antimatter rocket at 0.999 c', () => {
    expect(getSublightEngine('antimatter').maxC).toBe(0.999);
  });

  it('slider mappings round-trip and stay in range', () => {
    for (const engine of ENGINES) {
      if (engine.drive !== 'Sublight') continue;
      for (let p = 0; p <= 1.0001; p += 0.05) {
        const pos = Math.min(p, 1);
        const speed = sliderToSpeed(engine, pos);
        expect(speed).toBeGreaterThanOrEqual(engine.minC);
        expect(speed).toBeLessThanOrEqual(engine.maxC);
        expect(speedToSlider(engine, speed)).toBeCloseTo(pos, 6);
        const g = sliderToAccel(engine, pos);
        expect(g).toBeGreaterThanOrEqual(engine.minG);
        expect(g).toBeLessThanOrEqual(engine.maxG);
        expect(accelToSlider(engine, g)).toBeCloseTo(pos, 6);
        expect(massToSlider(sliderToMass(pos))).toBeCloseTo(pos, 6);
      }
    }
  });

  it('spaces the antimatter speed slider by nines', () => {
    const e = getSublightEngine('antimatter');
    const p9 = speedToSlider(e, 0.9);
    const p99 = speedToSlider(e, 0.99);
    const p999 = speedToSlider(e, 0.999);
    expect(p999).toBeCloseTo(1, 9);
    expect(p99 - p9).toBeCloseTo(p999 - p99, 6);
  });

  it('compares all five engines on a shared log bar', () => {
    const rows = compareEngines(4.2465 * LIGHTYEAR_METERS, 1e6, defaultEngineSettings(), 10);
    expect(rows.map((r) => r.engine.id)).toEqual(['chemical', 'ion', 'fusion', 'antimatter', 'warp']);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].earthSeconds).toBeLessThan(rows[i - 1].earthSeconds);
      expect(rows[i].logFraction).toBeLessThan(rows[i - 1].logFraction);
    }
    expect(rows[0].logFraction).toBe(1);
    expect(rows[4].logFraction).toBeGreaterThanOrEqual(0.04);
    expect(compareEngines(0, 1e6, defaultEngineSettings(), 10).every((r) => r.earthSeconds === 0)).toBe(true);
  });
});

describe('urlState', () => {
  it('round-trips a sublight flight', () => {
    const query = buildFlightQuery({ from: 'sol', to: 'proxima-centauri', engine: 'antimatter', a: 1, v: 0.999, m: 1000 });
    expect(query).toBe('?from=sol&to=proxima-centauri&engine=antimatter&a=1&v=0.999&m=1000');
    expect(parseFlightSpec(query)).toEqual({ from: 'sol', to: 'proxima-centauri', engine: 'antimatter', a: 1, v: 0.999, w: undefined, m: 1000 });
  });

  it('round-trips a warp flight and ignores junk', () => {
    expect(buildFlightQuery({ from: 'sol', to: 'sirius', engine: 'warp', w: 10, a: 1, v: 0.5 })).toBe('?from=sol&to=sirius&engine=warp&w=10');
    expect(parseFlightSpec('?from=Sol&to=Sirius&engine=bogus&a=abc')).toEqual({ from: 'sol', to: 'sirius', engine: 'fusion', a: undefined, v: undefined, w: undefined, m: undefined });
    expect(parseFlightSpec('')).toBeNull();
    expect(parseFlightSpec('?from=sol')).toBeNull();
  });
});
