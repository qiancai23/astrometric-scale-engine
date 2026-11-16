/**
 * The 88 IAU constellations (abbreviation, name, genitive form) and the 24 Greek letters
 * with the 3-letter abbreviations used by the HYG star database.
 * Names are written without diacritics (for example "Bootis").
 */

export interface Constellation {
  /** IAU three-letter abbreviation, for example "Cen". */
  abbr: string;
  /** Full name, for example "Centaurus". */
  name: string;
  /** Genitive form used in Bayer names, for example "Centauri". */
  genitive: string;
}

export const CONSTELLATIONS: Constellation[] = [
  { abbr: 'And', name: 'Andromeda', genitive: 'Andromedae' },
  { abbr: 'Ant', name: 'Antlia', genitive: 'Antliae' },
  { abbr: 'Aps', name: 'Apus', genitive: 'Apodis' },
  { abbr: 'Aqr', name: 'Aquarius', genitive: 'Aquarii' },
  { abbr: 'Aql', name: 'Aquila', genitive: 'Aquilae' },
  { abbr: 'Ara', name: 'Ara', genitive: 'Arae' },
  { abbr: 'Ari', name: 'Aries', genitive: 'Arietis' },
  { abbr: 'Aur', name: 'Auriga', genitive: 'Aurigae' },
  { abbr: 'Boo', name: 'Bootes', genitive: 'Bootis' },
  { abbr: 'Cae', name: 'Caelum', genitive: 'Caeli' },
  { abbr: 'Cam', name: 'Camelopardalis', genitive: 'Camelopardalis' },
  { abbr: 'Cnc', name: 'Cancer', genitive: 'Cancri' },
  { abbr: 'CVn', name: 'Canes Venatici', genitive: 'Canum Venaticorum' },
  { abbr: 'CMa', name: 'Canis Major', genitive: 'Canis Majoris' },
  { abbr: 'CMi', name: 'Canis Minor', genitive: 'Canis Minoris' },
  { abbr: 'Cap', name: 'Capricornus', genitive: 'Capricorni' },
  { abbr: 'Car', name: 'Carina', genitive: 'Carinae' },
  { abbr: 'Cas', name: 'Cassiopeia', genitive: 'Cassiopeiae' },
  { abbr: 'Cen', name: 'Centaurus', genitive: 'Centauri' },
  { abbr: 'Cep', name: 'Cepheus', genitive: 'Cephei' },
  { abbr: 'Cet', name: 'Cetus', genitive: 'Ceti' },
  { abbr: 'Cha', name: 'Chamaeleon', genitive: 'Chamaeleontis' },
  { abbr: 'Cir', name: 'Circinus', genitive: 'Circini' },
  { abbr: 'Col', name: 'Columba', genitive: 'Columbae' },
  { abbr: 'Com', name: 'Coma Berenices', genitive: 'Comae Berenices' },
  { abbr: 'CrA', name: 'Corona Australis', genitive: 'Coronae Australis' },
  { abbr: 'CrB', name: 'Corona Borealis', genitive: 'Coronae Borealis' },
  { abbr: 'Crv', name: 'Corvus', genitive: 'Corvi' },
  { abbr: 'Crt', name: 'Crater', genitive: 'Crateris' },
  { abbr: 'Cru', name: 'Crux', genitive: 'Crucis' },
  { abbr: 'Cyg', name: 'Cygnus', genitive: 'Cygni' },
  { abbr: 'Del', name: 'Delphinus', genitive: 'Delphini' },
  { abbr: 'Dor', name: 'Dorado', genitive: 'Doradus' },
  { abbr: 'Dra', name: 'Draco', genitive: 'Draconis' },
  { abbr: 'Equ', name: 'Equuleus', genitive: 'Equulei' },
  { abbr: 'Eri', name: 'Eridanus', genitive: 'Eridani' },
  { abbr: 'For', name: 'Fornax', genitive: 'Fornacis' },
  { abbr: 'Gem', name: 'Gemini', genitive: 'Geminorum' },
  { abbr: 'Gru', name: 'Grus', genitive: 'Gruis' },
  { abbr: 'Her', name: 'Hercules', genitive: 'Herculis' },
  { abbr: 'Hor', name: 'Horologium', genitive: 'Horologii' },
  { abbr: 'Hya', name: 'Hydra', genitive: 'Hydrae' },
  { abbr: 'Hyi', name: 'Hydrus', genitive: 'Hydri' },
  { abbr: 'Ind', name: 'Indus', genitive: 'Indi' },
  { abbr: 'Lac', name: 'Lacerta', genitive: 'Lacertae' },
  { abbr: 'Leo', name: 'Leo', genitive: 'Leonis' },
  { abbr: 'LMi', name: 'Leo Minor', genitive: 'Leonis Minoris' },
  { abbr: 'Lep', name: 'Lepus', genitive: 'Leporis' },
  { abbr: 'Lib', name: 'Libra', genitive: 'Librae' },
  { abbr: 'Lup', name: 'Lupus', genitive: 'Lupi' },
  { abbr: 'Lyn', name: 'Lynx', genitive: 'Lyncis' },
  { abbr: 'Lyr', name: 'Lyra', genitive: 'Lyrae' },
  { abbr: 'Men', name: 'Mensa', genitive: 'Mensae' },
  { abbr: 'Mic', name: 'Microscopium', genitive: 'Microscopii' },
  { abbr: 'Mon', name: 'Monoceros', genitive: 'Monocerotis' },
  { abbr: 'Mus', name: 'Musca', genitive: 'Muscae' },
  { abbr: 'Nor', name: 'Norma', genitive: 'Normae' },
  { abbr: 'Oct', name: 'Octans', genitive: 'Octantis' },
  { abbr: 'Oph', name: 'Ophiuchus', genitive: 'Ophiuchi' },
  { abbr: 'Ori', name: 'Orion', genitive: 'Orionis' },
  { abbr: 'Pav', name: 'Pavo', genitive: 'Pavonis' },
  { abbr: 'Peg', name: 'Pegasus', genitive: 'Pegasi' },
  { abbr: 'Per', name: 'Perseus', genitive: 'Persei' },
  { abbr: 'Phe', name: 'Phoenix', genitive: 'Phoenicis' },
  { abbr: 'Pic', name: 'Pictor', genitive: 'Pictoris' },
  { abbr: 'Psc', name: 'Pisces', genitive: 'Piscium' },
  { abbr: 'PsA', name: 'Piscis Austrinus', genitive: 'Piscis Austrini' },
  { abbr: 'Pup', name: 'Puppis', genitive: 'Puppis' },
  { abbr: 'Pyx', name: 'Pyxis', genitive: 'Pyxidis' },
  { abbr: 'Ret', name: 'Reticulum', genitive: 'Reticuli' },
  { abbr: 'Sge', name: 'Sagitta', genitive: 'Sagittae' },
  { abbr: 'Sgr', name: 'Sagittarius', genitive: 'Sagittarii' },
  { abbr: 'Sco', name: 'Scorpius', genitive: 'Scorpii' },
  { abbr: 'Scl', name: 'Sculptor', genitive: 'Sculptoris' },
  { abbr: 'Sct', name: 'Scutum', genitive: 'Scuti' },
  { abbr: 'Ser', name: 'Serpens', genitive: 'Serpentis' },
  { abbr: 'Sex', name: 'Sextans', genitive: 'Sextantis' },
  { abbr: 'Tau', name: 'Taurus', genitive: 'Tauri' },
  { abbr: 'Tel', name: 'Telescopium', genitive: 'Telescopii' },
  { abbr: 'Tri', name: 'Triangulum', genitive: 'Trianguli' },
  { abbr: 'TrA', name: 'Triangulum Australe', genitive: 'Trianguli Australis' },
  { abbr: 'Tuc', name: 'Tucana', genitive: 'Tucanae' },
  { abbr: 'UMa', name: 'Ursa Major', genitive: 'Ursae Majoris' },
  { abbr: 'UMi', name: 'Ursa Minor', genitive: 'Ursae Minoris' },
  { abbr: 'Vel', name: 'Vela', genitive: 'Velorum' },
  { abbr: 'Vir', name: 'Virgo', genitive: 'Virginis' },
  { abbr: 'Vol', name: 'Volans', genitive: 'Volantis' },
  { abbr: 'Vul', name: 'Vulpecula', genitive: 'Vulpeculae' },
];

