import type { FlightSpec } from '../types';
import { C_TO_KMS } from './engines';

/** A ready-made flight offered on the first screen. */
export interface FamousFlight {
  id: string;
  /** Button text, e.g. "Apollo to the Moon". */
  label: string;
  /** One line shown as a tooltip or under the label. */
  blurb: string;
  spec: FlightSpec;
}

const kms = (speedKms: number): number => speedKms / C_TO_KMS;

/**
 * Famous flights, nearest first. Speeds for the historical missions are set so the travel time
 * comes out close to what really happened (real missions do not fly straight lines, so these are
 * approximations and the blurbs say so).
 */
export const FAMOUS_FLIGHTS: readonly FamousFlight[] = [
  {
    id: 'apollo-moon',
    label: 'Apollo to the Moon',
    blurb: 'A chemical rocket coasting at about 1.4 km/s: roughly three days, like Apollo 11.',
    spec: { from: 'earth', to: 'moon', engine: 'chemical', a: 1, v: kms(1.45), m: 45 },
  },
  {
    id: 'earth-mars-1g',
    label: 'Earth to Mars at 1 g',
    blurb: 'A fusion torch holding Earth gravity the whole way. Days, not months.',
    spec: { from: 'earth', to: 'mars', engine: 'fusion', a: 1, v: 0.2, m: 1000 },
  },
  {
    id: 'new-horizons-pluto',
    label: 'New Horizons to Pluto',
    blurb: 'The fastest launch ever, about 16 km/s. Still close to a decade.',
    spec: { from: 'earth', to: 'pluto', engine: 'chemical', a: 3, v: kms(16.3), m: 25 },
  },
  {
    id: 'sol-proxima',
    label: 'Sol to Proxima Centauri',
    blurb: 'The nearest star, by antimatter rocket at 1 g. The clocks start to split.',
    spec: { from: 'sol', to: 'proxima-centauri', engine: 'antimatter', a: 1, v: 0.999, m: 1000 },
  },
  {
    id: 'warp-sirius',
    label: 'Warp to Sirius',
    blurb: 'The brightest star in the sky at ten times light speed.',
    spec: { from: 'sol', to: 'sirius', engine: 'warp', w: 10, m: 1000 },
  },
  {
    id: 'galactic-center',
    label: '1 g to the galactic center',
    blurb: 'Sagittarius A*, 26,700 light-years away. Whole civilizations pass at home.',
    spec: { from: 'sol', to: 'sagittarius-a', engine: 'antimatter', a: 1, v: 0.999, m: 1000 },
  },
  {
    id: 'andromeda',
    label: '1 g to Andromeda',
    blurb: 'Another galaxy, 2.5 million light-years away. The longest trip in the catalog.',
    spec: { from: 'sol', to: 'andromeda-galaxy-m31', engine: 'antimatter', a: 1, v: 0.999, m: 1000 },
  },
];

/** The flight shown on a first visit with no flight in the page address. */
export const DEFAULT_FLIGHT: FlightSpec = FAMOUS_FLIGHTS[1].spec;

/** Default route when the visitor switches map without choosing anything. */
export const DEFAULT_ROUTE = {
  Systemic: { from: 'earth', to: 'mars' },
  Interstellar: { from: 'sol', to: 'proxima-centauri' },
} as const;
