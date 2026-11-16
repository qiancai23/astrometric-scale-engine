/**
 * Catalog module: turns the two raw JSON catalogs (solar system in AU, stars in parsecs) into
 * rich, searchable entries, and provides a forgiving search that makes stars easy to find.
 */
import type { AstroObject, AstrometricRegime } from '../types';
import * as systemicData from '../../scripts/systemic.json';
import * as starsData from '../../scripts/stars.json';
import { constellationByAbbr, constellationByName, constellationFullName, greekByAbbr } from './constellations';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ObjectKind =
  | 'star' | 'planet' | 'moon' | 'dwarf-planet' | 'asteroid'
  | 'exoplanet' | 'nebula' | 'galaxy' | 'black-hole' | 'spacecraft';

export interface CatalogEntry {
  /** Same as obj.id. Unique across both catalogs. */
  id: string;
  /** URL-safe, lowercase, unique within its regime. */
  slug: string;
  /** The object to hand to the flight store (its `name` is the friendly display name). */
  obj: AstroObject;
  regime: AstrometricRegime;
  /** Friendly display name: "Epsilon Eridani" rather than "Eps Eri". */
  name: string;
  /** The name exactly as in the JSON. */
  catalogName: string;
  kind: ObjectKind;
  /** Human label for the kind: "Star", "Dwarf planet", "Black hole", ... */
  kindLabel: string;
  /** e.g. "G2V" (stars only, when parseable). */
  spectralClass?: string;
  spectralLetter?: 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M' | 'D';
  /** Plain-language star type, e.g. "Red dwarf" (stars only). */
  starType?: string;
  /** Physical display color as #rrggbb. */
  color: string;
  /** Apparent magnitude as seen from Earth, when known (lower = brighter). */
  magnitude?: number;
  /** Absolute magnitude computed from apparent magnitude and distance. */
  absMagnitude?: number;
  /** Distance from Sol in meters. */
  distanceFromSolMeters: number;
  /** Full constellation name, e.g. "Centaurus". */
  constellation?: string;
  /** Exoplanets: the host star's name guessed from the planet name. */
  hostName?: string;
  /** Exoplanets: id of the host star's entry, if one exists within 0.05 pc. */
  hostId?: string;
  /** Other names people might type. */
  aliases: string[];
  /** 0..1. How well-known the object is. */
  prominence: number;
  /** One plain sentence about the object. */
  description: string;
}

export interface SearchHit {
  entry: CatalogEntry;
  /** Higher is better. */
  score: number;
  /** Set when the match was on an alias rather than the display name. */
  matchedAlias?: string;
  /** Character ranges [start, end) in entry.name to highlight. */
  ranges: [number, number][];
}

export interface SearchOptions {
  /** Max hits, default 12. */
  limit?: number;
  /** Restrict to one regime. Default: both. */
  regime?: AstrometricRegime;
  /** Restrict to kinds. Default: all. */
  kinds?: ObjectKind[];
  /** Entry id to leave out. */
  excludeId?: string;
}

export interface BrowseGroup {
  id: string;
  label: string;
  description: string;
  regime: AstrometricRegime;
  entries: CatalogEntry[];
}

// ---------------------------------------------------------------------------
// Constants and small helpers
// ---------------------------------------------------------------------------

const AU_M = 1.495978707e11;
const PC_M = 3.085677581e16;
const LY_M = 9.4607304725808e15;

const KIND_BY_TYPE: Record<string, ObjectKind> = {
  Star: 'star',
  Planet: 'planet',
  Moon: 'moon',
  'Dwarf Planet': 'dwarf-planet',
  Asteroid: 'asteroid',
  Exoplanet: 'exoplanet',
  Nebula: 'nebula',
  Galaxy: 'galaxy',
  'Black Hole': 'black-hole',
  Spacecraft: 'spacecraft',
};

const KIND_LABEL: Record<ObjectKind, string> = {
  star: 'Star',
  planet: 'Planet',
  moon: 'Moon',
  'dwarf-planet': 'Dwarf planet',
  asteroid: 'Asteroid',
  exoplanet: 'Exoplanet',
  nebula: 'Nebula',
  galaxy: 'Galaxy',
  'black-hole': 'Black hole',
  spacecraft: 'Spacecraft',
};

/** Extra searchable words per kind (normalized form is built from label + these). */
const KIND_WORDS: Record<ObjectKind, string> = {
  star: 'stars',
  planet: 'planets',
  moon: 'moons',
  'dwarf-planet': 'dwarf planets',
  asteroid: 'asteroids',
  exoplanet: 'exoplanets',
  nebula: 'nebulae nebulas',
  galaxy: 'galaxies',
  'black-hole': 'black holes',
  spacecraft: 'probe',
};

const SOLAR_COLORS: Record<string, string> = {
  Sol: '#ffd27a',
  Mercury: '#a9a9a9',
  Venus: '#d9b382',
  Earth: '#5b8de0',
  Moon: '#c9c9c9',
  Mars: '#d0583a',
  Jupiter: '#d8a878',
  Saturn: '#e6cf9a',
  Uranus: '#9fd4e6',
  Neptune: '#4f7fe0',
};