const BY_ABBR = new Map<string, Constellation>();
const BY_NAME = new Map<string, Constellation>();
for (const c of CONSTELLATIONS) {
  BY_ABBR.set(c.abbr.toLowerCase(), c);
  BY_NAME.set(c.name.toLowerCase(), c);
}

/** Look up a constellation by its IAU abbreviation (case-insensitive). */
export function constellationByAbbr(abbr: string | null | undefined): Constellation | undefined {
  if (!abbr) return undefined;
  return BY_ABBR.get(abbr.trim().toLowerCase());
}

/** Look up a constellation by its full name (case-insensitive). */
export function constellationByName(name: string | null | undefined): Constellation | undefined {
  if (!name) return undefined;
  return BY_NAME.get(name.trim().toLowerCase());
}

/**
 * Resolve either an abbreviation ("Cen") or a full name ("Centaurus") to the full name.
 * Unknown input is returned unchanged.
 */
export function constellationFullName(abbrOrName: string | null | undefined): string | undefined {
  if (!abbrOrName) return undefined;
  const c = constellationByAbbr(abbrOrName) ?? constellationByName(abbrOrName);
  return c ? c.name : abbrOrName.trim() || undefined;
}

export interface GreekLetter {
  /** Three-letter abbreviation used by HYG, for example "Alp". */
  abbr: string;
  /** Full letter name, for example "Alpha". */
  name: string;
}

