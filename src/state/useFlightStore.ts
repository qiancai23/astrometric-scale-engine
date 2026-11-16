import { create } from 'zustand';
import { KinematicsEngine, SublightResult, WarpResult, SPEED_OF_LIGHT } from '../physics/kinematicsEngine';
import { buildSublightProfile, buildWarpProfile, FlightProfile } from '../physics/flightProfile';
import { FlightPlan, canPlanSystemic, compareSystemic, planSystemic } from '../physics/flightPlanner';
import { MAX_DAY, MIN_DAY, dayFromIso, isoFromDay, todayDay } from '../physics/ephemeris';
import type { ArrivalMode } from '../physics/transfer';
import { findBySlug, getEntry, CatalogEntry } from '../data/catalog';
import {
  GRAVITY,
  DEFAULT_MASS_KG,
  MIN_MASS_KG,
  MAX_MASS_KG,
  EngineComparison,
  EngineSettings,
  clamp,
  clampSublightSettings,
  compareEngines,
  defaultEngineSettings,
  getEngine,
  isEngineId,
} from '../data/engines';
import { DEFAULT_FLIGHT, DEFAULT_ROUTE } from '../data/famousFlights';
import { parseFlightSpec } from '../lib/urlState';
import type {
  AstroObject,
  AstrometricRegime,
  DriveCore,
  Endpoint,
  EngineId,
  FlightSpec,
  MapLayers,
  SublightEngineId,
} from '../types';

export type { AstroObject, AstrometricRegime, DriveCore, EngineId, FlightSpec, MapLayers, Endpoint } from '../types';
export { GRAVITY } from '../data/engines';
export type { FlightPlan } from '../physics/flightPlanner';
export type { ArrivalMode } from '../physics/transfer';

export const PARSEC_TO_METERS = 3.085677581e16;
export const LIGHTYEAR_TO_METERS = 9.4607304725808e15;
export const AU_TO_METERS = 1.495978707e11;

/** Wall-clock seconds a full playback takes at 1x speed. */
export const PLAYBACK_BASE_SECONDS = 24;
export const PLAYBACK_RATES = [0.5, 1, 2, 4] as const;

/** A request for the map camera to go somewhere. `nonce` changes on every request. */
export type FocusRequest =
  | { kind: 'object'; id: string; nonce: number }
  | { kind: 'flight'; nonce: number };

export interface Toast {
  id: number;
  message: string;
}

export interface FlightState {
  /* ----- the flight ----- */
  regime: AstrometricRegime;
  driveCore: DriveCore;
  /** Which of the five engines is selected. `driveCore` is derived from it. */
  engineId: EngineId;

  origin: AstroObject | null;
  destination: AstroObject | null;
  distanceMeters: number;

  /** Ship mass in kilograms. */
  mass: number;
  /** Acceleration of the selected sublight engine, in g. */
  accelerationG: number;
  /** Speed limit of the selected sublight engine, as a fraction of light speed. */
  speedCapC: number;
  /**
   * Fuel budget of the selected engine in km/s of velocity change. Used by the chemical rocket
   * and the ion drive on the solar-system map; 0 for the other engines.
   */
  deltaVKms: number;
  /** Warp factor (multiples of light speed). */
  warpFactor: number;
  /** Tuned acceleration, speed limit and fuel budget remembered per sublight engine. */
  engineSettings: EngineSettings;

  /* ----- when (solar-system map only) ----- */
  /**
   * Earliest launch date, as a whole day number (days since 2000-01-01 12:00 UT; see
   * `src/physics/ephemeris.ts`). The actual launch can be later: see `plan.launchDay`.
   */
  departureDay: number;
  /** Chemical rocket: brake into orbit at the destination, or fly past it. */
  arrivalMode: ArrivalMode;
  /**
   * Chemical rocket: when set, fly exactly this many days starting on `departureDay` (a flight
   * picked on the launch-window chart) instead of the soonest arrival the budget allows.
   */
  pinnedTofDays: number | null;

