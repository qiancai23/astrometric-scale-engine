import type { EngineId, SublightEngineId } from '../types';
import { KinematicsEngine, SPEED_OF_LIGHT } from '../physics/kinematicsEngine';

/** Standard gravity in m/s². */
export const GRAVITY = 9.80665;
/** Kilometres per hour in one light speed. Used wherever a speed limit is shown in kph. */
export const C_TO_KPH = (SPEED_OF_LIGHT * 3600) / 1000;
/** Kilometres per second in one light speed. */
export const C_TO_KMS = SPEED_OF_LIGHT / 1000;

/**
 * How a speed-limit slider is spaced.
 * - `linear`: even steps between the minimum and maximum.
 * - `nines`: even steps per "nine" (0.9, 0.99, 0.999), so the relativistic end is not squeezed
 *   into the last pixel of the slider.
 */
export type SpeedScale = 'linear' | 'nines';

export interface SublightEngine {
  id: SublightEngineId;
  drive: 'Sublight';
  /** Full name, e.g. "Antimatter rocket". */
  label: string;
  /** Short name for tight spaces, e.g. "Antimatter". */
  shortLabel: string;
  /** One line shown under the name. */
  blurb: string;
  minG: number;
  maxG: number;
  defaultG: number;
  /** Speed limits as fractions of light speed. */
  minC: number;
  maxC: number;
  defaultC: number;
  speedScale: SpeedScale;
  /** Show the speed limit in km/s instead of fractions of c (slow engines). */
  speedInKms: boolean;
  hypothetical: boolean;
}

export interface WarpEngine {
  id: 'warp';
  drive: 'Warp';
  label: string;
  shortLabel: string;
  blurb: string;
  minFactor: number;
  maxFactor: number;
  defaultFactor: number;
  hypothetical: true;
}

export type EngineDef = SublightEngine | WarpEngine;

/**
 * The five engine tiers, slowest to fastest.
 * The antimatter rocket's speed limit tops out at 0.999 c (Lorentz factor about 22.4).
 */
export const ENGINES: readonly EngineDef[] = [
  {
    id: 'chemical',
    drive: 'Sublight',
    label: 'Chemical rocket',
    shortLabel: 'Chemical',
    blurb: 'What we fly today. Burns for minutes, then coasts.',
    minG: 0.01,
    maxG: 3,
    defaultG: 1,
    minC: 1 / C_TO_KMS, // 1 km/s
    maxC: 0.0001, // about 30 km/s
    defaultC: 0.0001,
    speedScale: 'linear',
    speedInKms: true,
    hypothetical: false,
  },
  {
    id: 'ion',
    drive: 'Sublight',
    label: 'Ion drive',
    shortLabel: 'Ion',
    blurb: 'A gentle push that never stops.',
    minG: 0.001,
    maxG: 0.1,
    defaultG: 0.1,
    minC: 0.001,
    maxC: 0.01,
    defaultC: 0.01,
    speedScale: 'linear',
    speedInKms: true,
    hypothetical: false,
  },
  {
    id: 'fusion',
    drive: 'Sublight',
    label: 'Fusion torch',
    shortLabel: 'Fusion',
    blurb: 'Earth gravity for days on end.',
    minG: 0.01,
    maxG: 1,
    defaultG: 1,
    minC: 0.02,
    maxC: 0.2,
    defaultC: 0.2,
    speedScale: 'linear',
    speedInKms: false,
    hypothetical: false,
  },
  {
    id: 'antimatter',
    drive: 'Sublight',
    label: 'Antimatter rocket',
    shortLabel: 'Antimatter',
    blurb: 'Close enough to light speed for time to bend.',
    minG: 0.01,
    maxG: 3,
    defaultG: 1,
    minC: 0.1,
    maxC: 0.999,
    defaultC: 0.999,
    speedScale: 'nines',
    speedInKms: false,
    hypothetical: false,
  },
  {
    id: 'warp',
    drive: 'Warp',
    label: 'Warp drive',
    shortLabel: 'Warp',
    blurb: 'Alcubierre bubble. No time dilation, no known way to build one.',
    minFactor: 1,
    maxFactor: 50,
    defaultFactor: 10,
    hypothetical: true,
  },
];

