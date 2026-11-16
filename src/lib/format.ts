import { SPEED_OF_LIGHT, SECONDS_IN_YEAR } from '../physics/kinematicsEngine';

/**
 * Plain-language formatting for every number the interface shows.
 * One module so the panels, the chart and the map never disagree about how "3 y 6 mo" is written.
 */

export const AU_METERS = 1.495978707e11;
export const LIGHTYEAR_METERS = 9.4607304725808e15;
export const PARSEC_METERS = 3.085677581e16;

export const SECONDS_IN_MINUTE = 60;
export const SECONDS_IN_HOUR = 3600;
export const SECONDS_IN_DAY = 86400;
export const SECONDS_IN_MONTH = SECONDS_IN_YEAR / 12;

const NBSP = ' ';

const group = (n: number, maxFractionDigits = 0): string =>
  n.toLocaleString('en-US', { maximumFractionDigits: maxFractionDigits, minimumFractionDigits: 0 });

/** Round to `digits` significant figures and print without exponent. */
export function sig(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return '∞';
  if (n === 0) return '0';
  const magnitude = Math.floor(Math.log10(Math.abs(n)));
  const decimals = Math.max(0, digits - 1 - magnitude);
  const rounded = Number(n.toFixed(Math.min(decimals, 20)));
  return rounded.toLocaleString('en-US', { maximumFractionDigits: Math.min(decimals, 20), minimumFractionDigits: 0 });
}

/** "42,300", "2.54 million", "1.2 billion". */
export function formatCount(n: number, digits = 3): string {
  const abs = Math.abs(n);
  if (!Number.isFinite(n)) return '∞';
  if (abs >= 1e12) return `${sig(n / 1e12, digits)} trillion`;
  if (abs >= 1e9) return `${sig(n / 1e9, digits)} billion`;
  if (abs >= 1e6) return `${sig(n / 1e6, digits)} million`;
  if (abs >= 1000) return group(Number(n.toPrecision(digits)));
  return sig(n, digits);
}

interface DurationUnit {
  seconds: number;
  short: string;
  long: [string, string];
}

const UNITS: DurationUnit[] = [
  { seconds: SECONDS_IN_YEAR, short: 'y', long: ['year', 'years'] },
  { seconds: SECONDS_IN_MONTH, short: 'mo', long: ['month', 'months'] },
  { seconds: SECONDS_IN_DAY, short: 'd', long: ['day', 'days'] },
  { seconds: SECONDS_IN_HOUR, short: 'h', long: ['hour', 'hours'] },
  { seconds: SECONDS_IN_MINUTE, short: 'min', long: ['minute', 'minutes'] },
  { seconds: 1, short: 's', long: ['second', 'seconds'] },
];

export interface DurationOptions {
  /** How many units to show, most significant first. Default 2 ("3 y 6 mo"). */
  parts?: 1 | 2 | 3;
  /** Write units as words ("3 years 6 months") instead of abbreviations. */
  long?: boolean;
}

/**
 * Human duration.
 * "32 s" · "5 min 19 s" · "2 d 6 h" · "3 y 6 mo" · "423 y" · "42,300 y" · "2.54 million y".
 * Under one second: "0.34 s". Zero or invalid: "0 s".
 */
export function formatDuration(seconds: number, options: DurationOptions = {}): string {
  const { parts = 2, long = false } = options;
  const unitLabel = (u: DurationUnit, value: number) => (long ? `${NBSP}${value === 1 ? u.long[0] : u.long[1]}` : `${NBSP}${u.short}`);
  if (seconds === Infinity) return '∞';
  if (!(seconds > 0)) return `0${unitLabel(UNITS[5], 0)}`;

  if (seconds < 1) {
    const text = seconds >= 0.01 ? seconds.toFixed(2) : sig(seconds, 2);
    return `${text}${unitLabel(UNITS[5], 2)}`;
  }

  const years = seconds / SECONDS_IN_YEAR;
  if (years >= 100) {
    // Past a century the months stop meaning anything.
    const text = years >= 1e6 ? formatCount(years, 3) : group(Math.round(years >= 10_000 ? Number(years.toPrecision(3)) : years));
    return `${text}${unitLabel(UNITS[0], 2)}`;
  }

  // Find the largest unit that fits, then take `parts` consecutive units:
  // whole numbers for the leading units, the last one rounded.
  let first = UNITS.findIndex((u) => seconds >= u.seconds);
  if (first < 0) first = UNITS.length - 1;
  const end = Math.min(first + parts - 1, UNITS.length - 1);

  const values: number[] = [];
  let remaining = seconds;
  for (let i = first; i <= end; i++) {
    const u = UNITS[i];
    const value = i === end ? Math.round(remaining / u.seconds) : Math.floor(remaining / u.seconds + 1e-9);
    remaining -= value * u.seconds;
    values.push(value);
  }

  // Rounding the last unit can fill it up ("59 min 60 s"): carry into the unit above.
  // (A month is not a whole number of days, so days never fill a month here; the rest are exact.)
  const unitsPerParent = (i: number): number => UNITS[i - 1].seconds / UNITS[i].seconds;
  for (let i = end; i > first; i--) {
    if (values[i - first] >= unitsPerParent(i)) {
      values[i - first] = 0;
      values[i - first - 1] += 1;
    }
  }
  if (first > 0 && values[0] >= unitsPerParent(first)) {
    // The leading unit itself filled up (59 min 59.7 s → 1 h).
    return formatDuration(UNITS[first - 1].seconds, options);
  }

  const out: string[] = [];
  values.forEach((value, k) => {
    if (value > 0) out.push(`${group(value)}${unitLabel(UNITS[first + k], value)}`);
  });
  if (out.length === 0) return `0${unitLabel(UNITS[end], 0)}`;
  return out.join(' ');
}