  /* ----- derived results (recomputed on every change) ----- */
  sublightResult: SublightResult | null;
  warpResult: WarpResult | null;
  /** Moment-by-moment model of the current flight, or null when there is no route. */
  profile: FlightProfile | null;
  /**
   * Solar-system map: when the flight launches and arrives, which model it uses and what fuel it
   * needs. Null on the star map and when there is no route.
   */
  plan: FlightPlan | null;
  /** Travel time of all five engines for the current route, slowest tier first. */
  comparison: EngineComparison[];
  /** Goes up by one whenever anything about the flight changes. */
  flightRevision: number;
  /** Goes up by one whenever the origin or destination changes. */
  routeRevision: number;

  /* ----- playback ("fly this flight") ----- */
  playing: boolean;
  /** 0..1: how much of the flight's Earth-time duration has elapsed. */
  progress: number;
  /** Playback speed multiplier (one of PLAYBACK_RATES). */
  playbackRate: number;
  /** Goes up by one each time a playback reaches the destination. */
  arrivalCount: number;
  /** True once the visitor has started a playback at least once this visit. */
  hasFlown: boolean;

  /* ----- map and interface state ----- */
  layers: MapLayers;
  /** Object whose info card is open on the map. */
  selectedId: string | null;
  /** Object under the pointer on the map. */
  hoveredId: string | null;
  /** Object to "ping" on the map (for example the search result under the pointer). */
  beaconId: string | null;
  focusRequest: FocusRequest | null;
  /** Which target picker is open, if any. */
  picker: Endpoint | null;
  toast: Toast | null;

  /* ----- actions: flight ----- */
  /** Legacy low-level setter: switches map and clears the route. Prefer `switchRegime`. */
  setRegime: (regime: AstrometricRegime) => void;
  /** Legacy setter. Prefer `setEngine`. */
  setDriveCore: (core: DriveCore) => void;
  /** Legacy low-level setters (no cross-map handling). Prefer `setEndpoint`. */
  setOrigin: (obj: AstroObject | null) => void;
  setDestination: (obj: AstroObject | null) => void;
  setShipParams: (params: Partial<Pick<FlightState, 'mass' | 'accelerationG' | 'speedCapC' | 'deltaVKms' | 'warpFactor'>>) => void;

  /** Set the earliest launch date (day number). Drops any flight pinned on the launch-window chart. */
  setDepartureDay: (day: number) => void;
  setArrivalMode: (mode: ArrivalMode) => void;
  /** Fly exactly this launch date and travel time (picked on the launch-window chart). */
  pinFlight: (day: number, tofDays: number) => void;
  /** Go back to the soonest arrival the fuel budget allows. */
  clearPin: () => void;

  /** Select an engine. Restores that engine's remembered acceleration and speed limit. */
  setEngine: (id: EngineId) => void;
  /**
   * Set the origin or destination by catalog id. Handles everything: picking an object from
   * the other map switches map and chooses a sensible other end; picking the object that is
   * already at the other end swaps the two.
   */
  setEndpoint: (which: Endpoint, id: string) => void;
  swapEndpoints: () => void;
  /** Switch between the solar-system map and the star map, loading that map's default route. */
  switchRegime: (regime: AstrometricRegime) => void;
  /** Load a complete flight (a famous flight or a shared link). Returns false if it cannot be resolved. */
  loadFlight: (spec: FlightSpec) => boolean;

  /* ----- actions: playback ----- */
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  /** Jump to a moment of the flight (0..1). Does not change play/pause. */
  seek: (progress: number) => void;
  /** Used by the playback driver each frame. Stops and counts an arrival at 1. */
  advance: (deltaProgress: number) => void;
  setPlaybackRate: (rate: number) => void;