const SPECTRAL_COLORS: Record<string, string> = {
  O: '#9bb0ff',
  B: '#aabfff',
  A: '#cad7ff',
  F: '#f8f7ff',
  G: '#fff4ea',
  K: '#ffd2a1',
  M: '#ffb56c',
  D: '#dfe7ff',
};

const KIND_COLORS: Partial<Record<ObjectKind, string>> = {
  'dwarf-planet': '#c8b8a6',
  asteroid: '#9a948c',
  exoplanet: '#7fd6c2',
  nebula: '#e58fb5',
  galaxy: '#c9b8ff',
  'black-hole': '#ff9d5c',
  spacecraft: '#e8edf5',
};

/** Hand-written prominence for famous objects (keyed by the catalog name). */
const FAMOUS: Record<string, number> = {
  Sol: 1,
  Sirius: 0.98,
  'Rigil Kentaurus': 0.97,
  'Proxima Centauri': 0.96,
  Polaris: 0.95,
  Betelgeuse: 0.95,
  Vega: 0.95,
  'Sagittarius A*': 0.95,
  'Andromeda Galaxy (M31)': 0.95,
  Rigel: 0.93,
  Arcturus: 0.93,
  'Orion Nebula (M42)': 0.93,
  'Voyager 1': 0.92,
  Toliman: 0.88,
  "Barnard's Star": 0.88,
  Canopus: 0.87,
  Capella: 0.87,
  Procyon: 0.87,
  Altair: 0.87,
  Aldebaran: 0.87,
  Antares: 0.87,
  Spica: 0.86,
  Deneb: 0.86,
  Fomalhaut: 0.86,
  Achernar: 0.85,
  Pollux: 0.85,
  Castor: 0.85,
  Regulus: 0.85,
  'Wolf 359': 0.85,
  'Voyager 2': 0.85,
  'Tau Cet': 0.82,
  Ran: 0.8,
  'Lalande 21185': 0.78,
  'New Horizons': 0.8,
  Algol: 0.78,
  Mira: 0.78,
  Mizar: 0.72,
  Alcor: 0.7,
  'Cygnus X-1': 0.75,
  'Eagle Nebula (M16)': 0.8,
  'Crab Nebula (M1)': 0.8,
  'Ring Nebula (M57)': 0.78,
  'Lagoon Nebula (M8)': 0.76,
};

const FAMOUS_EXO: Record<string, number> = {
  'Proxima Cen b': 0.5,
  'Proxima Cen d': 0.4,
  '51 Peg b': 0.45,
  'TRAPPIST-1 b': 0.45,
  'TRAPPIST-1 c': 0.45,
  'TRAPPIST-1 d': 0.45,
  'TRAPPIST-1 e': 0.5,
  'TRAPPIST-1 f': 0.45,
  'TRAPPIST-1 g': 0.45,
  'TRAPPIST-1 h': 0.45,
};

const SOLAR_PROMINENCE: Record<string, number> = {
  Sol: 1,
  Earth: 0.98,
  Moon: 0.9,
  Mars: 0.95,
  Jupiter: 0.9,
  Saturn: 0.9,
  Venus: 0.88,
  Mercury: 0.86,
  Uranus: 0.86,
  Neptune: 0.86,
  Pluto: 0.8,
};

const ALIAS_TABLE: Record<string, string[]> = {
  Sol: ['Sun', 'The Sun'],
  Earth: ['Terra', 'Home'],
  Moon: ['Luna'],
  'Rigil Kentaurus': ['Alpha Centauri', 'Alpha Centauri A', 'Alpha Cen'],
  Toliman: ['Alpha Centauri B'],
  'Proxima Centauri': ['Alpha Centauri C', 'Proxima'],
  Polaris: ['North Star', 'Pole Star', 'Alpha Ursae Minoris'],
  Sirius: ['Dog Star', 'Alpha Canis Majoris'],
  Vega: ['Alpha Lyrae'],
  Betelgeuse: ['Alpha Orionis'],
  Rigel: ['Beta Orionis'],
  Arcturus: ['Alpha Bootis'],
  Capella: ['Alpha Aurigae'],
  Procyon: ['Alpha Canis Minoris'],
  Altair: ['Alpha Aquilae'],
  Aldebaran: ['Alpha Tauri'],
  Antares: ['Alpha Scorpii'],
  Spica: ['Alpha Virginis'],
  Pollux: ['Beta Geminorum'],
  Castor: ['Alpha Geminorum'],
  Fomalhaut: ['Alpha Piscis Austrini'],
  Deneb: ['Alpha Cygni'],
  Regulus: ['Alpha Leonis'],
  Canopus: ['Alpha Carinae'],
  Achernar: ['Alpha Eridani'],
  Ran: ['Epsilon Eridani', 'Eps Eri'],
  "Barnard's Star": ['Barnards Star', 'Barnard Star'],
  'Wolf 359': ['CN Leonis', 'GJ 406'],
  'Lalande 21185': ['Gliese 411', 'GJ 411'],
  "Luyten's Star": ['GJ 273', 'Gliese 273'],
  'Tau Cet': ['Tau Ceti'],
  Mizar: ['Zeta Ursae Majoris'],
  Alcor: ['80 Ursae Majoris'],
  Algol: ['Demon Star', 'Beta Persei'],
  Mira: ['Omicron Ceti', 'Wonderful Star'],
  Mirach: ['Beta Andromedae'],
  Denebola: ['Beta Leonis'],
  'Cygnus X-1': ['Cyg X-1'],
  'Sagittarius A*': ['Sgr A*', 'Galactic center', 'Galactic centre', 'Milky Way center'],
  'Andromeda Galaxy (M31)': ['M31', 'Andromeda', 'Messier 31'],
  'Orion Nebula (M42)': ['M42', 'Messier 42', 'Great Orion Nebula'],
  'Eagle Nebula (M16)': ['M16', 'Messier 16', 'Pillars of Creation'],
  'Lagoon Nebula (M8)': ['M8', 'Messier 8'],
  'Ring Nebula (M57)': ['M57', 'Messier 57'],
  'Crab Nebula (M1)': ['M1', 'Messier 1'],
  Alcyone: ['Pleiades', 'Seven Sisters'],
  Maia: ['Pleiades'],
  Merope: ['Pleiades'],
  Electra: ['Pleiades'],
  Atlas: ['Pleiades'],
  Pleione: ['Pleiades'],
  Taygeta: ['Pleiades'],
  Celaeno: ['Pleiades'],
  Sterope: ['Pleiades'],
};