/** Words instead of abbreviations: "2 years 4 months", "0.34 seconds". */
export const formatDurationLong = (seconds: number, parts: 1 | 2 | 3 = 2): string =>
  formatDuration(seconds, { parts, long: true });

export interface DistanceOptions {
  /** "light-years" instead of "ly". */
  long?: boolean;
}

/**
 * Human distance, choosing the unit by size.
 * "384,400 km" · "0.64 AU" · "39.5 AU" · "4.23 ly" · "26,700 ly" · "2.54 million ly".
 */
export function formatDistance(meters: number, options: DistanceOptions = {}): string {
  const { long = false } = options;
  if (!Number.isFinite(meters)) return '∞';
  if (!(meters > 0)) return `0${NBSP}km`;
  const ly = meters / LIGHTYEAR_METERS;
  if (ly >= 0.1) {
    const unit = long ? (Math.abs(ly - 1) < 0.005 ? 'light-year' : 'light-years') : 'ly';
    const text = ly >= 1e6 ? formatCount(ly, 3) : ly >= 1000 ? group(Number(ly.toPrecision(3))) : sig(ly, 3);
    return `${text}${NBSP}${unit}`;
  }
  const au = meters / AU_METERS;
  if (au >= 0.01) return `${au >= 1000 ? group(Number(au.toPrecision(3))) : sig(au, 3)}${NBSP}AU`;
  const km = meters / 1000;
  if (km >= 1e6) return `${sig(km / 1e6, 3)}${NBSP}million km`;
  return `${group(Number(km.toPrecision(4)))}${NBSP}km`;
}

/**
 * Human speed.
 * Below 1% of light speed: "968 km/s", "16.3 km/s". Above: "0.949 c", "0.999 c".
 * Faster than light (warp): "10 × c".
 */
export function formatSpeed(metersPerSecond: number): string {
  if (metersPerSecond === Infinity) return '∞';
  if (!(metersPerSecond > 0)) return `0${NBSP}km/s`;
  const beta = metersPerSecond / SPEED_OF_LIGHT;
  if (beta > 1.0000001) return `${sig(beta, 3)}${NBSP}×${NBSP}c`;
  if (beta >= 0.01) return `${formatBeta(beta)}${NBSP}c`;
  const kms = metersPerSecond / 1000;
  return `${kms >= 100 ? group(Math.round(kms)) : sig(kms, 3)}${NBSP}km/s`;
}

/**
 * A fraction of light speed with enough decimals to tell 0.99 from 0.999:
 * three decimals normally, more as the value crowds toward 1.
 */
export function formatBeta(beta: number): string {
  if (beta >= 0.9995) return beta.toFixed(5).replace(/0+$/, '').replace(/\.$/, '') || '1';
  if (beta >= 0.995) return beta.toFixed(4).replace(/0$/, '');
  return beta.toFixed(3);
}

/**
 * Lorentz factor. Shows the interesting digits: "1.0000050", "1.25", "3.18", "22.4".
 */
export function formatGamma(gamma: number): string {
  if (!Number.isFinite(gamma)) return '∞';
  const excess = gamma - 1;
  if (excess <= 0) return '1';
  if (excess < 0.01) {
    // Keep two significant digits of the part above 1, up to seven decimals.
    const decimals = Math.min(7, Math.ceil(-Math.log10(excess)) + 1);
    return gamma.toFixed(decimals);
  }
  if (gamma < 10) return gamma.toFixed(2);
  if (gamma < 100) return gamma.toFixed(1);
  return group(Math.round(gamma));
}

/** Ship mass: "25 t", "1,000 t", "2.5 million t". */
export function formatMass(kg: number): string {
  const tonnes = kg / 1000;
  if (tonnes >= 1e6) return `${sig(tonnes / 1e6, 3)}${NBSP}million t`;
  return `${group(Number(tonnes.toPrecision(3)))}${NBSP}t`;
}

/** Acceleration in g: "1.00 g", "0.10 g", "0.005 g", "0.00001 g" (ion drives). */
export function formatAccel(g: number): string {
  if (g > 0 && g < 0.001) return `${sig(g, 2)}${NBSP}g`;
  return `${g < 0.01 ? g.toFixed(3) : g.toFixed(2)}${NBSP}g`;
}

/** A change of velocity ("fuel budget") in km/s: "4.3 km/s", "12.5 km/s", "38 km/s", "120 km/s". */
export function formatDeltaV(kms: number): string {
  if (!Number.isFinite(kms)) return '∞';
  if (!(kms > 0)) return `0${NBSP}km/s`;
  return `${kms >= 100 ? group(Math.round(kms)) : kms >= 20 ? String(Math.round(kms)) : kms.toFixed(1)}${NBSP}km/s`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A calendar date from a day number (days since 2000-01-01 12:00 UT): "18 Feb 2021".
 * Fractional day numbers round to the nearest calendar day.
 */
export function formatDate(day: number): string {
  if (!Number.isFinite(day)) return '';
  const d = new Date((Math.round(day) + 10957.5) * 86400000);
  return `${d.getUTCDate()}${NBSP}${MONTHS[d.getUTCMonth()]}${NBSP}${d.getUTCFullYear()}`;
}

/** Warp factor: "10 × light speed". */
export function formatWarpFactor(factor: number): string {
  return `${Number.isInteger(factor) ? factor : factor.toFixed(1)}${NBSP}×${NBSP}light speed`;
}

/** Percentage 0..100 from a 0..1 fraction, whole numbers. */
export const formatPercent = (fraction: number): string => `${Math.round(Math.min(Math.max(fraction, 0), 1) * 100)}%`;
