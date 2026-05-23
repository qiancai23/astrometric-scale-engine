import React, { useMemo } from 'react';
import { useFlightStore } from '../state/useFlightStore';

export const GlobalHeader: React.FC = () => {
  const driveCore = useFlightStore(state => state.driveCore);
  const sublightResult = useFlightStore(state => state.sublightResult);
  const warpResult = useFlightStore(state => state.warpResult);
  
  const result = driveCore === 'Sublight' ? sublightResult : warpResult;
  const lorentz = driveCore === 'Sublight' 
    ? (result?.peakVelocity ? 1 / Math.sqrt(1 - Math.pow(result.peakVelocity / 299792458, 2)) : 1) 
    : 1;

  const originDate = new Date('2026-05-23T00:00:00Z');
  
  const coordinateArrival = useMemo(() => {
    if (!result?.coordinateTime) return originDate;
    const d = new Date(originDate.getTime());
    // JS Date handles large seconds gracefully
    d.setUTCSeconds(d.getUTCSeconds() + result.coordinateTime);
    return d;
  }, [result?.coordinateTime]);

  const properArrival = useMemo(() => {
    if (!result?.properTime) return originDate;
    const d = new Date(originDate.getTime());
    d.setUTCSeconds(d.getUTCSeconds() + result.properTime);
    return d;
  }, [result?.properTime]);

  const formatDate = (date: Date) => {
    try {
      return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    } catch(e) {
      return "9999-12-31 23:59:59 UTC (Out of bounds)";
    }
  };

  return (
    <div className="dashboard-header">
      <div className="header-block">
        <div className="header-label">Departure (Origin)</div>
        <div className="header-value font-mono text-accent">{formatDate(originDate)}</div>
      </div>
      
      <div className="header-block header-block-center">
        <div className="header-label">Peak Lorentz Factor (\u03B3)</div>
        <div className="status-gauge">{lorentz.toFixed(8)}</div>
      </div>
      
      <div className="header-block header-block-right" style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '350px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '16px' }}>
          <div className="header-label" style={{ margin: 0 }}>Arrival (Earth Time):</div>
          <div className="header-value font-mono text-muted" style={{ fontSize: '0.9rem' }}>{formatDate(coordinateArrival)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '16px' }}>
          <div className="header-label" style={{ margin: 0 }}>Arrival (Ship Time):</div>
          <div className="header-value font-mono text-accent" style={{ fontSize: '0.9rem' }}>{formatDate(properArrival)}</div>
        </div>
      </div>
    </div>
  );
};