/** Normalizes text for matching: lowercase, no diacritics, no apostrophes, punctuation to spaces. */
function normText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(s: string): string {
  const slug = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'object';
}

// ---------------------------------------------------------------------------
// Display names
// ---------------------------------------------------------------------------

/** "Eps Eri" -> "Epsilon Eridani", "61 Cyg" -> "61 Cygni", "Tau-2 Lup" -> "Tau-2 Lupi". */
function displayName(catalogName: string): string {
  const tokens = catalogName.trim().split(/\s+/);
  if (tokens.length < 2 || tokens.length > 3) return catalogName;
  const con = constellationByAbbr(tokens[tokens.length - 1]);
  if (!con || con.abbr !== tokens[tokens.length - 1]) return catalogName;
  const first = tokens[0];

  if (tokens.length === 3) {
    // Gould numbers: "82 G. Eri"
    if (/^\d+$/.test(first) && tokens[1] === 'G.') return `${first} G. ${con.genitive}`;
    return catalogName;
  }

  const greek = /^([A-Za-z]{2,3})(-\d+)?$/.exec(first);
  if (greek) {
    const letter = greekByAbbr(greek[1]);
    if (letter && greek[1][0] === greek[1][0].toUpperCase()) {
      return `${letter.name}${greek[2] ?? ''} ${con.genitive}`;
    }
  }
  // Flamsteed numbers ("61 Cyg"), variable-star letters ("EZ Aqr", "R Leo"), "V1216 Sgr".
  if (/^\d+$/.test(first) || /^[A-Za-z]$/.test(first) || /^[A-Z]{2}$/.test(first) || /^V\d+$/.test(first)) {
    return `${first} ${con.genitive}`;
  }
  return catalogName;
}

// ---------------------------------------------------------------------------
// Spectral classes
// ---------------------------------------------------------------------------

type SpectralLetter = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M' | 'D';
type LumGroup = 'dwarf' | 'subdwarf' | 'subgiant' | 'giant' | 'super' | 'unknown';

interface ParsedSpectral {
  cls: string;
  letter: SpectralLetter;
  wolfRayet: boolean;
  lum: LumGroup;
}

const SPEC_RE = /^(sd|d)?([OBAFGKMWCSNR])\s*(\d+(?:\.\d+)?)?:?\s*(Iab|Ia\+|Ia|Ib|III|II|IV|VI|V|I)?/;
const LETTER_MAP: Record<string, SpectralLetter> = {
  O: 'O', W: 'O', B: 'B', A: 'A', F: 'F', G: 'G', K: 'K', M: 'M', C: 'M', S: 'M', N: 'M', R: 'M',
};

function parseSpectral(raw: string): ParsedSpectral | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const wd = /^D[A-Z]?\d*(?:\.\d+)?/.exec(text);
  if (wd) return { cls: wd[0], letter: 'D', wolfRayet: false, lum: 'dwarf' };
  const m = SPEC_RE.exec(text);
  if (!m) return undefined;
  const pre = m[1] ?? '';
  const lumRaw = m[4] ?? '';
  let lum: LumGroup = 'unknown';
  if (pre === 'sd' || lumRaw === 'VI') lum = 'subdwarf';
  else if (lumRaw === 'V') lum = 'dwarf';
  else if (lumRaw === 'IV') lum = 'subgiant';
  else if (lumRaw === 'III') lum = 'giant';
  else if (lumRaw) lum = 'super'; // I, Ia, Iab, Ib, II (bright giants are grouped with supergiants)
  else if (pre === 'd') lum = 'dwarf';
  return {
    cls: `${pre}${m[2]}${m[3] ?? ''}${lumRaw}`,
    letter: LETTER_MAP[m[2]],
    wolfRayet: m[2] === 'W',
    lum,
  };
}