export const ENGINE_IDS: readonly EngineId[] = ENGINES.map((e) => e.id);
export const SUBLIGHT_ENGINE_IDS: readonly SublightEngineId[] = ['chemical', 'ion', 'fusion', 'antimatter'];

export const MIN_MASS_KG = 25_000;
export const MAX_MASS_KG = 50_000_000_000;
export const DEFAULT_MASS_KG = 1_000_000;

export function getEngine(id: EngineId): EngineDef {
  const engine = ENGINES.find((e) => e.id === id);
  if (!engine) throw new Error(`Unknown engine: ${id}`);
  return engine;
}

export function getSublightEngine(id: SublightEngineId): SublightEngine {
  return getEngine(id) as SublightEngine;
}

export function isEngineId(value: unknown): value is EngineId {
  return typeof value === 'string' && (ENGINE_IDS as readonly string[]).includes(value);
}

export const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/** The tuned settings remembered for one sublight engine. */
export interface SublightSettings {
  accelerationG: number;
  speedCapC: number;
}

export type EngineSettings = Record<SublightEngineId, SublightSettings>;

export function defaultEngineSettings(): EngineSettings {
  const settings = {} as EngineSettings;
  for (const id of SUBLIGHT_ENGINE_IDS) {
    const e = getSublightEngine(id);
    settings[id] = { accelerationG: e.defaultG, speedCapC: e.defaultC };
  }
  return settings;
}

export function clampSublightSettings(id: SublightEngineId, s: SublightSettings): SublightSettings {
  const e = getSublightEngine(id);
  return {
    accelerationG: clamp(Number.isFinite(s.accelerationG) ? s.accelerationG : e.defaultG, e.minG, e.maxG),
    speedCapC: clamp(Number.isFinite(s.speedCapC) ? s.speedCapC : e.defaultC, e.minC, e.maxC),
  };
}

/* ------------------------------------------------------------------ */
/* Slider mapping: every slider in the UI runs 0..1 and maps through   */
/* these helpers, so the store value and the slider never disagree.    */
/* ------------------------------------------------------------------ */

const nines = (c: number): number => -Math.log10(1 - c);

/** Speed limit (fraction of c) to a slider position 0..1. */
export function speedToSlider(engine: SublightEngine, speedC: number): number {
  const v = clamp(speedC, engine.minC, engine.maxC);
  if (engine.speedScale === 'nines') {
    return (nines(v) - nines(engine.minC)) / (nines(engine.maxC) - nines(engine.minC));
  }
  return (v - engine.minC) / (engine.maxC - engine.minC);
}

/** Slider position 0..1 to a speed limit (fraction of c). */
export function sliderToSpeed(engine: SublightEngine, position: number): number {
  const p = clamp(position, 0, 1);
  if (engine.speedScale === 'nines') {
    const n = nines(engine.minC) + p * (nines(engine.maxC) - nines(engine.minC));
    return clamp(1 - Math.pow(10, -n), engine.minC, engine.maxC);
  }
  return clamp(engine.minC + p * (engine.maxC - engine.minC), engine.minC, engine.maxC);
}

/** Acceleration (g) to slider position 0..1. Logarithmic, because the ranges span up to 300x. */
export function accelToSlider(engine: SublightEngine, g: number): number {
  const v = clamp(g, engine.minG, engine.maxG);
  return Math.log(v / engine.minG) / Math.log(engine.maxG / engine.minG);
}

export function sliderToAccel(engine: SublightEngine, position: number): number {
  const p = clamp(position, 0, 1);
  return clamp(engine.minG * Math.pow(engine.maxG / engine.minG, p), engine.minG, engine.maxG);
}

