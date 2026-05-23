import { KinematicsEngine, SPEED_OF_LIGHT, SECONDS_IN_YEAR } from './kinematicsEngine';

describe('KinematicsEngine', () => {
  const LY_IN_METERS = 9.4607304725808e15; // standard definition

  describe('calculateSublight', () => {
    it('Case A: Constant Acceleration to Proxima Centauri without reaching ceiling', () => {
      // Origin: Sol. Destination: Proxima Centauri (4.246 Light-Years)
      // Thrust Profile: 1G continuous acceleration
      const distance = 4.246 * LY_IN_METERS; // ~ 4.017e16 m
      const acceleration = 9.80665; // 1G in m/s^2
      const mass = 100000; // 100,000 kg arbitrary

      const result = KinematicsEngine.calculateSublight({
        distance,
        acceleration,
        velocityCeiling: SPEED_OF_LIGHT * 0.9999, // Unreachable within distance
        mass
      });

      const expectedProperYears = 3.6;
      const expectedCoordinateYears = 5.9;
      const expectedPeakVelocityC = 0.95;

      const actualProperYears = result.properTime / SECONDS_IN_YEAR;
      const actualCoordinateYears = result.coordinateTime / SECONDS_IN_YEAR;
      const actualPeakVelocityC = result.peakVelocity / SPEED_OF_LIGHT;

      // Allow roughly 0.1 years tolerance for these "back of the napkin" expectations
      expect(Math.abs(actualProperYears - expectedProperYears)).toBeLessThan(0.1);
      expect(actualCoordinateYears).toBeCloseTo(expectedCoordinateYears, 1);
      expect(actualPeakVelocityC).toBeCloseTo(expectedPeakVelocityC, 2);
    });

    it('Respects velocity ceiling correctly', () => {
      const distance = 10 * LY_IN_METERS;
      const acceleration = 9.80665;
      const velocityCeiling = SPEED_OF_LIGHT * 0.5; // Cap at 0.5c
      const mass = 100000;

      const result = KinematicsEngine.calculateSublight({
        distance,
        acceleration,
        velocityCeiling,
        mass
      });

      // Should be exactly 0.5c since it will definitely reach it
      expect(result.peakVelocity).toBeCloseTo(velocityCeiling);
    });
  });

  describe('calculateWarp', () => {
    it('Case B: Superluminal Warp Drive (FTL Metric)', () => {
      // Origin: Sol. Destination: Proxima Centauri (4.246 Light-Years)
      // Propulsion Engine: Tier 5 Alcubierre Warp Drive
      // Warp Factor: 10
      const distance = 4.246 * LY_IN_METERS;
      const warpFactor = 10;
      const mass = 100000;

      const result = KinematicsEngine.calculateWarp(distance, warpFactor, mass);

      const expectedTimeYears = 4.246 / 10; // distance / (10c)

      const actualProperYears = result.properTime / SECONDS_IN_YEAR;
      const actualCoordinateYears = result.coordinateTime / SECONDS_IN_YEAR;

      expect(actualProperYears).toBeCloseTo(expectedTimeYears, 4);
      expect(actualCoordinateYears).toBeCloseTo(expectedTimeYears, 4);
      expect(result.lorentzFactor).toBe(1.0);
      expect(result.peakVelocity).toBe(SPEED_OF_LIGHT * 10);
    });
  });
});
