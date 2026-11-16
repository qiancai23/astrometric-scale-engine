import type { EngineId, FlightSpec } from '../types';
import { isEngineId } from '../data/engines';

/**
 * A flight lives in the page address so it can be shared:
 *   ?from=sol&to=proxima-centauri&engine=antimatter&a=1&v=0.999
 * `from` / `to` are catalog slugs. `a` is acceleration in g, `v` the speed limit as a fraction of
 * light speed, `w` the warp factor, `m` the ship mass in tonnes. Solar-system flights add `date`
 * (earliest launch, YYYY-MM-DD), and for the chemical rocket and ion drive `dv` (fuel budget in
 * km/s), `arr=flyby` and `tof` (a pinned travel time in days). Everything except from/to is
 * optional and falls back to the engine's defaults (and today's date).
 */

const num = (raw: string | null): number | undefined => {
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const isoDate = (raw: string | null): string | undefined => {
  const text = (raw ?? '').trim();
  return text.length === 10 && !Number.isNaN(Date.parse(`${text}T12:00:00Z`)) ? text : undefined;
};

/** Read a flight from a query string (`location.search`). Returns null when there is none. */
export function parseFlightSpec(search: string): FlightSpec | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const from = params.get('from')?.trim().toLowerCase();
  const to = params.get('to')?.trim().toLowerCase();
  if (!from || !to) return null;
  const engineRaw = (params.get('engine') ?? params.get('drive') ?? '').trim().toLowerCase();
  const engine: EngineId = isEngineId(engineRaw) ? engineRaw : 'fusion';
  return {
    from,
    to,
    engine,
    a: num(params.get('a')),
    v: num(params.get('v')),
    w: num(params.get('w')),
    m: num(params.get('m')),
    date: isoDate(params.get('date')),
    dv: num(params.get('dv')),
    arr: params.get('arr') === 'flyby' ? 'flyby' : undefined,
    tof: num(params.get('tof')),
  };
}

/** Trim a number for the address bar: up to 6 significant digits, no trailing zeros. */
const compact = (n: number): string => String(Number(n.toPrecision(6)));

/** Build the query string (starting with `?`) for a flight. */
export function buildFlightQuery(spec: FlightSpec): string {
  const params = new URLSearchParams();
  params.set('from', spec.from);
  params.set('to', spec.to);
  params.set('engine', spec.engine);
  if (spec.engine === 'warp') {
    if (spec.w !== undefined) params.set('w', compact(spec.w));
  } else {
    if (spec.a !== undefined) params.set('a', compact(spec.a));
    if (spec.v !== undefined) params.set('v', compact(spec.v));
  }
  if (spec.m !== undefined) params.set('m', compact(spec.m));
  if (spec.date) params.set('date', spec.date);
  if (spec.dv !== undefined) params.set('dv', compact(spec.dv));
  if (spec.arr === 'flyby') params.set('arr', 'flyby');
  if (spec.tof !== undefined) params.set('tof', compact(spec.tof));
  return `?${params.toString()}`;
}

/** Full shareable address for a flight, based on the current page. */
export function buildFlightUrl(spec: FlightSpec, base: string = typeof window !== 'undefined' ? window.location.href : 'https://astro.brucedgates.com/'): string {
  const url = new URL(base);
  url.search = buildFlightQuery(spec);
  url.hash = '';
  return url.toString();
}
