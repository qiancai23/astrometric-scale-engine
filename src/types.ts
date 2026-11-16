/**
 * Shared types for the Astrometric Scale Engine.
 * Kept free of imports so every module (catalog, store, physics helpers, UI) can depend on it
 * without creating import cycles.
 */

/** A raw record from `scripts/systemic.json` or `scripts/stars.json`. */
export interface AstroObject {
  id: string;
  name: string;
  catalog_origin?: string;
  type?: string;
  mag?: number;
  /** Systemic regime: astronomical units. Interstellar regime: parsecs. Sol is at the origin. */
  coords: [number, number, number];
  orbit_path?: [number, number, number][];
  display_metrics?: {
    constellation?: string | null;
    apparent_magnitude?: number | null;
    true_distance_ly?: number;
    scale_narrative?: string;
  };
}

export type DriveCore = 'Sublight' | 'Warp';

/** Which map (and coordinate unit) is active: the solar system in AU, or the stars in parsecs. */
export type AstrometricRegime = 'Systemic' | 'Interstellar';

export type SublightEngineId = 'chemical' | 'ion' | 'fusion' | 'antimatter';
export type EngineId = SublightEngineId | 'warp';

/** Which end of the flight a control is editing. */
export type Endpoint = 'origin' | 'destination';

/**
 * A complete, shareable description of a flight. This is what lives in the page address
 * and what a "famous flight" shortcut loads.
 */
export interface FlightSpec {
  /** Catalog slug of the origin, for example `earth` or `sol`. */
  from: string;
  /** Catalog slug of the destination, for example `mars` or `proxima-centauri`. */
  to: string;
  engine: EngineId;
  /** Acceleration in g (sublight engines). */
  a?: number;
  /** Speed limit as a fraction of light speed (sublight engines). */
  v?: number;
  /** Warp factor, multiples of light speed (warp engine). */
  w?: number;
  /** Ship mass in tonnes. */
  m?: number;
}

/** Map layers the visitor can switch on and off. */
export interface MapLayers {
  /** Exoplanets (1,561 of them; they sit on top of their host stars). Off by default. */
  exoplanets: boolean;
  /** Name labels for the brightest and nearest objects. */
  labels: boolean;
  /** Orbit lines of planets and small bodies (solar-system map only). */
  orbits: boolean;
  /** The dimmed Milky Way photograph behind the map. */
  milkyWay: boolean;
}