const ADJ: Record<SpectralLetter, string> = {
  O: 'Blue', B: 'Blue', A: 'White', F: 'Yellow-white', G: 'Yellow', K: 'Orange', M: 'Red', D: 'White',
};
const DWARF_TYPE: Record<SpectralLetter, string> = {
  O: 'Blue star',
  B: 'Blue-white star',
  A: 'White star',
  F: 'Yellow-white star',
  G: 'Sun-like star',
  K: 'Orange dwarf',
  M: 'Red dwarf',
  D: 'White dwarf',
};
const GENERIC_TYPE: Record<SpectralLetter, string> = {
  ...DWARF_TYPE,
  K: 'Orange star',
  M: 'Red star',
};

function starTypeOf(p: ParsedSpectral | undefined, absMag: number | undefined): string | undefined {
  if (!p) return undefined;
  if (p.letter === 'D') return 'White dwarf';
  if (p.wolfRayet) return 'Wolf-Rayet star';
  let lum = p.lum;
  if (lum === 'unknown' && absMag !== undefined) {
    if (absMag > 4.5) lum = 'dwarf';
    else if (absMag < 1.5) lum = 'giant';
  }
  switch (lum) {
    case 'dwarf': return DWARF_TYPE[p.letter];
    case 'subdwarf': return `${ADJ[p.letter]} subdwarf`;
    case 'subgiant': return `${ADJ[p.letter]} subgiant`;
    case 'giant': return `${ADJ[p.letter]} giant`;
    case 'super': return `${ADJ[p.letter]} supergiant`;
    default: return GENERIC_TYPE[p.letter];
  }
}

// ---------------------------------------------------------------------------
// Entry construction
// ---------------------------------------------------------------------------

interface RawDisplayMetrics {
  constellation?: string | null;
  apparent_magnitude?: number | null;
  true_distance_ly?: number;
  scale_narrative?: string;
}

function fmtLy(ly: number): string {
  if (ly >= 1000) return Math.round(ly).toLocaleString('en-US');
  if (ly >= 100) return String(Math.round(ly));
  if (ly >= 0.1) return ly.toFixed(1);
  return ly.toFixed(3);
}

function fmtAu(au: number): string {
  return au >= 100 ? String(Math.round(au)) : au.toFixed(2);
}

function isDesignation(catalogName: string): boolean {
  return /\d/.test(catalogName) || /^[A-Z][a-z]{1,2}(-\d+)? [A-Za-z]{2,3}$/.test(catalogName) && !!greekByAbbr(catalogName.split(' ')[0].replace(/-\d+$/, ''));
}

function proximityScore(pc: number): number {
  if (pc > 5) return 0;
  return 0.85 - 0.11 * Math.max(0, pc - 2);
}

function brightnessScore(mag: number): number {
  if (mag <= 6) return 0.15 + 0.85 * Math.min(1, (6 - mag) / 7.5);
  return Math.max(0.02, 0.15 - (mag - 6) * 0.02);
}

