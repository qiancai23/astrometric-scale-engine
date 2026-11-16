import {
  allEntries,
  browseGroups,
  catalogSize,
  entriesFor,
  findBySlug,
  getEntry,
  interstellarEntries,
  labelCandidates,
  searchCatalog,
  systemicEntries,
} from './catalog';
import { CONSTELLATIONS, constellationByAbbr, greekByAbbr } from './constellations';

const nameOf = (q: string, i = 0, o = {}): string | undefined => searchCatalog(q, o)[i]?.entry.name;

describe('constellations', () => {
  it('has 88 constellations with unique abbreviations', () => {
    expect(CONSTELLATIONS).toHaveLength(88);
    expect(new Set(CONSTELLATIONS.map((c) => c.abbr)).size).toBe(88);
  });
  it('looks up case-insensitively', () => {
    expect(constellationByAbbr('uma')?.genitive).toBe('Ursae Majoris');
    expect(constellationByAbbr('PSA')?.genitive).toBe('Piscis Austrini');
    expect(greekByAbbr('alp')?.name).toBe('Alpha');
  });
});

describe('catalog build', () => {
  it('has the expected counts', () => {
    expect(systemicEntries).toHaveLength(27);
    expect(interstellarEntries).toHaveLength(3003);
    expect(allEntries).toHaveLength(3030);
    expect(catalogSize).toBe(3030);
    expect(entriesFor('Systemic')).toBe(systemicEntries);
  });
  it('has unique ids and per-regime unique slugs', () => {
    expect(new Set(allEntries.map((e) => e.id)).size).toBe(allEntries.length);
    for (const list of [systemicEntries, interstellarEntries]) {
      expect(new Set(list.map((e) => e.slug)).size).toBe(list.length);
      for (const e of list) expect(e.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
  it('resolves slugs', () => {
    expect(findBySlug('sol', 'Systemic')?.id).toBe('10');
    expect(findBySlug('sol', 'Interstellar')?.id).toBe('hyg_0');
    expect(findBySlug('proxima-centauri')?.name).toBe('Proxima Centauri');
    expect(findBySlug('mars')?.id).toBe('499');
    expect(findBySlug('p-eridani')?.id).not.toBe(findBySlug('p-eridani-2')?.id);
    expect(findBySlug('sagittarius-a')?.catalogName).toBe('Sagittarius A*');
    expect(findBySlug('andromeda-galaxy-m31')?.kind).toBe('galaxy');
    expect(getEntry('hyg_0')?.slug).toBe('sol');
  });
  it('expands display names', () => {
    const names = new Set(interstellarEntries.map((e) => e.name));
    expect(names.has('Tau Ceti')).toBe(true);
    expect(names.has('82 G. Eridani')).toBe(true);
    expect(names.has('Tau-2 Lupi')).toBe(true);
    expect(names.has('Alpha Camelopardalis')).toBe(true);
    expect(names.has('Beta Hydri')).toBe(true);
    expect(names.has('Theta-1 Orionis') || names.has('Theta Orionis')).toBe(true);
    expect(names.has('Groombridge 34') || names.has('Groombridge 1830')).toBe(true);
    expect(names.has('3C 273')).toBe(true);
    const tau = interstellarEntries.find((e) => e.catalogName === 'Tau Cet');
    expect(tau?.aliases).toContain('Tau Cet');
    expect(names.has('Proxima Cen b')).toBe(true);
  });
  it('keeps obj consistent with the entry', () => {
    for (const e of allEntries) {
      expect(e.obj.name).toBe(e.name);
      expect(e.obj.id).toBe(e.id);
      expect(e.obj.coords).toHaveLength(3);
    }
    const earth = getEntry('399');
    expect(earth?.obj.orbit_path).toBeDefined();
  });
  it('gives every entry a color, description and prominence', () => {
    for (const e of allEntries) {
      expect(e.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(e.description.length).toBeGreaterThan(5);
      expect(e.prominence).toBeGreaterThanOrEqual(0);
      expect(e.prominence).toBeLessThanOrEqual(1);
    }
  });
  it('parses stars', () => {
    const sol = findBySlug('sol', 'Interstellar');
    expect(sol?.spectralClass).toBe('G2V');
    expect(sol?.starType).toBe('Sun-like star');
    expect(sol?.color).toBe('#ffd27a');
    const betelgeuse = findBySlug('betelgeuse');
    expect(betelgeuse?.starType).toBe('Red supergiant');
    expect(betelgeuse?.spectralLetter).toBe('M');
    expect(findBySlug('proxima-centauri')?.starType).toBe('Red dwarf');
    expect(findBySlug('sirius')?.constellation).toBe('Canis Major');
    expect(findBySlug('proxima-centauri')?.constellation).toBe('Centaurus');
  });
  it('links exoplanets to hosts', () => {
    const b = interstellarEntries.find((e) => e.catalogName === 'Proxima Cen b');
    expect(b?.hostName).toBe('Proxima Cen');
    expect(b?.hostId).toBe(findBySlug('proxima-centauri')?.id);
    expect(b?.constellation).toBe('Centaurus');
    expect(b?.prominence).toBeLessThanOrEqual(0.5);
  });
  it('rates prominence sensibly', () => {
    for (const s of ['sirius', 'proxima-centauri', 'rigil-kentaurus', 'vega', 'betelgeuse', 'polaris', 'rigel',
      'arcturus', 'sagittarius-a', 'andromeda-galaxy-m31', 'orion-nebula-m42', 'voyager-1']) {
      expect(findBySlug(s, 'Interstellar')?.prominence).toBeGreaterThanOrEqual(0.9);
    }
    expect(findBySlug('barnards-star')?.prominence).toBeGreaterThanOrEqual(0.8);
    expect(findBySlug('wolf-359')?.prominence).toBeGreaterThanOrEqual(0.8);
    for (const e of interstellarEntries) if (e.kind === 'exoplanet') expect(e.prominence).toBeLessThanOrEqual(0.5);
  });
});

describe('searchCatalog', () => {
  it('returns [] for empty queries', () => {
    expect(searchCatalog('')).toEqual([]);
    expect(searchCatalog('   ')).toEqual([]);
    expect(searchCatalog('***')).toEqual([]);
  });
  it('ranks "pro" with Proxima first and Procyon near the top', () => {
    const hits = searchCatalog('pro');
    expect(hits[0].entry.name).toBe('Proxima Centauri');
    expect(hits.slice(0, 3).map((h) => h.entry.name)).toContain('Procyon');
    const exoIdx = hits.findIndex((h) => h.entry.kind === 'exoplanet');
    const lastStar = hits.map((h) => h.entry.kind).lastIndexOf('star');
    if (exoIdx !== -1 && lastStar !== -1) expect(exoIdx).toBeGreaterThan(Math.min(lastStar, 3));
  });
  it('finds Alpha Centauri through an alias', () => {
    const [top] = searchCatalog('alpha centauri');
    expect(top.entry.name).toBe('Rigil Kentaurus');
    expect(top.matchedAlias).toBeDefined();
  });
  it('finds Epsilon Eridani', () => {
    const [top] = searchCatalog('epsilon eridani');
    expect(top.entry.catalogName).toBe('Ran');
    expect(top.matchedAlias).toBe('Epsilon Eridani');
  });
  it('finds Sol by "sun", and Andromeda by "m31"', () => {
    expect(searchCatalog('sun')[0].entry.catalogName).toBe('Sol');
    expect(nameOf('m31')).toBe('Andromeda Galaxy (M31)');
    expect(nameOf('andromeda')).toBe('Andromeda Galaxy (M31)');
  });
  it('finds the galactic center', () => {
    expect(nameOf('galactic center')).toBe('Sagittarius A*');
    expect(nameOf('sgr a*')).toBe('Sagittarius A*');
  });
  it('tolerates typos', () => {
    expect(nameOf('betelgeuze')).toBe('Betelgeuse');
    expect(nameOf('sirus')).toBe('Sirius');
    expect(nameOf('andromida')).toBe('Andromeda Galaxy (M31)');
  });
  it('lists Orion things for "orion"', () => {
    const hits = searchCatalog('orion', { limit: 30 });
    expect(hits.some((h) => h.entry.name.startsWith('Orion Nebula'))).toBe(true);
    expect(hits.some((h) => h.entry.constellation === 'Orion' && h.entry.kind === 'star')).toBe(true);
    const stars = hits.filter((h) => h.entry.kind === 'star');
    expect(stars[0].entry.name === 'Betelgeuse' || stars[0].entry.name === 'Rigel').toBe(true);
  });
  it('puts Mars first for "mars"', () => {
    expect(nameOf('mars')).toBe('Mars');
  });
  it('matches kind words', () => {
    expect(searchCatalog('black hole').some((h) => h.entry.kind === 'black-hole')).toBe(true);
    expect(searchCatalog('galaxy')[0].entry.kind).toBe('galaxy');
    expect(searchCatalog('nebula').every((h) => h.entry.kind === 'nebula')).toBe(true);
    expect(searchCatalog('spacecraft')[0].entry.kind).toBe('spacecraft');
    expect(searchCatalog('dwarf planet')[0].entry.kind).toBe('dwarf-planet');
    expect(searchCatalog('asteroid')[0].entry.kind).toBe('asteroid');
    expect(searchCatalog('moon')[0].entry.catalogName).toBe('Moon');
    expect(searchCatalog('exoplanet')[0].entry.kind).toBe('exoplanet');
    expect(searchCatalog('planet', { regime: 'Systemic' })[0].entry.kind).toBe('planet');
  });
  it('honors options', () => {
    expect(searchCatalog('a', { limit: 5 })).toHaveLength(5);
    expect(searchCatalog('sol', { regime: 'Systemic' }).every((h) => h.entry.regime === 'Systemic')).toBe(true);
    expect(searchCatalog('sol', { regime: 'Interstellar' })[0].entry.id).toBe('hyg_0');
    expect(searchCatalog('s', { kinds: ['planet'], limit: 50 }).every((h) => h.entry.kind === 'planet')).toBe(true);
    expect(searchCatalog('mars', { excludeId: '499' }).every((h) => h.entry.id !== '499')).toBe(true);
  });
  it('produces in-bounds highlight ranges', () => {
    for (const q of ['pro', 'barnards', 'sirius', 'cen', 'orion neb', 'alpha', 'tau', 'eri']) {
      for (const h of searchCatalog(q, { limit: 30 })) {
        for (const [s, e] of h.ranges) {
          expect(s).toBeGreaterThanOrEqual(0);
          expect(e).toBeGreaterThan(s);
          expect(e).toBeLessThanOrEqual(h.entry.name.length);
        }
      }
    }
    const h = searchCatalog('proxi')[0];
    expect(h.entry.name.slice(h.ranges[0][0], h.ranges[0][1]).toLowerCase()).toBe('proxi');
    const b = searchCatalog('barnards')[0];
    expect(b.entry.name).toBe("Barnard's Star");
    expect(searchCatalog('sun')[0].ranges).toEqual([]);
  });
  it('finds stars by constellation abbreviation', () => {
    const hits = searchCatalog('uma', { limit: 5 });
    expect(hits[0].entry.constellation).toBe('Ursa Major');
  });
});

describe('browse groups and labels', () => {
  it('has all groups, non-empty', () => {
    expect(browseGroups.map((g) => g.id)).toEqual([
      'planets', 'small-bodies', 'nearest-stars', 'brightest-stars', 'famous-stars', 'deep-sky', 'spacecraft', 'exoplanets',
    ]);
    for (const g of browseGroups) {
      expect(g.entries.length).toBeGreaterThan(0);
      expect(g.entries.length).toBeLessThanOrEqual(24);
      for (const e of g.entries) expect(e.regime).toBe(g.regime);
    }
  });
  it('orders planets and nearest stars', () => {
    const planets = browseGroups.find((g) => g.id === 'planets')!;
    expect(planets.entries.map((e) => e.name)).toEqual(
      ['Sol', 'Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']);
    const near = browseGroups.find((g) => g.id === 'nearest-stars')!;
    expect(near.entries).toHaveLength(20);
    expect(near.entries.some((e) => e.catalogName === 'Sol')).toBe(false);
    expect(near.entries[0].name).toBe('Proxima Centauri');
    const bright = browseGroups.find((g) => g.id === 'brightest-stars')!;
    expect(bright.entries[0].name).toBe('Sirius');
    const ex = browseGroups.find((g) => g.id === 'exoplanets')!;
    const perHost = new Map<string, number>();
    for (const e of ex.entries) {
      const k = e.hostId ?? e.hostName ?? e.name;
      perHost.set(k, (perHost.get(k) ?? 0) + 1);
    }
    expect(Math.max(...perHost.values())).toBeLessThanOrEqual(2);
  });
  it('gives label candidates', () => {
    const sys = labelCandidates('Systemic');
    expect(sys[0].name).toBe('Sol');
    expect(sys.some((e) => e.kind === 'asteroid')).toBe(false);
    const inter = labelCandidates('Interstellar');
    expect(inter.length).toBeLessThanOrEqual(80);
    expect(inter.some((e) => e.kind === 'exoplanet')).toBe(false);
    expect(inter[0].name).toBe('Sol');
  });
});

describe('performance', () => {
  it('answers 200 varied queries in under a second', () => {
    const words = ['pro', 'alp', 'cen', 'sirius', 'ori', 'andromida', 'tau cet', 'mars', 'star', 'eri', 'bet', 'hd 1',
      'ross', 'gliese', 'wolf', 'sgr', 'moon', 'black hole', 'b', 'trappist'];
    const t0 = performance.now();
    let total = 0;
    for (let i = 0; i < 200; i++) {
      const w = words[i % words.length];
      total += searchCatalog(i % 3 === 0 ? w.slice(0, Math.max(1, w.length - 1)) : w).length;
    }
    expect(total).toBeGreaterThan(0);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