/** Ship mass (kg) to slider position 0..1. Logarithmic. */
export function massToSlider(massKg: number): number {
  const v = clamp(massKg, MIN_MASS_KG, MAX_MASS_KG);
  return Math.log(v / MIN_MASS_KG) / Math.log(MAX_MASS_KG / MIN_MASS_KG);
}

export function sliderToMass(position: number): number {
  const p = clamp(position, 0, 1);
  return clamp(MIN_MASS_KG * Math.pow(MAX_MASS_KG / MIN_MASS_KG, p), MIN_MASS_KG, MAX_MASS_KG);
}

/** Named ship class for a mass, e.g. "corvette". */
export function shipClass(massKg: number): string {
  const tonnes = massKg / 1000;
  if (tonnes <= 75) return 'scout';
  if (tonnes <= 5_000) return 'corvette';
  if (tonnes <= 10_000) return 'frigate';
  if (tonnes <= 100_000) return 'cruiser';
  if (tonnes <= 1_000_000) return 'carrier';
  if (tonnes <= 5_000_000) return 'battleship';
  if (tonnes <= 10_000_000) return 'dreadnought';
  return 'generation ship';
}

/** A plain-language gloss for an acceleration, e.g. "feels like Earth". */
export function accelFeel(g: number): string {
  if (g < 0.02) return 'barely a nudge';
  if (g < 0.12) return 'a gentle lean';
  if (g < 0.25) return 'like the Moon';
  if (g < 0.5) return 'like Mars';
  if (g < 0.9) return 'lighter than Earth';
  if (g <= 1.1) return 'feels like Earth';
  if (g <= 2) return 'heavy, but bearable';
  return 'fighter-pilot heavy';
}

/* ------------------------------------------------------------------ */
/* Side-by-side comparison of every engine for one route.              */
/* ------------------------------------------------------------------ */

export interface EngineComparison {
  engine: EngineDef;
  /** Time that passes on Earth, seconds. 0 when there is no route. */
  earthSeconds: number;
  /** Time that passes on the ship, seconds. */
  shipSeconds: number;
  /** Peak speed in m/s. */
  peakVelocity: number;
  /**
   * 0..1 position of this engine's Earth time on a logarithmic bar shared by all five engines
   * (longest trip = 1). Never below 0.04 so a bar is always visible.
   */
  logFraction: number;
}

export function compareEngines(
  distanceMeters: number,
  massKg: number,
  settings: EngineSettings,
  warpFactor: number,
): EngineComparison[] {
  const rows = ENGINES.map((engine) => {
    if (!(distanceMeters > 0)) {
      return { engine, earthSeconds: 0, shipSeconds: 0, peakVelocity: 0, logFraction: 0 };
    }
    if (engine.drive === 'Warp') {
      const r = KinematicsEngine.calculateWarp(distanceMeters, warpFactor, massKg);
      return { engine, earthSeconds: r.coordinateTime, shipSeconds: r.properTime, peakVelocity: r.peakVelocity, logFraction: 0 };
    }
    const s = clampSublightSettings(engine.id, settings[engine.id]);
    const r = KinematicsEngine.calculateSublight({
      distance: distanceMeters,
      acceleration: s.accelerationG * GRAVITY,
      velocityCeiling: s.speedCapC * SPEED_OF_LIGHT,
      mass: massKg,
    });
    return { engine, earthSeconds: r.coordinateTime, shipSeconds: r.properTime, peakVelocity: r.peakVelocity, logFraction: 0 };
  });

  const times = rows.map((r) => r.earthSeconds).filter((t) => t > 0);
  if (times.length === 0) return rows;

  // Shared log scale. The floor sits a little under the fastest trip so the fastest bar is short
  // but visible; the longest trip fills the bar.
  const logMax = Math.log10(Math.max(...times));
  const logMin = Math.min(Math.log10(Math.min(...times)), logMax - 1) - 0.35;
  for (const row of rows) {
    if (row.earthSeconds > 0) {
      const f = (Math.log10(row.earthSeconds) - logMin) / (logMax - logMin);
      row.logFraction = clamp(f, 0.04, 1);
    }
  }
  return rows;
}