export const GREEK_LETTERS: GreekLetter[] = [
  { abbr: 'Alp', name: 'Alpha' },
  { abbr: 'Bet', name: 'Beta' },
  { abbr: 'Gam', name: 'Gamma' },
  { abbr: 'Del', name: 'Delta' },
  { abbr: 'Eps', name: 'Epsilon' },
  { abbr: 'Zet', name: 'Zeta' },
  { abbr: 'Eta', name: 'Eta' },
  { abbr: 'The', name: 'Theta' },
  { abbr: 'Iot', name: 'Iota' },
  { abbr: 'Kap', name: 'Kappa' },
  { abbr: 'Lam', name: 'Lambda' },
  { abbr: 'Mu', name: 'Mu' },
  { abbr: 'Nu', name: 'Nu' },
  { abbr: 'Xi', name: 'Xi' },
  { abbr: 'Omi', name: 'Omicron' },
  { abbr: 'Pi', name: 'Pi' },
  { abbr: 'Rho', name: 'Rho' },
  { abbr: 'Sig', name: 'Sigma' },
  { abbr: 'Tau', name: 'Tau' },
  { abbr: 'Ups', name: 'Upsilon' },
  { abbr: 'Phi', name: 'Phi' },
  { abbr: 'Chi', name: 'Chi' },
  { abbr: 'Psi', name: 'Psi' },
  { abbr: 'Ome', name: 'Omega' },
];

const GREEK_BY_ABBR = new Map<string, GreekLetter>();
for (const g of GREEK_LETTERS) GREEK_BY_ABBR.set(g.abbr.toLowerCase(), g);

/** Look up a Greek letter by its HYG abbreviation (case-insensitive). */
export function greekByAbbr(abbr: string | null | undefined): GreekLetter | undefined {
  if (!abbr) return undefined;
  return GREEK_BY_ABBR.get(abbr.trim().toLowerCase());
}
