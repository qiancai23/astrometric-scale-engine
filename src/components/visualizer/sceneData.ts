import * as THREE from 'three';
import { entriesFor, CatalogEntry } from '../../data/catalog';
import { bodyPosition, hasEphemeris } from '../../physics/ephemeris';
import type { AstrometricRegime } from '../../types';

/**
 * Scene data for the 3D map: where every catalog object sits in scene units, how big and what
 * shape its sprite is, and the true sizes of the solar-system bodies.
 *
 * Scene units:
 * - Systemic (solar-system map): 1 unit = 1 AU. The catalog's ecliptic plane (x, y) is laid flat
 *   on the scene's horizontal plane (x, z) so "up" on screen is out of the ecliptic.
 * - Interstellar (star map): 1 unit = 20 parsecs (catalog parsecs × 0.05). Axes are kept as in the
 *   catalog so the Milky Way backdrop stays aligned.
 */

export const INTERSTELLAR_SCALE = 0.05;
const AU_M = 1.495978707e11;
const PC_M = 3.085677581e16;
const KM_PER_AU = 1.495978707e8;

/** Metres represented by one scene unit. */
export const metersPerUnit = (regime: AstrometricRegime): number =>
  regime === 'Systemic' ? AU_M : PC_M / INTERSTELLAR_SCALE;

/** Catalog coordinates to scene coordinates. Writes into `out` and returns it. */
export function toScene(c: readonly [number, number, number] | readonly number[], regime: AstrometricRegime, out: THREE.Vector3): THREE.Vector3 {
  if (regime === 'Systemic') return out.set(c[0], c[2], -c[1]);
  return out.set(c[0] * INTERSTELLAR_SCALE, c[1] * INTERSTELLAR_SCALE, c[2] * INTERSTELLAR_SCALE);
}

/** Sprite shapes understood by the point shader. */
export const Shape = {
  star: 0,
  ring: 1,
  diamond: 2,
  nebula: 3,
  galaxy: 4,
  blackHole: 5,
  smallBody: 6,
  dwarf: 7,
} as const;

/** Solar-system bodies drawn as meshes on the solar-system map (radius in km, min on-screen radius in CSS px). */
export const BODY_SPECS: Record<string, { radiusKm: number; minPx: number; ring?: 'saturn' | 'uranus' }> = {
  Sol: { radiusKm: 696340, minPx: 4.5 },
  Mercury: { radiusKm: 2440, minPx: 2.0 },
  Venus: { radiusKm: 6052, minPx: 2.7 },
  Earth: { radiusKm: 6371, minPx: 2.8 },
  Moon: { radiusKm: 1737, minPx: 1.6 },
  Mars: { radiusKm: 3390, minPx: 2.3 },
  Jupiter: { radiusKm: 69911, minPx: 4.5 },
  Saturn: { radiusKm: 58232, minPx: 4.0, ring: 'saturn' },
  Uranus: { radiusKm: 25362, minPx: 3.2, ring: 'uranus' },
  Neptune: { radiusKm: 24622, minPx: 3.2 },
};

export const bodyRadiusUnits = (name: string): number => (BODY_SPECS[name]?.radiusKm ?? 1000) / KM_PER_AU;

export interface SpriteStyle {
  /** Sprite diameter in CSS px (before device pixel ratio). */
  size: number;
  /** Core radius as a fraction of the sprite radius (stars only). */
  core: number;
  shape: number;
  /** 1 when the sprite twinkles. */
  twinkle: number;
}

/** Brighter stars get larger dots: core diameter 1.9..7.5 CSS px from apparent magnitude. */
export function starCoreDiameter(magnitude: number | undefined): number {
  if (magnitude === undefined || !Number.isFinite(magnitude)) return 2.0;
  const t = Math.min(Math.max((7.5 - magnitude) / 9, 0), 1);
  return 1.9 + Math.pow(t, 1.3) * 5.6;
}

const HALO = 2.6; // sprite diameter / core diameter for stars

export function spriteStyle(entry: CatalogEntry): SpriteStyle {
  switch (entry.kind) {
    case 'star': {
      if (entry.regime === 'Systemic') return { size: 9 * HALO, core: 1 / HALO, shape: Shape.star, twinkle: 0 };
      const core = starCoreDiameter(entry.magnitude);
      return { size: core * HALO, core: 1 / HALO, shape: Shape.star, twinkle: 1 };
    }
    case 'exoplanet':
      return { size: 9, core: 0, shape: Shape.ring, twinkle: 0 };
    case 'spacecraft':
      return { size: 9, core: 0, shape: Shape.diamond, twinkle: 0 };
    case 'nebula':
      return { size: 16, core: 0, shape: Shape.nebula, twinkle: 0 };
    case 'galaxy':
      return { size: 20, core: 0, shape: Shape.galaxy, twinkle: 0 };
    case 'black-hole':
      return { size: 14, core: 0, shape: Shape.blackHole, twinkle: 0 };
    case 'dwarf-planet':
      return { size: 8, core: 0, shape: Shape.dwarf, twinkle: 0 };
    default:
      return { size: 4, core: 0, shape: Shape.smallBody, twinkle: 0 };
  }
}

/** Points-layer buffers for a list of entries. */
export interface PointBuffers {
  /** Indices into `RegimeData.entries`. */
  indices: number[];
  position: Float32Array;
  color: Float32Array;
  size: Float32Array;
  core: Float32Array;
  shape: Float32Array;
  phase: Float32Array;
  twinkle: Float32Array;
}

