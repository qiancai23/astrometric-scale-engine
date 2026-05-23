import React from 'react';
import { useFlightStore, AU_TO_METERS, PARSEC_TO_METERS } from '../state/useFlightStore';

const formatDuration = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0.00 s';
  const y = Math.floor(seconds / 31557600);
  const d = Math.floor((seconds % 31557600) / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(2);
  
  if (y > 0) return `${y}y ${d}d ${h}h`;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatDistance = (meters: number) => {
  if (!meters || isNaN(meters)) return '0.00 km';
  if (meters >= PARSEC_TO_METERS * 0.1) {
    return `${(meters / PARSEC_TO_METERS).toFixed(4)} pc`;
  } else if (meters >= AU_TO_METERS * 0.1) {
    return `${(meters / AU_TO_METERS).toFixed(4)} AU`;
  } else {
    return `${(meters / 1000).toFixed(0)} km`;
  }
};

const formatVelocity = (mps: number) => {
  if (!mps || isNaN(mps)) return '0.00 km/s';
  const c = 299792458;
  if (mps >= c * 0.001) {
    return `${(mps / c).toFixed(6)} c`;
  }
  return `${(mps / 1000).toFixed(2)} km/s`;
};

export const TelemetryHUD: React.FC = () => {
  const driveCore = useFlightStore(state => state.driveCore);
  const sublightResult = useFlightStore(state => state.sublightResult);
  const warpResult = useFlightStore(state => state.warpResult);
  const distanceMeters = useFlightStore(state => state.distanceMeters);
  const mass = useFlightStore(state => state.mass);
  
  const result = driveCore === 'Sublight' ? sublightResult : warpResult;

  return (
    <div className="config-container">
      <div className="config-section">
        <h3>Chronological Delta</h3>
        <div className="telemetry-block font-mono">
          <div className="telemetry-row">
            <span className="text-muted">Earth Time</span>
            <span className="telemetry-value">{formatDuration(result?.coordinateTime || 0)}</span>
          </div>
          <div className="telemetry-row">
            <span className="text-muted">Ship Time</span>
            <span className="telemetry-value">{formatDuration(result?.properTime || 0)}</span>
          </div>
        </div>
      </div>

      <div className="config-section">
        <h3>Kinematic Readouts</h3>
        <div className="telemetry-block font-mono">
          <div className="telemetry-row">
            <span className="text-muted">Distance</span>
            <span className="telemetry-value text-secondary">{formatDistance(distanceMeters)}</span>
          </div>
          <div className="telemetry-row">
            <span className="text-muted">Peak Vel.</span>
            <span className="telemetry-value">{formatVelocity(result?.peakVelocity || 0)}</span>
          </div>
        </div>
      </div>

      <div className="config-section">
        <h3>Power & Logistics</h3>
        <div className="telemetry-block font-mono">
          <div className="telemetry-row">
            <span className="text-muted">Hull Mass</span>
            <span className="telemetry-value text-secondary">{(mass / 1000).toLocaleString()} t</span>
          </div>
          <div className="telemetry-row">
            <span className="text-muted">Energy</span>
            <span className="telemetry-value">{result?.energyExajoules?.toExponential(4) || '0.0000e+0'} EJ</span>
          </div>
        </div>
      </div>
    </div>
  );
};
