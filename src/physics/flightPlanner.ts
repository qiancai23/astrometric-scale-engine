import { KinematicsEngine, SPEED_OF_LIGHT, SublightResult, WarpResult } from './kinematicsEngine';
import { buildSublightProfile, buildWarpProfile, FlightProfile } from './flightProfile';
import { hasEphemeris, isSun } from './ephemeris';
import {
  ArrivalMode,
  ballisticProfile,
  lunarProfile,
  solveBallistic,
  solveDirect,
  solveLunar,
  solveSpiral,
  spiralProfile,
  withDirectPath,
} from './transfer';
import {
  ENGINES,
  EngineComparison,
  EngineSettings,
  GRAVITY,
  applyLogFractions,
  clampSublightSettings,
} from '../data/engines';
import type { EngineId } from '../types';

/**
 * Flight planner for the solar-system map: chooses the right model for the engine and the two
 * places, and returns the flight in the shapes the rest of the app already uses.
 *
 * - Chemical rocket: a coasting orbit found for the launch date (`ballistic`), or the Earth ↔ Moon
 *   version of it (`lunar`).
 * - Ion drive: a slow low-thrust spiral (`spiral`).
 * - Fusion, antimatter, warp, and any flight that starts or ends at the Sun: a straight line
 *   aimed at where the destination will be on arrival (`direct`).
 */

export type FlightModel = 'ballistic' | 'lunar' | 'spiral' | 'direct';

/** When and how a solar-system flight happens. */
export interface FlightPlan {
  model: FlightModel;
  /** Actual launch date (day number). Later than the requested date when the ship waits for a window. */
  launchDay: number;
  arrivalDay: number;
  /** Days between the requested date and the launch. */
  waitDays: number;
  /** Velocity change the flight needs, km/s. Null for direct flights. */
  dvNeededKms: number | null;
  dvDepartKms: number | null;
  dvArriveKms: number | null;
  /** The engine's fuel budget, km/s. Null for direct flights. */
  dvBudgetKms: number | null;
  /** False when the flight needs more than the budget. */
  feasible: boolean;
  /** True when the visitor picked this exact launch date and travel time. */
  pinned: boolean;
  /** Cheapest possible flight if leaving on the requested date itself, km/s (chemical rocket round the Sun only). */
  dvOnRequestedDayKms: number | null;
  /** Whether the flight brakes into orbit or flies past. Null where the choice does not apply. */
  arrivalMode: ArrivalMode | null;
}

export interface PlannerInput {
  /** Catalog names, e.g. "Earth", "Mars". */
  origin: string;
  dest: string;
  engineId: EngineId;
  settings: EngineSettings;
  warpFactor: number;
  /** kg */
  mass: number;
  /** Earliest launch date (whole day number). */
  departureDay: number;
  arrivalMode: ArrivalMode;
  /** Chemical rocket: fly exactly this travel time from the departure date. */
  pinnedTofDays: number | null;
}

export interface PlannedFlight {
  distanceMeters: number;
  profile: FlightProfile | null;
  plan: FlightPlan | null;
  sublightResult: SublightResult | null;
  warpResult: WarpResult | null;
}

/** True when both places are bodies whose position is known for any date. */
export const canPlanSystemic = (origin: string, dest: string): boolean => hasEphemeris(origin) && hasEphemeris(dest) && origin !== dest;

const isMoonTrip = (a: string, b: string): boolean => (a === 'Earth' && b === 'Moon') || (a === 'Moon' && b === 'Earth');

/** Which model a flight uses. */
export function modelFor(origin: string, dest: string, engineId: EngineId): FlightModel {
  if (isSun(origin) || isSun(dest)) return 'direct';
  if (engineId === 'chemical') return isMoonTrip(origin, dest) ? 'lunar' : 'ballistic';
  if (engineId === 'ion') return 'spiral';
  return 'direct';
}

/** A results record for flights that are not constant-acceleration: energy is that of the velocity change. */
const orbitalResult = (profile: FlightProfile, dvKms: number, mass: number): SublightResult => ({
  properTime: profile.totalProperTime,
  coordinateTime: profile.totalTime,
  peakVelocity: profile.peakVelocity,
  energyExajoules: (0.5 * mass * (dvKms * 1000) * (dvKms * 1000)) / 1e18,
  accelerationDistanceMeters: 0,
  coastingPhaseSeconds: profile.totalTime,
});

const EMPTY: PlannedFlight = { distanceMeters: 0, profile: null, plan: null, sublightResult: null, warpResult: null };