function buildEntries(rawList: AstroObject[], regime: AstrometricRegime): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  const usedSlugs = new Set<string>();
  const scale = regime === 'Systemic' ? AU_M : PC_M;

  for (const raw of rawList) {
    const catalogName = raw.name;
    const kind: ObjectKind = KIND_BY_TYPE[raw.type ?? 'Star'] ?? 'star';
    const name = kind === 'exoplanet' ? catalogName : displayName(catalogName);
    const dm: RawDisplayMetrics = raw.display_metrics ?? {};
    const isSol = catalogName === 'Sol';

    const [x, y, z] = raw.coords;
    const distanceFromSolMeters = isSol ? 0 : Math.sqrt(x * x + y * y + z * z) * scale;
    const distPc = distanceFromSolMeters / PC_M;

    // Slug, unique within the regime.
    const base = slugify(name);
    let slug = base;
    for (let n = 2; usedSlugs.has(slug); n++) slug = `${base}-${n}`;
    usedSlugs.add(slug);

    // Magnitudes.
    const rawMag = dm.apparent_magnitude;
    const magnitude: number | undefined =
      typeof rawMag === 'number' && kind !== 'spacecraft' && kind !== 'black-hole' && kind !== 'exoplanet'
        ? rawMag
        : undefined;
    let absMagnitude: number | undefined;
    if (kind === 'star' && magnitude !== undefined) {
      const dp = Math.max(isSol ? Math.sqrt(x * x + y * y + z * z) : distPc, AU_M / PC_M);
      absMagnitude = Math.round((magnitude - 5 * Math.log10(dp / 10)) * 100) / 100;
    }

    // Spectral data (stars only).
    let spectralClass: string | undefined;
    let spectralLetter: SpectralLetter | undefined;
    let starType: string | undefined;
    if (kind === 'star') {
      const narrative = dm.scale_narrative ?? '';
      const sm = /^Spectral class:\s*(.*)$/.exec(narrative);
      const parsed = isSol ? parseSpectral('G2V') : sm ? parseSpectral(sm[1]) : undefined;
      if (parsed) {
        spectralClass = parsed.cls;
        spectralLetter = parsed.letter;
      }
      starType = starTypeOf(parsed, absMagnitude);
    }

    // Color.
    let color: string;
    if (regime === 'Systemic' || isSol) {
      color = SOLAR_COLORS[catalogName] ?? KIND_COLORS[kind] ?? '#dbe4ff';
    } else if (kind === 'star') {
      color = spectralLetter ? SPECTRAL_COLORS[spectralLetter] : '#dbe4ff';
    } else {
      color = KIND_COLORS[kind] ?? '#dbe4ff';
    }

    // Constellation.
    const constellation = constellationFullName(dm.constellation ?? undefined);

    // Prominence.
    let prominence: number;
    if (regime === 'Systemic') {
      prominence = SOLAR_PROMINENCE[catalogName] ?? (kind === 'dwarf-planet' ? 0.5 : kind === 'asteroid' ? 0.35 : 0.5);
    } else if (kind === 'exoplanet') {
      prominence = FAMOUS_EXO[catalogName] ?? 0.1 + 0.25 * Math.exp(-distPc / 15);
    } else if (FAMOUS[catalogName] !== undefined) {
      prominence = FAMOUS[catalogName];
    } else if (kind === 'star') {
      const bright = magnitude !== undefined ? brightnessScore(magnitude) : 0.1;
      const near = proximityScore(distPc);
      const proper = !isDesignation(catalogName) ? 0.15 : 0;
      prominence = Math.min(0.89, Math.max(bright * 0.75, near) + proper);
    } else {
      prominence = 0.7;
    }
    prominence = Math.round(prominence * 1000) / 1000;

    // Aliases.
    const aliasSet: string[] = [];
    const addAlias = (a: string): void => {
      if (a !== name && !aliasSet.includes(a)) aliasSet.push(a);
    };
    if (name !== catalogName) addAlias(catalogName);
    if (kind !== 'exoplanet' && ALIAS_TABLE[catalogName]) for (const a of ALIAS_TABLE[catalogName]) addAlias(a);

    // Exoplanet host guess.
    let hostName: string | undefined;
    if (kind === 'exoplanet') {
      const hm = /^(.+?)\s+[a-z]$/.exec(catalogName);
      if (hm) hostName = hm[1];
    }

    // Description.
    const ly = distanceFromSolMeters / LY_M;
    const narrative = (dm.scale_narrative ?? '').trim();
    let description: string;
    if (isSol) {
      description = 'The Sun, the star at the center of the solar system.';
    } else if (regime === 'Systemic') {
      const au = distanceFromSolMeters / AU_M;
      description = catalogName === 'Moon'
        ? `Earth's natural satellite, about ${fmtAu(au)} AU from the Sun.`
        : `${KIND_LABEL[kind]}, ${fmtAu(au)} AU from the Sun.`;
    } else if (kind === 'star') {
      const t = starType ?? 'Star';
      const label = /star$|dwarf$|giant$|supergiant$|subdwarf$|subgiant$/i.test(t) ? t : `${t} star`;
      description = `${label}${constellation ? ` in ${constellation}` : ''}, ${fmtLy(ly)} light-years from the Sun.`;
    } else if (kind === 'exoplanet') {
      const mass = /^([\d.,]+) Earth masses?$/.exec(narrative);
      if (narrative && !mass && !/^[\d.,]+\s*\w+ masses?$/.test(narrative)) {
        description = narrative;
      } else {
        description = `Exoplanet orbiting ${hostName ?? 'a nearby star'}, ${fmtLy(ly)} light-years away${mass ? ` (about ${mass[1]} Earth masses)` : ''}.`;
      }
    } else if (narrative) {
      description = narrative;
    } else {
      description = `${KIND_LABEL[kind]}${constellation ? ` in ${constellation}` : ''}, ${fmtLy(ly)} light-years from the Sun.`;
    }

    const obj: AstroObject = { ...raw, name };
    const entry: CatalogEntry = {
      id: raw.id,
      slug,
      obj,
      regime,
      name,
      catalogName,
      kind,
      kindLabel: KIND_LABEL[kind],
      color,
      distanceFromSolMeters,
      aliases: aliasSet,
      prominence,
      description,
    };
    if (spectralClass) entry.spectralClass = spectralClass;
    if (spectralLetter) entry.spectralLetter = spectralLetter;
    if (starType) entry.starType = starType;
    if (magnitude !== undefined) entry.magnitude = magnitude;
    if (absMagnitude !== undefined) entry.absMagnitude = absMagnitude;
    if (constellation) entry.constellation = constellation;
    if (hostName) entry.hostName = hostName;
    out.push(entry);
  }
  return out;
}

/** Links each exoplanet to the nearest star entry within 0.05 pc and inherits its constellation. */
function linkHosts(entries: CatalogEntry[]): void {
  const stars = entries
    .filter((e) => e.kind === 'star')
    .map((e) => ({ e, x: e.obj.coords[0] }))
    .sort((a, b) => a.x - b.x);
  const R = 0.05;
  for (const planet of entries) {
    if (planet.kind !== 'exoplanet') continue;
    const [px, py, pz] = planet.obj.coords;
    let lo = 0;
    let hi = stars.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (stars[mid].x < px - R) lo = mid + 1;
      else hi = mid;
    }
    let best: CatalogEntry | undefined;
    let bestD = R;
    for (let i = lo; i < stars.length && stars[i].x <= px + R; i++) {
      const [sx, sy, sz] = stars[i].e.obj.coords;
      const d = Math.sqrt((sx - px) ** 2 + (sy - py) ** 2 + (sz - pz) ** 2);
      if (d <= bestD) {
        bestD = d;
        best = stars[i].e;
      }
    }
    if (best) {
      planet.hostId = best.id;
      if (!planet.constellation && best.constellation) planet.constellation = best.constellation;
    }
  }
}

