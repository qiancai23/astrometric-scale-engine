export const SPEED_OF_LIGHT = 299792458; // m/s
export const SECONDS_IN_YEAR = 31557600;

export interface PhysicsParams {
  distance: number; // meters
  acceleration: number; // m/s^2
  velocityCeiling: number; // m/s, strictly < c for sublight
  mass: number; // kg
}

export interface SublightResult {
  properTime: number; // seconds
  coordinateTime: number; // seconds
  peakVelocity: number; // m/s
  energyExajoules: number; // EJ
  accelerationDistanceMeters: number;
  coastingPhaseSeconds: number;
}

export interface WarpResult {
  properTime: number; // seconds
  coordinateTime: number; // seconds
  peakVelocity: number; // m/s
  energyExajoules: number; // EJ
  lorentzFactor: number;
}

export class KinematicsEngine {
  /**
   * Calculates the sub-light travel profile considering a flip-and-decelerate maneuver.
   * Uses relativistic kinematics.
   */
  static calculateSublight(params: PhysicsParams): SublightResult {
    const { distance, acceleration, velocityCeiling, mass } = params;
    const c = SPEED_OF_LIGHT;
    const halfDistance = distance / 2;

    // Calculate the distance required to reach the velocity ceiling
    // v_max = c * sqrt(1 - (1/gamma_max)^2)
    // gamma_max = 1 / sqrt(1 - (v_max/c)^2)
    const gammaMax = 1 / Math.sqrt(1 - Math.pow(velocityCeiling / c, 2));
    const accelDistance = (c * c / acceleration) * (gammaMax - 1);

    let coordinateTime = 0;
    let properTime = 0;
    let peakVelocity = 0;
    let peakGamma = 1;

    if (accelDistance >= halfDistance) {
      // The ship never reaches the velocity ceiling before the midpoint.
      // It accelerates for half the distance, then decelerates.
      
      // Coordinate time to midpoint
      // t = (c/a) * sqrt( (1 + a*x/c^2)^2 - 1 )
      const factor = 1 + (acceleration * halfDistance) / (c * c);
      const tMid = (c / acceleration) * Math.sqrt(factor * factor - 1);
      coordinateTime = 2 * tMid;

      // Proper time to midpoint
      // tau = (c/a) * arcosh(1 + a*x/c^2)
      const tauMid = (c / acceleration) * Math.acosh(factor);
      properTime = 2 * tauMid;

      // Peak velocity
      // v = c * (a*t) / sqrt(c^2 + (a*t)^2)
      peakVelocity = c * (acceleration * tMid) / Math.sqrt(c * c + Math.pow(acceleration * tMid, 2));
      peakGamma = factor; // gamma is exactly 1 + ax/c^2
    } else {
      // The ship reaches the velocity ceiling, coasts, then decelerates.
      
      // Accel phase (one way)
      // t_accel = v_max * gamma_max / a
      const tAccel = (velocityCeiling * gammaMax) / acceleration;
      // tau_accel = (c/a) * atanh(v_max/c) = (c/a) * acosh(gamma_max)
      const tauAccel = (c / acceleration) * Math.acosh(gammaMax);

      // Coast phase (total)
      const coastDistance = distance - 2 * accelDistance;
      const tCoast = coastDistance / velocityCeiling;
      const tauCoast = tCoast / gammaMax;

      coordinateTime = 2 * tAccel + tCoast;
      properTime = 2 * tauAccel + tauCoast;
      peakVelocity = velocityCeiling;
      peakGamma = gammaMax;
    }

    // Energy Calculation
    // Relativistic Kinetic Energy: E_k = (gamma - 1) * M_0 * c^2
    // We calculate the energy for the acceleration phase.
    const kineticEnergyJoules = (peakGamma - 1) * mass * c * c;
    const energyExajoules = kineticEnergyJoules / 1e18;

    return {
      properTime,
      coordinateTime,
      peakVelocity,
      energyExajoules,
      accelerationDistanceMeters: accelDistance,
      coastingPhaseSeconds: (accelDistance >= halfDistance) ? 0 : (distance - 2 * accelDistance) / velocityCeiling
    };
  }

  /**
   * Calculates the superluminal (Alcubierre) warp travel profile.
   * Physics dictates flat space-time within the bubble (Lorentz = 1).
   */
  static calculateWarp(distance: number, warpFactor: number, mass: number): WarpResult {
    const c = SPEED_OF_LIGHT;
    const velocity = warpFactor * c;
    const time = distance / velocity;

    // Speculative energy model: E = (mass * time) / constant to represent reactor upkeep
    // We will use an arbitrary scaling factor for MVP to give reasonable Exajoule outputs.
    const energyExajoules = (mass * time) / 1e12; 

    return {
      properTime: time,
      coordinateTime: time,
      peakVelocity: velocity,
      energyExajoules,
      lorentzFactor: 1.0
    };
  }
}