export function planSystemic(input: PlannerInput): PlannedFlight {
  const { origin, dest, engineId, departureDay } = input;
  if (!canPlanSystemic(origin, dest)) return EMPTY;
  const model = modelFor(origin, dest, engineId);

  if (model === 'ballistic' || model === 'lunar') {
    const budget = clampSublightSettings('chemical', input.settings.chemical).deltaVKms;
    if (model === 'lunar') {
      const toMoon = dest === 'Moon';
      const p = solveLunar(toMoon, budget, input.arrivalMode, input.pinnedTofDays);
      const profile = lunarProfile(p, toMoon, departureDay);
      return {
        distanceMeters: profile.distance,
        profile,
        plan: {
          model,
          launchDay: departureDay,
          arrivalDay: departureDay + p.tofDays,
          waitDays: 0,
          dvNeededKms: p.dvTotalKms,
          dvDepartKms: p.dvDepartKms,
          dvArriveKms: p.dvArriveKms,
          dvBudgetKms: budget,
          feasible: p.feasible,
          pinned: !!input.pinnedTofDays,
          dvOnRequestedDayKms: null,
          arrivalMode: input.arrivalMode,
        },
        sublightResult: orbitalResult(profile, p.dvTotalKms, input.mass),
        warpResult: null,
      };
    }
    const p = solveBallistic({ origin, dest, earliestDay: departureDay, budgetKms: budget, mode: input.arrivalMode, pinnedTofDays: input.pinnedTofDays });
    if (!p) return EMPTY;
    const profile = ballisticProfile(p);
    return {
      distanceMeters: profile.distance,
      profile,
      plan: {
        model,
        launchDay: p.departDay,
        arrivalDay: p.departDay + p.tofDays,
        waitDays: p.waitDays,
        dvNeededKms: p.dvTotalKms,
        dvDepartKms: p.dvDepartKms,
        dvArriveKms: p.dvArriveKms,
        dvBudgetKms: budget,
        feasible: p.feasible,
        pinned: p.pinned,
        dvOnRequestedDayKms: Number.isFinite(p.dvOnRequestedDayKms) ? p.dvOnRequestedDayKms : null,
        arrivalMode: input.arrivalMode,
      },
      sublightResult: orbitalResult(profile, p.dvTotalKms, input.mass),
      warpResult: null,
    };
  }

  if (model === 'spiral') {
    const s = clampSublightSettings('ion', input.settings.ion);
    const p = solveSpiral(origin, dest, departureDay, s.accelerationG * GRAVITY, s.deltaVKms);
    if (!p) return EMPTY;
    const profile = spiralProfile(p, origin, dest);
    return {
      distanceMeters: profile.distance,
      profile,
      plan: {
        model,
        launchDay: p.departDay,
        arrivalDay: p.departDay + p.tofDays,
        waitDays: p.waitDays,
        dvNeededKms: p.dvNeededKms,
        dvDepartKms: null,
        dvArriveKms: null,
        dvBudgetKms: s.deltaVKms,
        feasible: p.feasible,
        pinned: false,
        dvOnRequestedDayKms: null,
        arrivalMode: null,
      },
      sublightResult: orbitalResult(profile, p.dvNeededKms, input.mass),
      warpResult: null,
    };
  }

  // Direct: the constant-acceleration (or warp) model along a straight line to where the
  // destination will be.
  const directPlan = (tofDays: number): FlightPlan => ({
    model: 'direct',
    launchDay: departureDay,
    arrivalDay: departureDay + tofDays,
    waitDays: 0,
    dvNeededKms: null,
    dvDepartKms: null,
    dvArriveKms: null,
    dvBudgetKms: null,
    feasible: true,
    pinned: false,
    dvOnRequestedDayKms: null,
    arrivalMode: null,
  });

  if (engineId === 'warp') {
    const d = solveDirect(origin, dest, departureDay, (m) => m / (input.warpFactor * SPEED_OF_LIGHT));
    if (!(d.distanceMeters > 0)) return EMPTY;
    return {
      distanceMeters: d.distanceMeters,
      profile: withDirectPath(buildWarpProfile(d.distanceMeters, input.warpFactor), d),
      plan: directPlan(d.tofDays),
      sublightResult: null,
      warpResult: KinematicsEngine.calculateWarp(d.distanceMeters, input.warpFactor, input.mass),
    };
  }
  const s = clampSublightSettings(engineId, input.settings[engineId]);
  const acceleration = s.accelerationG * GRAVITY;
  const velocityCeiling = Math.min(s.speedCapC, 0.99999999) * SPEED_OF_LIGHT;
  const d = solveDirect(origin, dest, departureDay, (m) =>
    m > 0 ? KinematicsEngine.calculateSublight({ distance: m, acceleration, velocityCeiling, mass: input.mass }).coordinateTime : 0,
  );
  if (!(d.distanceMeters > 0)) return EMPTY;
  return {
    distanceMeters: d.distanceMeters,
    profile: withDirectPath(buildSublightProfile({ distance: d.distanceMeters, acceleration, velocityCeiling }), d),
    plan: directPlan(d.tofDays),
    sublightResult: KinematicsEngine.calculateSublight({ distance: d.distanceMeters, acceleration, velocityCeiling, mass: input.mass }),
    warpResult: null,
  };
}

/** Travel time of all five engines for one solar-system route, each with its own model. */
export function compareSystemic(input: PlannerInput): EngineComparison[] {
  const rows: EngineComparison[] = ENGINES.map((engine) => {
    const flight = planSystemic({
      ...input,
      engineId: engine.id,
      pinnedTofDays: engine.id === input.engineId ? input.pinnedTofDays : null,
    });
    const p = flight.profile;
    return {
      engine,
      earthSeconds: p ? p.totalTime : 0,
      shipSeconds: p ? p.totalProperTime : 0,
      peakVelocity: p ? p.peakVelocity : 0,
      logFraction: 0,
    };
  });
  return applyLogFractions(rows);
}