// ---------------------------------------------------------------------------
// Build the catalog
// ---------------------------------------------------------------------------

/** JSON default imports arrive as `{ default: [...] }` under CommonJS test builds; accept both shapes. */
function unwrapJson(mod: unknown): AstroObject[] {
  if (Array.isArray(mod)) return mod as AstroObject[];
  return (mod as { default: AstroObject[] }).default;
}

export const systemicEntries: CatalogEntry[] = buildEntries(unwrapJson(systemicData), 'Systemic');
export const interstellarEntries: CatalogEntry[] = buildEntries(unwrapJson(starsData), 'Interstellar');
linkHosts(interstellarEntries);

export const allEntries: CatalogEntry[] = [...systemicEntries, ...interstellarEntries];
export const catalogSize: number = allEntries.length;

const byId = new Map<string, CatalogEntry>();
const slugMaps: Record<AstrometricRegime, Map<string, CatalogEntry>> = {
  Systemic: new Map(),
  Interstellar: new Map(),
};
for (const e of allEntries) {
  byId.set(e.id, e);
  slugMaps[e.regime].set(e.slug, e);
}

export function entriesFor(regime: AstrometricRegime): CatalogEntry[] {
  return regime === 'Systemic' ? systemicEntries : interstellarEntries;
}

export function getEntry(id: string): CatalogEntry | undefined {
  return byId.get(id);
}