export interface RegimeData {
  regime: AstrometricRegime;
  entries: CatalogEntry[];
  /** id → index into entries. */
  index: Map<string, number>;
  /**
   * Scene positions, 3 per entry. On the solar-system map these follow the date: see
   * `setSystemicDay`.
   */
  pos: Float32Array;
  /** Day number the solar-system positions were last computed for (NaN before the first time). */
  day: number;
  /** Goes up whenever `pos` changes, so point layers know to re-upload their positions. */
  posVersion: number;
  prominence: Float32Array;
  isExo: Uint8Array;
  /** Main field (stars, glyphs, small bodies). */
  field: PointBuffers;
  /** Exoplanet layer. */
  exo: PointBuffers;
  /** Entries drawn as meshes (solar-system map). */
  bodies: number[];
}

const tmpColor = new THREE.Color();
const tmpVec = new THREE.Vector3();

/** sRGB components (0..1) of a CSS color, for custom shaders that write straight to the screen. */
export function srgb(css: string, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
  try {
    tmpColor.setStyle(css, THREE.SRGBColorSpace);
  } catch {
    tmpColor.setRGB(1, 1, 1, THREE.SRGBColorSpace);
  }
  const c = { r: 1, g: 1, b: 1 };
  tmpColor.getRGB(c, THREE.SRGBColorSpace);
  return out.set(c.r, c.g, c.b);
}

/** Cheap deterministic hash of a string to 0..1 (twinkle phase). */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function buildPoints(entries: CatalogEntry[], pos: Float32Array, indices: number[]): PointBuffers {
  const n = indices.length;
  const b: PointBuffers = {
    indices,
    position: new Float32Array(n * 3),
    color: new Float32Array(n * 3),
    size: new Float32Array(n),
    core: new Float32Array(n),
    shape: new Float32Array(n),
    phase: new Float32Array(n),
    twinkle: new Float32Array(n),
  };
  indices.forEach((ei, k) => {
    const e = entries[ei];
    b.position[k * 3] = pos[ei * 3];
    b.position[k * 3 + 1] = pos[ei * 3 + 1];
    b.position[k * 3 + 2] = pos[ei * 3 + 2];
    srgb(e.color, tmpVec);
    b.color[k * 3] = tmpVec.x;
    b.color[k * 3 + 1] = tmpVec.y;
    b.color[k * 3 + 2] = tmpVec.z;
    const st = spriteStyle(e);
    b.size[k] = st.size;
    b.core[k] = st.core;
    b.shape[k] = st.shape;
    b.twinkle[k] = st.twinkle;
    b.phase[k] = hash01(e.id);
  });
  return b;
}

const cache: Partial<Record<AstrometricRegime, RegimeData>> = {};

export function regimeData(regime: AstrometricRegime): RegimeData {
  const hit = cache[regime];
  if (hit) return hit;
  const entries = entriesFor(regime);
  const n = entries.length;
  const pos = new Float32Array(n * 3);
  const prominence = new Float32Array(n);
  const isExo = new Uint8Array(n);
  const index = new Map<string, number>();
  const fieldIdx: number[] = [];
  const exoIdx: number[] = [];
  const bodies: number[] = [];
  const v = new THREE.Vector3();
  entries.forEach((e, i) => {
    index.set(e.id, i);
    toScene(e.obj.coords, regime, v);
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = v.z;
    prominence[i] = e.prominence;
    if (e.kind === 'exoplanet') {
      isExo[i] = 1;
      exoIdx.push(i);
      return;
    }
    if (regime === 'Systemic' && BODY_SPECS[e.catalogName]) {
      bodies.push(i);
      // Sol also gets a glow sprite in the field.
      if (e.kind === 'star') fieldIdx.push(i);
      return;
    }
    fieldIdx.push(i);
  });
  const data: RegimeData = {
    regime,
    entries,
    index,
    pos,
    day: NaN,
    posVersion: 0,
    prominence,
    isExo,
    field: buildPoints(entries, pos, fieldIdx),
    exo: buildPoints(entries, pos, exoIdx),
    bodies,
  };
  cache[regime] = data;
  return data;
}

const dayScratch = [0, 0, 0];

/**
 * Move every body of the solar-system map to where it is on `day` (a day number, see
 * `src/physics/ephemeris.ts`). Cheap enough to call every frame; does nothing when the day has
 * not changed.
 */
export function setSystemicDay(data: RegimeData, day: number): void {
  if (data.regime !== 'Systemic' || data.day === day || !Number.isFinite(day)) return;
  data.day = day;
  data.posVersion++;
  const { entries, pos } = data;
  for (let i = 0; i < entries.length; i++) {
    const name = entries[i].catalogName;
    if (!hasEphemeris(name)) continue;
    bodyPosition(name, day, dayScratch);
    // Ecliptic (x, y, z) to scene (x, z, -y), as in `toScene`.
    pos[i * 3] = dayScratch[0];
    pos[i * 3 + 1] = dayScratch[2];
    pos[i * 3 + 2] = -dayScratch[1];
  }
  const f = data.field;
  for (let k = 0; k < f.indices.length; k++) {
    const i = f.indices[k];
    f.position[k * 3] = pos[i * 3];
    f.position[k * 3 + 1] = pos[i * 3 + 1];
    f.position[k * 3 + 2] = pos[i * 3 + 2];
  }
}

/** Index of the entry with this catalog name ("Earth"), or -1. */
export function indexByName(data: RegimeData, name: string): number {
  for (let i = 0; i < data.entries.length; i++) if (data.entries[i].catalogName === name) return i;
  return -1;
}

/** Scene position of an entry by id (in the given regime's data). */
export function entryPosition(data: RegimeData, id: string, out: THREE.Vector3): THREE.Vector3 | null {
  const i = data.index.get(id);
  if (i === undefined) return null;
  return out.set(data.pos[i * 3], data.pos[i * 3 + 1], data.pos[i * 3 + 2]);
}
