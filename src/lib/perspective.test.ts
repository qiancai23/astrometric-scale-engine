/** @jest-environment node */
import { buildPerspective, PerspectiveInput, worldEnergyUse, WORLD_ENERGY_EJ_PER_YEAR } from './perspective';
import { SECONDS_IN_YEAR } from '../physics/kinematicsEngine';
import { LIGHTYEAR_METERS, AU_METERS } from './format';

const YEAR = SECONDS_IN_YEAR;

const base: PerspectiveInput = {
  distanceMeters: 4.2465 * LIGHTYEAR_METERS,
  earthSeconds: 12 * YEAR,
  shipSeconds: 8 * YEAR,
  energyExajoules: 1000,
  drive: 'Sublight',
  regime: 'Interstellar',
  originName: 'Sol',
  destinationName: 'Proxima Centauri',
};

const row = (rows: ReturnType<typeof buildPerspective>, id: string) => rows.find((r) => r.id === id);

describe('buildPerspective', () => {
  test('light time for Sol to Proxima is about 4.2 years', () => {
    const rows = buildPerspective(base);
    expect(rows[0].id).toBe('light');
    expect(rows[0].value).toMatch(/^4\s*y\s*[23]\s*mo$/);
  });

  test('star map always shows the Voyager 1 row', () => {
    const rows = buildPerspective(base);
    expect(row(rows, 'voyager')).toBeDefined();
    expect(row(rows, 'mission')).toBeUndefined();
  });

  test('mission matching works both ways and ignores case', () => {
    const sys = { ...base, regime: 'Systemic' as const, distanceMeters: 0.5 * AU_METERS };
    const a = buildPerspective({ ...sys, originName: 'Earth', destinationName: 'Mars' });
    const b = buildPerspective({ ...sys, originName: 'mars', destinationName: 'EARTH' });
    expect(row(a, 'mission')?.label).toBe("NASA's Curiosity rover took");
    expect(row(a, 'mission')?.value).toBe('253 days');
    expect(row(b, 'mission')).toEqual(row(a, 'mission'));
    expect(row(a, 'voyager')).toBeUndefined();
  });

  test('unmatched solar-system pair falls back to Voyager 1', () => {
    const rows = buildPerspective({ ...base, regime: 'Systemic', originName: 'Mars', destinationName: 'Saturn' });
    expect(row(rows, 'voyager')).toBeDefined();
  });

  test('human scale branches', () => {
    const at = (years: number) => row(buildPerspective({ ...base, earthSeconds: years * YEAR }), 'human');
    expect(at(0.5)).toBeUndefined();
    expect(at(1.2)?.value).toBe('1 year old');
    expect(at(30.7)?.value).toBe('30 years old');
    expect(at(500)?.value).toBe('20 generations');
    expect(at(2_540_000)?.label).toBe('All of recorded history fits');
    expect(at(2_540_000)?.value).toBe('508 times over');
  });

  test('energy unit selection', () => {
    const ej = (seconds: number) => (seconds / YEAR) * WORLD_ENERGY_EJ_PER_YEAR;
    expect(worldEnergyUse(ej(30))).toBe('30 seconds of world energy use');
    expect(worldEnergyUse(ej(600))).toBe('10 minutes of world energy use');
    expect(worldEnergyUse(ej(7200))).toBe('2 hours of world energy use');
    expect(worldEnergyUse(ej(86400 * 5))).toBe('5 days of world energy use');
    expect(worldEnergyUse(WORLD_ENERGY_EJ_PER_YEAR * 320)).toBe('320 years of world energy use');
    expect(worldEnergyUse(WORLD_ENERGY_EJ_PER_YEAR * 2.1e6)).toBe('2.1 million years of world energy use');
    expect(worldEnergyUse(0)).toMatch(/less than a second/);
  });

  test('warp energy row is notional and carries a note', () => {
    const rows = buildPerspective({ ...base, drive: 'Warp' });
    const energy = row(rows, 'energy');
    expect(energy?.label).toBe('Warp energy (notional)');
    expect(energy?.note).toBe('A placeholder model, not real physics.');
    expect(row(buildPerspective(base), 'energy')?.note).toBeUndefined();
  });

  test('never more than 4 rows, light first', () => {
    const rows = buildPerspective({ ...base, regime: 'Systemic', originName: 'Earth', destinationName: 'Moon' });
    expect(rows.length).toBeLessThanOrEqual(4);
    expect(rows[0].id).toBe('light');
  });

  test.each([
    ['1 km', 1000, 0.01, 0.01, 0],
    ['2.5 million light-years', 2.5e6 * LIGHTYEAR_METERS, 2.5e6 * YEAR, 28 * YEAR, 1e30],
    ['zero everything', 0, 0, 0, 0],
  ])('no NaN, undefined or Infinity for %s', (_name, distanceMeters, earthSeconds, shipSeconds, energyExajoules) => {
    for (const drive of ['Sublight', 'Warp'] as const) {
      const rows = buildPerspective({ ...base, distanceMeters, earthSeconds, shipSeconds, energyExajoules, drive });
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.value).not.toMatch(/NaN|undefined|Infinity/);
        expect(r.label).not.toMatch(/NaN|undefined|Infinity/);
      }
    }
  });
});