/** Looks in `regime` first when given, then the other regime. */
export function findBySlug(slug: string, regime?: AstrometricRegime): CatalogEntry | undefined {
  const key = slug.trim().toLowerCase();
  const first: AstrometricRegime = regime ?? 'Systemic';
  const second: AstrometricRegime = first === 'Systemic' ? 'Interstellar' : 'Systemic';
  return slugMaps[first].get(key) ?? slugMaps[second].get(key);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

interface SearchRec {
  nameN: string;
  aliasN: string[];
  conN: string;
  conAbbrN: string;
  kindN: string;
  exo: boolean;
}

const recs: SearchRec[] = allEntries.map((e) => {
  const abbr = constellationByName(e.constellation)?.abbr.toLowerCase() ?? '';
  return {
    nameN: normText(e.name),
    aliasN: e.aliases.map(normText),
    conN: e.constellation ? normText(e.constellation) : '',
    conAbbrN: abbr,
    kindN: normText(`${e.kindLabel} ${KIND_WORDS[e.kind]}`),
    exo: e.kind === 'exoplanet',
  };
});

function wordStart(h: string, q: string): boolean {
  let i = h.indexOf(q);
  while (i !== -1) {
    if (i === 0 || h.charCodeAt(i - 1) === 32) return true;
    i = h.indexOf(q, i + 1);
  }
  return false;
}

/** Optimal-string-alignment distance with early exit once every cell exceeds `max`. */
function editDistance(a: string, b: string, max: number): number {
  const n = a.length;
  const m = b.length;
  if (Math.abs(n - m) > max) return max + 1;
  let prev2: number[] = [];
  let prev: number[] = [];
  for (let j = 0; j <= m; j++) prev.push(j);
  for (let i = 1; i <= n; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

/** Best distance between the query and any prefix-aligned word-start of the candidate. */
function typoDistance(q: string, cand: string, max: number): number {
  let best = max + 1;
  let start = 0;
  while (start < cand.length) {
    if (cand.charCodeAt(start) === q.charCodeAt(0) || cand.charCodeAt(start + 1) === q.charCodeAt(1) ||
        cand.charCodeAt(start) === q.charCodeAt(1)) {
      for (let l = q.length - 1; l <= q.length + 1; l++) {
        if (l < 1) continue;
        const d = editDistance(q, cand.slice(start, start + l), max);
        if (d < best) best = d;
      }
    }
    const sp = cand.indexOf(' ', start);
    if (sp === -1) break;
    start = sp + 1;
  }
  return best;
}

function conOnly(rec: SearchRec, q: string): boolean {
  if (q.length < 3) return false;
  return (
    (rec.conN !== '' && (rec.conN.startsWith(q) || wordStart(rec.conN, q))) ||
    (rec.conAbbrN !== '' && rec.conAbbrN === q)
  );
}

function conKindMatch(rec: SearchRec, q: string): boolean {
  if (q.length < 3) return false;
  return (
    (rec.conN !== '' && (rec.conN.startsWith(q) || wordStart(rec.conN, q))) ||
    (rec.conAbbrN !== '' && rec.conAbbrN === q) ||
    rec.kindN.startsWith(q) ||
    wordStart(rec.kindN, q)
  );
}

function tokenMatches(rec: SearchRec, t: string): boolean {
  if (rec.nameN.includes(t)) return true;
  for (const a of rec.aliasN) if (a.includes(t)) return true;
  return conKindMatch(rec, t);
}

function highlightRanges(name: string, q: string, tokens: string[]): [number, number][] {
  // Build a stripped version of the name with an index map back to the original characters.
  let stripped = '';
  const map: number[] = [];
  for (let i = 0; i < name.length; i++) {
    const c = name[i];
    if (c === "'" || c === '’' || c === '`') continue;
    const f = c.normalize('NFD')[0].toLowerCase();
    stripped += /[a-z0-9]/.test(f) ? f : ' ';
    map.push(i);
  }
  const ranges: [number, number][] = [];
  const find = (needle: string): void => {
    if (!needle) return;
    let idx = -1;
    let i = stripped.indexOf(needle);
    while (i !== -1) {
      if (i === 0 || stripped[i - 1] === ' ') { idx = i; break; }
      if (idx === -1) idx = i;
      i = stripped.indexOf(needle, i + 1);
    }
    if (idx !== -1) ranges.push([map[idx], map[idx + needle.length - 1] + 1]);
  };
  if (stripped.includes(q)) find(q);
  else for (const t of tokens) find(t);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

interface Cand {
  i: number;
  score: number;
  alias: number;
  typo: boolean;
}

export function searchCatalog(query: string, options: SearchOptions = {}): SearchHit[] {
  const q = normText(query);
  if (!q) return [];
  const limit = options.limit ?? 12;
  if (limit <= 0) return [];
  const { regime, kinds, excludeId } = options;
  const tokens = q.split(' ');
  const multi = tokens.length > 1;

  const cands: Cand[] = [];
  const allowed = (e: CatalogEntry): boolean =>
    (!regime || e.regime === regime) && (!kinds || kinds.includes(e.kind)) && e.id !== excludeId;

  for (let i = 0; i < recs.length; i++) {
    const e = allEntries[i];
    if (!allowed(e)) continue;
    const r = recs[i];

    let sName = 0;
    if (r.nameN === q) sName = 1000;
    else if (r.nameN.startsWith(q)) sName = 900;
    else if (wordStart(r.nameN, q)) sName = 800;
    else if (r.nameN.includes(q)) sName = 600;

    let sAlias = 0;
    let ai = -1;
    if (sName < 1000) {
      for (let j = 0; j < r.aliasN.length; j++) {
        const a = r.aliasN[j];
        let s = 0;
        if (a === q) s = 990;
        else if (a.startsWith(q) || wordStart(a, q)) s = 700;
        else if (a.includes(q)) s = 500;
        if (s > sAlias) { sAlias = s; ai = j; }
      }
    }

    let base = Math.max(sName, sAlias);
    // A word that is only the star's own constellation ("Orionis", "UMa"), or an exoplanet's name
    // fragment, counts as a constellation match so that brighter stars are not buried under it.
    if (base > 0 && base < 900 && (r.exo || conOnly(r, q))) base = 400;
    // Typing a constellation abbreviation exactly ("uma", "cen") lists that constellation's stars.
    if (!r.exo && q.length === 3 && r.conAbbrN === q && base < 850) base = 850;
    if (base === 0 && conKindMatch(r, q)) base = 400;
    if (base === 0 && multi) {
      let all = true;
      for (const t of tokens) if (!tokenMatches(r, t)) { all = false; break; }
      if (all) base = 300;
    }
    if (base === 0) continue;
    const score = base + (r.exo ? 0 : 40) + e.prominence * 30;
    cands.push({ i, score, alias: sAlias > sName ? ai : -1, typo: false });
  }

  // Light typo tolerance as the last tier.
  if (cands.length < 3 && q.length >= 4) {
    const max = q.length >= 7 ? 2 : 1;
    const seen = new Set<number>();
    for (const c of cands) seen.add(c.i);
    for (let i = 0; i < recs.length; i++) {
      if (seen.has(i)) continue;
      const e = allEntries[i];
      if (!allowed(e)) continue;
      const r = recs[i];
      let d = typoDistance(q, r.nameN, max);
      let ai = -1;
      if (d > 0) {
        for (let j = 0; j < r.aliasN.length; j++) {
          const da = typoDistance(q, r.aliasN[j], max);
          if (da < d) { d = da; ai = j; }
        }
      }
      if (d > max) continue;
      cands.push({ i, score: 200 - 30 * d + (r.exo ? 0 : 40) + e.prominence * 30, alias: ai, typo: true });
    }
  }

  cands.sort((a, b) =>
    b.score - a.score ||
    allEntries[a.i].distanceFromSolMeters - allEntries[b.i].distanceFromSolMeters);

  const hits: SearchHit[] = [];
  for (let k = 0; k < cands.length && hits.length < limit; k++) {
    const c = cands[k];
    const entry = allEntries[c.i];
    const hit: SearchHit = {
      entry,
      score: Math.round(c.score * 100) / 100,
      ranges: c.alias >= 0 || c.typo ? [] : highlightRanges(entry.name, q, tokens),
    };
    if (c.alias >= 0) hit.matchedAlias = entry.aliases[c.alias];
    hits.push(hit);
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Browse groups and map labels
// ---------------------------------------------------------------------------

function byName(regime: AstrometricRegime, catalogName: string): CatalogEntry | undefined {
  for (const e of entriesFor(regime)) if (e.catalogName === catalogName && e.kind !== 'exoplanet') return e;
  return undefined;
}

function pick(regime: AstrometricRegime, names: string[]): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const n of names) {
    const e = byName(regime, n);
    if (e) out.push(e);
  }
  return out;
}

const PLANET_ORDER = ['Sol', 'Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

function byDistance(a: CatalogEntry, b: CatalogEntry): number {
  return a.distanceFromSolMeters - b.distanceFromSolMeters;
}

function buildBrowseGroups(): BrowseGroup[] {
  const stars = interstellarEntries.filter((e) => e.kind === 'star' && e.catalogName !== 'Sol');
  const smallBodies = [
    ...pick('Systemic', ['Moon', 'Pluto']),
    ...systemicEntries.filter((e) => e.kind === 'dwarf-planet' && e.catalogName !== 'Pluto'),
    ...systemicEntries.filter((e) => e.kind === 'asteroid'),
  ];

  const nearestPlanets: CatalogEntry[] = [];
  const perHost = new Map<string, number>();
  for (const p of interstellarEntries.filter((e) => e.kind === 'exoplanet').sort(byDistance)) {
    const key = p.hostId ?? p.hostName ?? p.catalogName;
    const n = perHost.get(key) ?? 0;
    if (n >= 2) continue;
    perHost.set(key, n + 1);
    nearestPlanets.push(p);
    if (nearestPlanets.length >= 20) break;
  }

  return [
    {
      id: 'planets',
      label: 'Planets',
      description: 'The Sun and the eight planets, in order from the Sun.',
      regime: 'Systemic',
      entries: pick('Systemic', PLANET_ORDER),
    },
    {
      id: 'small-bodies',
      label: 'Moons and small worlds',
      description: 'The Moon, dwarf planets and well-known asteroids.',
      regime: 'Systemic',
      entries: smallBodies.slice(0, 24),
    },
    {
      id: 'nearest-stars',
      label: 'Nearest stars',
      description: 'The 20 closest stars to the Sun.',
      regime: 'Interstellar',
      entries: [...stars].sort(byDistance).slice(0, 20),
    },
    {
      id: 'brightest-stars',
      label: 'Brightest stars',
      description: 'The 20 brightest stars in Earth\'s sky.',
      regime: 'Interstellar',
      entries: stars
        .filter((e) => e.magnitude !== undefined)
        .sort((a, b) => (a.magnitude as number) - (b.magnitude as number))
        .slice(0, 20),
    },
    {
      id: 'famous-stars',
      label: 'Famous stars',
      description: 'Well-known stars from the night sky and from legend.',
      regime: 'Interstellar',
      entries: pick('Interstellar', [
        'Polaris', 'Betelgeuse', 'Rigel', 'Vega', 'Sirius', 'Arcturus', 'Antares', 'Aldebaran',
        'Deneb', 'Altair', 'Capella', 'Fomalhaut', 'Canopus', 'Spica', 'Algol', 'Mira',
      ]),
    },
    {
      id: 'deep-sky',
      label: 'Deep sky',
      description: 'Galaxies, nebulae and the black hole at the heart of the Milky Way.',
      regime: 'Interstellar',
      entries: interstellarEntries
        .filter((e) => e.kind === 'galaxy' || e.kind === 'nebula' || e.kind === 'black-hole')
        .sort(byDistance)
        .slice(0, 24),
    },
    {
      id: 'spacecraft',
      label: 'Spacecraft',
      description: 'Human-made probes leaving the solar system.',
      regime: 'Interstellar',
      entries: interstellarEntries
        .filter((e) => e.kind === 'spacecraft')
        .sort((a, b) => b.prominence - a.prominence)
        .slice(0, 24),
    },
    {
      id: 'exoplanets',
      label: 'Notable exoplanets',
      description: 'The nearest known worlds orbiting other stars.',
      regime: 'Interstellar',
      entries: nearestPlanets,
    },
  ];
}

export const browseGroups: BrowseGroup[] = buildBrowseGroups();

const labelCache: Partial<Record<AstrometricRegime, CatalogEntry[]>> = {};

/** Entries worth labelling on the map for a regime, most prominent first. At most 80. */
export function labelCandidates(regime: AstrometricRegime): CatalogEntry[] {
  const cached = labelCache[regime];
  if (cached) return cached;
  let list: CatalogEntry[];
  if (regime === 'Systemic') {
    list = [
      ...pick('Systemic', [...PLANET_ORDER, 'Moon', 'Pluto']),
      ...systemicEntries.filter((e) => e.kind === 'dwarf-planet' && e.catalogName !== 'Pluto'),
    ];
  } else {
    list = interstellarEntries
      .filter((e) => e.kind !== 'exoplanet' && e.kind !== 'spacecraft')
      .sort((a, b) => b.prominence - a.prominence || byDistance(a, b))
      .slice(0, 80);
  }
  labelCache[regime] = list.slice(0, 80);
  return labelCache[regime] as CatalogEntry[];
}
