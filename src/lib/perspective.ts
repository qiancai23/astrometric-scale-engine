import { SPEED_OF_LIGHT, SECONDS_IN_YEAR } from '../physics/kinematicsEngine';
import { formatCount, formatDuration, SECONDS_IN_DAY, SECONDS_IN_HOUR, SECONDS_IN_MINUTE } from './format';

/**
 * "In perspective": comparisons that make a trip's scale felt.
 * Pure function so it can be tested without React.
 */

export interface PerspectiveInput {
  distanceMeters: number;
  earthSeconds: number;
  shipSeconds: number;
  /** Kinetic energy at peak speed (sublight) or the placeholder reactor figure (warp), in exajoules. */
  energyExajoules: number;
  drive: 'Sublight' | 'Warp';
  regime: 'Systemic' | 'Interstellar';
  originName: string;
  destinationName: string;
}

export interface PerspectiveRow {
  id: string;
  label: string;
  value: string;
  note?: string;
}

/** Humanity's total energy use, about 620 exajoules per year (roughly 20 terawatts, all fuels). */
export const WORLD_ENERGY_EJ_PER_YEAR = 620;
/** Voyager 1's speed, about 17 km/s. */
export const VOYAGER_1_METERS_PER_SECOND = 17000;
/** A generation, for the "how many generations went by" comparison. */
export const YEARS_PER_GENERATION = 25;
/** Rough length of recorded human history. */
export const RECORDED_HISTORY_YEARS = 5000;

interface Mission {
  a: string;
  b: string;
  label: string;
  value: string;
}

/** Real spacecraft journeys between the bodies of the solar system (either direction). */
const MISSIONS: Mission[] = [
  { a: 'earth', b: 'moon', label: 'Apollo 11 took', value: '3 days' },
  { a: 'earth', b: 'mars', label: "NASA's Curiosity rover took", value: '253 days' },
  { a: 'earth', b: 'jupiter', label: "NASA's Juno took", value: '5 years' },
  { a: 'earth', b: 'saturn', label: 'Cassini took', value: '7 years' },
  { a: 'earth', b: 'pluto', label: 'New Horizons took', value: '9.5 years' },
  { a: 'earth', b: 'neptune', label: 'Voyager 2 took', value: '12 years' },
  { a: 'earth', b: 'uranus', label: 'Voyager 2 took', value: '8.5 years' },
  { a: 'earth', b: 'mercury', label: 'MESSENGER took', value: '6.6 years (with flybys)' },
  { a: 'earth', b: 'venus', label: 'Mariner 2 took', value: '110 days' },
];

const findMission = (from: string, to: string): Mission | undefined => {
  const p = from.trim().toLowerCase();
  const q = to.trim().toLowerCase();
  return MISSIONS.find((m) => (m.a === p && m.b === q) || (m.a === q && m.b === p));
};

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** "320 years of world energy use", "45 seconds of world energy use". */
export function worldEnergyUse(exajoules: number): string {
  const seconds = (Math.max(exajoules, 0) / WORLD_ENERGY_EJ_PER_YEAR) * SECONDS_IN_YEAR;
  if (!Number.isFinite(seconds)) return 'more than all the world could supply';
  if (seconds < 1) return 'less than a second of world energy use';
  const units: [number, string, string][] = [
    [SECONDS_IN_MINUTE, 'second', 'seconds'],
    [SECONDS_IN_HOUR, 'minute', 'minutes'],
    [SECONDS_IN_DAY, 'hour', 'hours'],
    [SECONDS_IN_YEAR, 'day', 'days'],
  ];
  const divisors = [1, SECONDS_IN_MINUTE, SECONDS_IN_HOUR, SECONDS_IN_DAY];
  for (let i = 0; i < units.length; i++) {
    if (seconds < units[i][0]) {
      const n = Number((seconds / divisors[i]).toPrecision(2));
      // Rounding can reach the next unit's size (59.7 s → "60 seconds"): fall through to the next unit.
      if (n * divisors[i] >= units[i][0]) continue;
      return `${formatCount(n, 2)} ${plural(n, units[i][1], units[i][2])} of world energy use`;
    }
  }
  const years = seconds / SECONDS_IN_YEAR;
  const n = Number(years.toPrecision(2));
  return `${formatCount(years, 2)} ${plural(n, 'year', 'years')} of world energy use`;
}

const humanScaleRow = (earthSeconds: number): PerspectiveRow | null => {
  const years = earthSeconds / SECONDS_IN_YEAR;
  if (!Number.isFinite(years) || years < 1) return null;
  if (years < 100) {
    const n = Math.max(1, Math.floor(years));
    return { id: 'human', label: 'A child born the day you leave would be', value: `${n} ${plural(n, 'year', 'years')} old` };
  }
  if (years <= 10_000) {
    return { id: 'human', label: 'On Earth, that is about', value: `${formatCount(years / YEARS_PER_GENERATION, 2)} generations` };
  }
  return {
    id: 'human',
    label: 'All of recorded history fits',
    value: `${formatCount(years / RECORDED_HISTORY_YEARS, 2)} times over`,
  };
};

const clean = (row: PerspectiveRow): boolean => !/NaN|undefined|Infinity|∞/.test(row.value);

export function buildPerspective(input: PerspectiveInput): PerspectiveRow[] {
  const rows: PerspectiveRow[] = [];

  rows.push({
    id: 'light',
    label: 'Light makes this trip in',
    value: formatDuration(input.distanceMeters / SPEED_OF_LIGHT),
  });

  const mission = input.regime === 'Systemic' ? findMission(input.originName, input.destinationName) : undefined;
  if (mission) {
    rows.push({ id: 'mission', label: mission.label, value: mission.value });
  } else {
    rows.push({
      id: 'voyager',
      label: 'Voyager 1 would need',
      value: formatDuration(input.distanceMeters / VOYAGER_1_METERS_PER_SECOND),
    });
  }

  const human = humanScaleRow(input.earthSeconds);
  if (human) rows.push(human);

  if (input.drive === 'Warp') {
    rows.push({
      id: 'energy',
      label: 'Warp energy (notional)',
      value: worldEnergyUse(input.energyExajoules),
      note: 'A placeholder model, not real physics.',
    });
  } else {
    rows.push({ id: 'energy', label: 'Energy to reach peak speed', value: worldEnergyUse(input.energyExajoules) });
  }

  return rows.filter((r, i) => i === 0 || clean(r)).slice(0, 4);
}