  /* ----- actions: map and interface ----- */
  toggleLayer: (layer: keyof MapLayers) => void;
  selectObject: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  setBeacon: (id: string | null) => void;
  /** Fly the map camera to an object. */
  focusObject: (id: string) => void;
  /** Fly the map camera back to frame the whole flight. */
  frameFlight: () => void;
  openPicker: (which: Endpoint | null) => void;
  showToast: (message: string) => void;
  dismissToast: () => void;
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

const calculateDistanceMeters = (origin: AstroObject | null, destination: AstroObject | null, regime: AstrometricRegime): number => {
  if (!origin || !destination) return 0;
  const dx = destination.coords[0] - origin.coords[0];
  const dy = destination.coords[1] - origin.coords[1];
  const dz = destination.coords[2] - origin.coords[2];
  const distanceUnits = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return regime === 'Systemic' ? distanceUnits * AU_TO_METERS : distanceUnits * PARSEC_TO_METERS;
};

interface FlightInputs {
  regime: AstrometricRegime;
  driveCore: DriveCore;
  engineId: EngineId;
  origin: AstroObject | null;
  destination: AstroObject | null;
  mass: number;
  accelerationG: number;
  speedCapC: number;
  warpFactor: number;
  engineSettings: EngineSettings;
  departureDay: number;
  arrivalMode: ArrivalMode;
  pinnedTofDays: number | null;
}

interface FlightDerived {
  distanceMeters: number;
  sublightResult: SublightResult | null;
  warpResult: WarpResult | null;
  profile: FlightProfile | null;
  plan: FlightPlan | null;
  comparison: EngineComparison[];
}

/** Everything that follows from the inputs. The only place physics is run for the active flight. */
const derive = (s: FlightInputs): FlightDerived => {
  // Solar-system map: positions depend on the date and each engine has its own flight model.
  if (s.regime === 'Systemic' && s.origin && s.destination && canPlanSystemic(s.origin.name, s.destination.name)) {
    const input = {
      origin: s.origin.name,
      dest: s.destination.name,
      engineId: s.driveCore === 'Warp' ? ('warp' as EngineId) : s.engineId,
      settings: s.engineSettings,
      warpFactor: s.warpFactor,
      mass: s.mass,
      departureDay: s.departureDay,
      arrivalMode: s.arrivalMode,
      pinnedTofDays: s.pinnedTofDays,
    };
    const flight = planSystemic(input);
    return { ...flight, comparison: compareSystemic(input) };
  }

  const distanceMeters = calculateDistanceMeters(s.origin, s.destination, s.regime);
  let sublightResult: SublightResult | null = null;
  let warpResult: WarpResult | null = null;
  let profile: FlightProfile | null = null;

  if (distanceMeters > 0) {
    if (s.driveCore === 'Sublight') {
      const safeSpeedCapC = Math.min(s.speedCapC, 0.99999999);
      const params = {
        distance: distanceMeters,
        acceleration: s.accelerationG * GRAVITY,
        velocityCeiling: safeSpeedCapC * SPEED_OF_LIGHT,
      };
      sublightResult = KinematicsEngine.calculateSublight({ ...params, mass: s.mass });
      profile = buildSublightProfile(params);
    } else {
      warpResult = KinematicsEngine.calculateWarp(distanceMeters, s.warpFactor, s.mass);
      profile = buildWarpProfile(distanceMeters, s.warpFactor);
    }
  }

  const comparison = compareEngines(distanceMeters, s.mass, s.engineSettings, s.warpFactor);
  return { distanceMeters, sublightResult, warpResult, profile, plan: null, comparison };
};

const mapName = (regime: AstrometricRegime): string => (regime === 'Interstellar' ? 'star map' : 'solar-system map');

/** Resolve a flight spec's two slugs to entries that share a map. */
const resolveRoute = (spec: Pick<FlightSpec, 'from' | 'to'>): { from: CatalogEntry; to: CatalogEntry } | null => {
  for (const regime of ['Systemic', 'Interstellar'] as const) {
    const from = findBySlug(spec.from, regime);
    const to = findBySlug(spec.to, regime);
    if (from && to && from.regime === regime && to.regime === regime && from.id !== to.id) return { from, to };
  }
  return null;
};

/** The inputs a flight spec describes, or null if its places cannot be found. */
const inputsFromSpec = (spec: FlightSpec, base: { engineSettings: EngineSettings; mass: number; warpFactor: number; departureDay: number }) => {
  const route = resolveRoute(spec);
  if (!route) return null;
  const engineId: EngineId = isEngineId(spec.engine) ? spec.engine : 'fusion';
  const engineSettings: EngineSettings = { ...base.engineSettings };
  let warpFactor = base.warpFactor;
  const warp = getEngine('warp');
  if (engineId === 'warp') {
    if (spec.w !== undefined && warp.drive === 'Warp') warpFactor = clamp(spec.w, warp.minFactor, warp.maxFactor);
  } else {
    const current = engineSettings[engineId];
    engineSettings[engineId] = clampSublightSettings(engineId, {
      accelerationG: spec.a ?? current.accelerationG,
      speedCapC: spec.v ?? current.speedCapC,
      deltaVKms: spec.dv ?? current.deltaVKms,
    });
  }
  const specDay = spec.date ? dayFromIso(spec.date) : null;
  const departureDay = clamp(specDay ?? base.departureDay, MIN_DAY, MAX_DAY);
  const pinnedTofDays = engineId === 'chemical' && spec.tof !== undefined && spec.tof > 0 ? spec.tof : null;
  const mass = spec.m !== undefined ? clamp(spec.m * 1000, MIN_MASS_KG, MAX_MASS_KG) : base.mass;
  const active: SublightEngineId = engineId === 'warp' ? 'fusion' : engineId;
  return {
    regime: route.from.regime,
    engineId,
    driveCore: (engineId === 'warp' ? 'Warp' : 'Sublight') as DriveCore,
    origin: route.from.obj,
    destination: route.to.obj,
    engineSettings,
    accelerationG: engineSettings[active].accelerationG,
    speedCapC: engineSettings[active].speedCapC,
    deltaVKms: engineId === 'warp' ? 0 : engineSettings[active].deltaVKms,
    warpFactor,
    mass,
    departureDay,
    arrivalMode: (spec.arr === 'flyby' ? 'flyby' : 'orbit') as ArrivalMode,
    pinnedTofDays,
  };
};

/** The shareable description of the current flight, or null when there is no route. */
export const specFromState = (
  s: Pick<FlightState, 'origin' | 'destination' | 'engineId' | 'accelerationG' | 'speedCapC' | 'warpFactor' | 'mass'> &
    Partial<Pick<FlightState, 'regime' | 'deltaVKms' | 'departureDay' | 'arrivalMode' | 'pinnedTofDays'>>,
): FlightSpec | null => {
  if (!s.origin || !s.destination) return null;
  const from = getEntry(s.origin.id);
  const to = getEntry(s.destination.id);
  if (!from || !to) return null;
  const spec: FlightSpec = { from: from.slug, to: to.slug, engine: s.engineId, m: s.mass / 1000 };
  if (s.engineId === 'warp') spec.w = s.warpFactor;
  else {
    spec.a = s.accelerationG;
    spec.v = s.speedCapC;
  }
  if (s.regime === 'Systemic' && s.departureDay !== undefined) {
    spec.date = isoFromDay(s.departureDay);
    const orbital = s.engineId === 'chemical' || s.engineId === 'ion';
    if (orbital && s.deltaVKms) spec.dv = s.deltaVKms;
    if (s.engineId === 'chemical') {
      if (s.arrivalMode === 'flyby') spec.arr = 'flyby';
      if (s.pinnedTofDays) spec.tof = s.pinnedTofDays;
    }
  }
  return spec;
};

/** The result object for whichever drive is active. */
export const selectResult = (s: FlightState): SublightResult | WarpResult | null =>
  s.driveCore === 'Sublight' ? s.sublightResult : s.warpResult;

/* ------------------------------------------------------------------ */
/* Initial state: a flight from the page address, else the default.    */
/* ------------------------------------------------------------------ */

const initialBase = { engineSettings: defaultEngineSettings(), mass: DEFAULT_MASS_KG, warpFactor: 10, departureDay: todayDay() };

const sharedSpec = typeof window !== 'undefined' ? parseFlightSpec(window.location.search) : null;
/** True when the page was opened from a link that carries a flight. */
export const openedFromSharedLink = sharedSpec !== null && inputsFromSpec(sharedSpec, initialBase) !== null;

const initialInputs =
  (sharedSpec && inputsFromSpec(sharedSpec, initialBase)) ||
  inputsFromSpec(DEFAULT_FLIGHT, initialBase) || {
    regime: 'Systemic' as AstrometricRegime,
    engineId: 'fusion' as EngineId,
    driveCore: 'Sublight' as DriveCore,
    origin: null,
    destination: null,
    engineSettings: initialBase.engineSettings,
    accelerationG: 1,
    speedCapC: 0.2,
    deltaVKms: 0,
    warpFactor: 10,
    mass: DEFAULT_MASS_KG,
    departureDay: initialBase.departureDay,
    arrivalMode: 'orbit' as ArrivalMode,
    pinnedTofDays: null,
  };

let nonce = 0;
const nextNonce = (): number => ++nonce;

/** State changes that go with any change to the flight: stop and rewind playback. */
const flightChanged = (state: FlightState, routeChanged: boolean) => ({
  playing: false,
  progress: 0,
  flightRevision: state.flightRevision + 1,
  routeRevision: state.routeRevision + (routeChanged ? 1 : 0),
});

export const useFlightStore = create<FlightState>((set, get) => ({
  ...initialInputs,
  ...derive(initialInputs),
  flightRevision: 0,
  routeRevision: 0,

  playing: false,
  progress: 0,
  playbackRate: 1,
  arrivalCount: 0,
  hasFlown: false,

  layers: { exoplanets: false, labels: true, orbits: true, milkyWay: true },
  selectedId: null,
  hoveredId: null,
  beaconId: null,
  focusRequest: null,
  picker: null,
  toast: null,

  /* ----- legacy setters (kept for the existing tests and simple callers) ----- */

  setRegime: (regime) =>
    set((state) => {
      const next = { ...state, regime, origin: null, destination: null, pinnedTofDays: null };
      return { regime, origin: null, destination: null, pinnedTofDays: null, selectedId: null, hoveredId: null, beaconId: null, ...derive(next), ...flightChanged(state, true) };
    }),

  setDriveCore: (driveCore) =>
    set((state) => {
      const engineId: EngineId = driveCore === 'Warp' ? 'warp' : state.engineId === 'warp' ? 'fusion' : state.engineId;
      const next = { ...state, driveCore, engineId, pinnedTofDays: null };
      return { driveCore, engineId, pinnedTofDays: null, ...derive(next), ...flightChanged(state, false) };
    }),

  setOrigin: (origin) =>
    set((state) => ({ origin, pinnedTofDays: null, ...derive({ ...state, origin, pinnedTofDays: null }), ...flightChanged(state, true) })),

  setDestination: (destination) =>
    set((state) => ({ destination, pinnedTofDays: null, ...derive({ ...state, destination, pinnedTofDays: null }), ...flightChanged(state, true) })),

  setShipParams: (params) =>
    set((state) => {
      const patch: Partial<FlightState> = {};
      if (params.mass !== undefined && Number.isFinite(params.mass)) patch.mass = clamp(params.mass, MIN_MASS_KG, MAX_MASS_KG);
      const warp = getEngine('warp');
      if (params.warpFactor !== undefined && Number.isFinite(params.warpFactor) && warp.drive === 'Warp') {
        patch.warpFactor = clamp(params.warpFactor, warp.minFactor, warp.maxFactor);
      }
      if (params.accelerationG !== undefined || params.speedCapC !== undefined || params.deltaVKms !== undefined) {
        const active: SublightEngineId = state.engineId === 'warp' ? 'fusion' : state.engineId;
        const tuned = clampSublightSettings(active, {
          accelerationG: params.accelerationG ?? state.accelerationG,
          speedCapC: params.speedCapC ?? state.speedCapC,
          deltaVKms: params.deltaVKms ?? state.engineSettings[active].deltaVKms,
        });
        patch.accelerationG = tuned.accelerationG;
        patch.speedCapC = tuned.speedCapC;
        if (state.engineId !== 'warp') patch.deltaVKms = tuned.deltaVKms;
        patch.engineSettings = { ...state.engineSettings, [active]: tuned };
      }
      const next = { ...state, ...patch };
      return { ...patch, ...derive(next), ...flightChanged(state, false) };
    }),

  /* ----- flight ----- */

  setEngine: (engineId) =>
    set((state) => {
      if (engineId === state.engineId) return {};
      const patch: Partial<FlightState> = { engineId, driveCore: engineId === 'warp' ? 'Warp' : 'Sublight', pinnedTofDays: null, deltaVKms: 0 };
      if (engineId !== 'warp') {
        const tuned = clampSublightSettings(engineId, state.engineSettings[engineId]);
        patch.accelerationG = tuned.accelerationG;
        patch.speedCapC = tuned.speedCapC;
        patch.deltaVKms = tuned.deltaVKms;
      }
      const next = { ...state, ...patch };
      return { ...patch, ...derive(next), ...flightChanged(state, false) };
    }),

  setEndpoint: (which, id) => {
    const entry = getEntry(id);
    if (!entry) return;
    const state = get();
    const other: Endpoint = which === 'origin' ? 'destination' : 'origin';
    const otherObj = state[other];

    if (entry.regime === state.regime) {
      if (otherObj && otherObj.id === entry.id) {
        // Picked the object that is already at the other end: swap instead of a zero-length flight.
        get().swapEndpoints();
        set({ picker: null, selectedId: null });
        return;
      }
      if (state[which]?.id === entry.id) {
        set({ picker: null, selectedId: null });
        return;
      }
      set((s) => {
        const next = { ...s, [which]: entry.obj, pinnedTofDays: null };
        return { [which]: entry.obj, pinnedTofDays: null, picker: null, selectedId: null, ...derive(next), ...flightChanged(s, true) } as Partial<FlightState>;
      });
      return;
    }

    // The object is on the other map. Switch maps and choose the other end:
    // keep it if it exists on both maps (Sol does), otherwise fall back to that map's default.
    const regime = entry.regime;
    const otherEntry = otherObj ? getEntry(otherObj.id) : undefined;
    const counterpart = otherEntry ? findBySlug(otherEntry.slug, regime) : undefined;
    const defaults = DEFAULT_ROUTE[regime];
    const candidates = [
      counterpart && counterpart.regime === regime ? counterpart : undefined,
      findBySlug(other === 'origin' ? defaults.from : defaults.to, regime),
      findBySlug(other === 'origin' ? defaults.to : defaults.from, regime),
    ];
    const chosenOther = candidates.find((c): c is CatalogEntry => !!c && c.regime === regime && c.id !== entry.id);
    if (!chosenOther) return;

    set((s) => {
      const patch = {
        regime,
        origin: which === 'origin' ? entry.obj : chosenOther.obj,
        destination: which === 'destination' ? entry.obj : chosenOther.obj,
        pinnedTofDays: null,
      };
      const next = { ...s, ...patch };
      const keptOther = counterpart && chosenOther.id === counterpart.id;
      const message = keptOther
        ? `Switched to the ${mapName(regime)}.`
        : `Switched to the ${mapName(regime)}. ${other === 'origin' ? 'Starting from' : 'Flying to'} ${chosenOther.name}.`;
      return {
        ...patch,
        picker: null,
        selectedId: null,
        hoveredId: null,
        beaconId: null,
        toast: { id: nextNonce(), message },
        ...derive(next),
        ...flightChanged(s, true),
      };
    });
  },

  swapEndpoints: () =>
    set((state) => {
      if (!state.origin || !state.destination) return {};
      const patch = { origin: state.destination, destination: state.origin, pinnedTofDays: null };
      return { ...patch, ...derive({ ...state, ...patch }), ...flightChanged(state, true) };
    }),

  switchRegime: (regime) => {
    const state = get();
    if (regime === state.regime && state.origin && state.destination) return;
    const defaults = DEFAULT_ROUTE[regime];
    const from = findBySlug(defaults.from, regime);
    const to = findBySlug(defaults.to, regime);
    set((s) => {
      const patch = { regime, origin: from?.obj ?? null, destination: to?.obj ?? null, pinnedTofDays: null };
      return { ...patch, selectedId: null, hoveredId: null, beaconId: null, picker: null, ...derive({ ...s, ...patch }), ...flightChanged(s, true) };
    });
  },

  loadFlight: (spec) => {
    const state = get();
    // A loaded flight starts every engine from its defaults, so the side-by-side engine
    // comparison is fair and not skewed by tuning left over from an earlier flight.
    const inputs = inputsFromSpec(spec, {
      engineSettings: defaultEngineSettings(),
      mass: state.mass,
      warpFactor: state.warpFactor,
      departureDay: state.departureDay,
    });
    if (!inputs) return false;
    set((s) => ({
      ...inputs,
      selectedId: null,
      hoveredId: null,
      beaconId: null,
      picker: null,
      ...derive(inputs),
      ...flightChanged(s, true),
    }));
    return true;
  },

  /* ----- when ----- */

  setDepartureDay: (day) =>
    set((state) => {
      if (!Number.isFinite(day)) return {};
      const departureDay = clamp(Math.round(day), MIN_DAY, MAX_DAY);
      if (departureDay === state.departureDay && state.pinnedTofDays === null) return {};
      const patch = { departureDay, pinnedTofDays: null };
      return { ...patch, ...derive({ ...state, ...patch }), ...flightChanged(state, false) };
    }),

  setArrivalMode: (arrivalMode) =>
    set((state) => {
      if (arrivalMode === state.arrivalMode) return {};
      return { arrivalMode, ...derive({ ...state, arrivalMode }), ...flightChanged(state, false) };
    }),

  pinFlight: (day, tofDays) =>
    set((state) => {
      if (!Number.isFinite(day) || !(tofDays > 0)) return {};
      const patch = { departureDay: clamp(Math.round(day), MIN_DAY, MAX_DAY), pinnedTofDays: tofDays };
      return { ...patch, ...derive({ ...state, ...patch }), ...flightChanged(state, false) };
    }),

  clearPin: () =>
    set((state) => {
      if (state.pinnedTofDays === null) return {};
      return { pinnedTofDays: null, ...derive({ ...state, pinnedTofDays: null }), ...flightChanged(state, false) };
    }),

  /* ----- playback ----- */

  play: () =>
    set((state) => {
      if (!state.profile) return {};
      return { playing: true, hasFlown: true, progress: state.progress >= 1 ? 0 : state.progress, selectedId: null };
    }),
  pause: () => set({ playing: false }),
  togglePlay: () => (get().playing ? get().pause() : get().play()),
  seek: (progress) => set({ progress: clamp(Number.isFinite(progress) ? progress : 0, 0, 1) }),
  advance: (deltaProgress) =>
    set((state) => {
      if (!state.playing) return {};
      const progress = state.progress + deltaProgress;
      if (progress >= 1) return { progress: 1, playing: false, arrivalCount: state.arrivalCount + 1 };
      return { progress };
    }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),

  /* ----- map and interface ----- */

  toggleLayer: (layer) => set((state) => ({ layers: { ...state.layers, [layer]: !state.layers[layer] } })),
  selectObject: (selectedId) => set({ selectedId }),
  setHovered: (hoveredId) => set((state) => (state.hoveredId === hoveredId ? {} : { hoveredId })),
  setBeacon: (beaconId) => set((state) => (state.beaconId === beaconId ? {} : { beaconId })),
  focusObject: (id) => set({ focusRequest: { kind: 'object', id, nonce: nextNonce() } }),
  frameFlight: () => set({ focusRequest: { kind: 'flight', nonce: nextNonce() } }),
  openPicker: (picker) => set({ picker }),
  showToast: (message) => set({ toast: { id: nextNonce(), message } }),
  dismissToast: () => set({ toast: null }),
}));
