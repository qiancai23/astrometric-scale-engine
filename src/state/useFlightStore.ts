import { create } from 'zustand';
import { KinematicsEngine, SublightResult, WarpResult, SPEED_OF_LIGHT } from '../physics/kinematicsEngine';

export interface AstroObject {
  id: string;
  name: string;
  catalog_origin?: string;
  type?: string;
  mag?: number;
  coords: [number, number, number];
  display_metrics?: {
    constellation?: string | null;
    apparent_magnitude?: number;
    true_distance_ly?: number;
    scale_narrative?: string;
  };
}

export type DriveCore = 'Sublight' | 'Warp';
export type AstrometricRegime = 'Systemic' | 'Interstellar';

export const PARSEC_TO_METERS = 3.085677581e16;
export const AU_TO_METERS = 1.495978707e11;
export const GRAVITY = 9.80665;

export interface FlightState {
  regime: AstrometricRegime;
  driveCore: DriveCore;
  
  origin: AstroObject | null;
  destination: AstroObject | null;
  distanceMeters: number;
  
  mass: number;
  accelerationG: number;
  speedCapC: number;
  warpFactor: number;
  
  sublightResult: SublightResult | null;
  warpResult: WarpResult | null;

  setRegime: (regime: AstrometricRegime) => void;
  setDriveCore: (core: DriveCore) => void;
  setOrigin: (obj: AstroObject | null) => void;
  setDestination: (obj: AstroObject | null) => void;
  setShipParams: (params: Partial<Pick<FlightState, 'mass' | 'accelerationG' | 'speedCapC' | 'warpFactor'>>) => void;
}

const calculateDistanceMeters = (origin: AstroObject | null, destination: AstroObject | null, regime: AstrometricRegime): number => {
  if (!origin || !destination) return 0;
  const dx = destination.coords[0] - origin.coords[0];
  const dy = destination.coords[1] - origin.coords[1];
  const dz = destination.coords[2] - origin.coords[2];
  const distanceUnits = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  return regime === 'Systemic' ? distanceUnits * AU_TO_METERS : distanceUnits * PARSEC_TO_METERS;
};

const recalculatePhysics = (state: Omit<FlightState, 'setRegime' | 'setDriveCore' | 'setOrigin' | 'setDestination' | 'setShipParams'>) => {
  let sublightResult: SublightResult | null = null;
  let warpResult: WarpResult | null = null;

  if (state.distanceMeters > 0) {
    if (state.driveCore === 'Sublight') {
      const safeSpeedCapC = Math.min(state.speedCapC, 0.99999999);
      sublightResult = KinematicsEngine.calculateSublight({
        distance: state.distanceMeters,
        acceleration: state.accelerationG * GRAVITY,
        velocityCeiling: safeSpeedCapC * SPEED_OF_LIGHT,
        mass: state.mass
      });
    } else {
      warpResult = KinematicsEngine.calculateWarp(state.distanceMeters, state.warpFactor, state.mass);
    }
  }

  return { sublightResult, warpResult };
};

export const useFlightStore = create<FlightState>((set) => ({
  regime: 'Systemic',
  driveCore: 'Sublight',
  
  origin: null,
  destination: null,
  distanceMeters: 0,
  
  mass: 1000000,
  accelerationG: 1.0,
  speedCapC: 0.95,
  warpFactor: 10.0,
  
  sublightResult: null,
  warpResult: null,

  setRegime: (regime) => set((state) => {
    const distanceMeters = 0;
    const origin = null;
    const destination = null;
    const physics = recalculatePhysics({ ...state, regime, origin, destination, distanceMeters });
    return { regime, origin, destination, distanceMeters, ...physics };
  }),

  setDriveCore: (driveCore) => set((state) => {
    const physics = recalculatePhysics({ ...state, driveCore });
    return { driveCore, ...physics };
  }),

  setOrigin: (origin) => set((state) => {
    const distanceMeters = calculateDistanceMeters(origin, state.destination, state.regime);
    const physics = recalculatePhysics({ ...state, origin, distanceMeters });
    return { origin, distanceMeters, ...physics };
  }),

  setDestination: (destination) => set((state) => {
    const distanceMeters = calculateDistanceMeters(state.origin, destination, state.regime);
    const physics = recalculatePhysics({ ...state, destination, distanceMeters });
    return { destination, distanceMeters, ...physics };
  }),

  setShipParams: (params) => set((state) => {
    const newState = { ...state, ...params };
    const physics = recalculatePhysics(newState);
    return { ...params, ...physics };
  }),
}));
