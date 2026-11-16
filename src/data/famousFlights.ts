import type { FlightSpec } from '../types';

/** A ready-made flight offered on the first screen. */
export interface FamousFlight {
  id: string;
  /** Button text, e.g. "Apollo to the Moon". */
  label: string;
  /** One line shown as a tooltip or under the label. */
  blurb: string;
  spec: FlightSpec;
}

/**
 * Famous flights, nearest first. The historical missions carry their real launch date and travel
 * time (`date`, `tof`): the app then works out the coasting orbit for that date and the fuel it
 * takes, which can be compared with what the real rocket delivered.
 */
export const FAMOUS_FLIGHTS: readonly FamousFlight[] = [
  {
    id: 'apollo-moon',
    label: 'Apollo to the Moon',
    blurb: 'Apollo 11, 16 July 1969: a little over three days from Earth orbit to lunar orbit.',
    spec: { from: 'earth', to: 'moon', engine: 'chemical', date: '1969-07-16', tof: 3.16, dv: 6, m: 45 },
  },
  {
    id: 'earth-mars-1g',
    label: 'Earth to Mars at 1 g',
    blurb: 'A fusion torch holding Earth gravity the whole way. Days, not months.',
    spec: { from: 'earth', to: 'mars', engine: 'fusion', a: 1, v: 0.2, m: 1000 },
  },
  {
    id: 'mariner-7-mars',
    label: 'Mariner 7 past Mars',
    blurb: 'Launched 27 March 1969 and flew past Mars 131 days later without braking.',
    spec: { from: 'earth', to: 'mars', engine: 'chemical', date: '1969-03-27', tof: 131, arr: 'flyby', dv: 6, m: 25 },
  },
  {
    id: 'perseverance-mars',
    label: 'Perseverance to Mars',
    blurb: 'Launched 30 July 2020, landed 203 days later. The atmosphere did the braking.',
    spec: { from: 'earth', to: 'mars', engine: 'chemical', date: '2020-07-30', tof: 203, arr: 'flyby', dv: 6, m: 25 },
  },
  {
    id: 'new-horizons-pluto',
    label: 'New Horizons to Pluto',
    blurb: 'Launched 19 January 2006, nine and a half years to Pluto. The real probe got a free boost from Jupiter; flying direct takes more fuel.',
    spec: { from: 'earth', to: 'pluto', engine: 'chemical', date: '2006-01-19', tof: 3463, arr: 'flyby', dv: 12, m: 25 },
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
export const DEFAULT_FLIGHT: FlightSpec = (FAMOUS_FLIGHTS.find((f) => f.id === 'earth-mars-1g') as FamousFlight).spec;

/** Default route when the visitor switches map without choosing anything. */
export const DEFAULT_ROUTE = {
  Systemic: { from: 'earth', to: 'mars' },
  Interstellar: { from: 'sol', to: 'proxima-centauri' },
} as const;
