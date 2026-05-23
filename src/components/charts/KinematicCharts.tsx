import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useFlightStore, GRAVITY } from '../../state/useFlightStore';
import { SPEED_OF_LIGHT } from '../../physics/kinematicsEngine';

const formatTime = (seconds: number) => {
  if (seconds === 0) return '0';
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(0)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(0)}h`;
  const days = hours / 24;
  if (days < 30) return `${days.toFixed(0)}d`;
  const months = days / 30;
  if (months < 12) return `${months.toFixed(0)}mo`;
  const years = days / 365.25;
  return `${years.toFixed(1)}y`;
};

const formatVelocity = (v: number) => {
  if (v === 0) return '0';
  const c = SPEED_OF_LIGHT;
  if (v >= 0.1 * c) {
    return `${(v / c).toFixed(2)}c`;
  }
  const kph = (v * 3600) / 1000;
  if (kph >= 1000000) {
    return `${(kph / 1000000).toFixed(1)}M`;
  } else if (kph >= 1000) {
    return `${(kph / 1000).toFixed(1)}k`;
  }
  return `${kph.toFixed(0)}`;
};

const formatDistance = (m: number) => {
  if (m === 0) return '0';
  const AU = 149597870700;
  const LY = 9460730472580800;
  if (m >= 0.1 * LY) return `${(m / LY).toFixed(2)}ly`;
  if (m >= 0.1 * AU) return `${(m / AU).toFixed(2)}au`;
  const km = m / 1000;
  if (km >= 1000000) return `${(km / 1000000).toFixed(1)}Mkm`;
  if (km >= 1000) return `${(km / 1000).toFixed(1)}kkm`;
  return `${km.toFixed(0)}km`;
};

const generateChartData = (
  distance: number,
  accelG: number,
  speedCapC: number,
  driveCore: 'Sublight' | 'Warp',
  warpFactor: number
) => {
  const points: { t: number; v: number; x: number }[] = [];
  const numPoints = 200; // higher resolution
  
  if (distance <= 0) return points;

  const c = SPEED_OF_LIGHT;

  if (driveCore === 'Warp') {
    const v = warpFactor * c;
    const totalTime = distance / v;
    for (let i = 0; i <= numPoints; i++) {
      const t = (i / numPoints) * totalTime;
      // Instantaneous jump
      points.push({
        t,
        v: (i === 0 || i === numPoints) ? 0 : v,
        x: t * v
      });
    }
  } else {
    // Sublight
    const a = accelG * GRAVITY;
    const vCap = Math.min(speedCapC, 0.99999999) * c;
    const gammaMax = 1 / Math.sqrt(1 - Math.pow(vCap / c, 2));
    const accelDist = (c * c / a) * (gammaMax - 1);
    
    let tAccel = 0;
    let tCoast = 0;
    
    if (accelDist >= distance / 2) {
      // Triangle
      const halfDist = distance / 2;
      const factor = 1 + (a * halfDist) / (c * c);
      tAccel = (c / a) * Math.sqrt(factor * factor - 1);
    } else {
      // Trapezoid
      tAccel = (vCap * gammaMax) / a;
      const coastDist = distance - 2 * accelDist;
      tCoast = coastDist / vCap;
    }
    
    const totalTime = 2 * tAccel + tCoast;
    
    for (let i = 0; i <= numPoints; i++) {
      const t = (i / numPoints) * totalTime;
      let v = 0;
      let x = 0;
      
      if (t <= tAccel) {
        v = (c * a * t) / Math.sqrt(c * c + a * a * t * t);
        x = (c * c / a) * (Math.sqrt(1 + Math.pow(a * t / c, 2)) - 1);
      } else if (t <= tAccel + tCoast) {
        v = vCap;
        const coastT = t - tAccel;
        x = accelDist + vCap * coastT;
      } else {
        const decelT = totalTime - t;
        v = (c * a * decelT) / Math.sqrt(c * c + a * a * decelT * decelT);
        const decelX = (c * c / a) * (Math.sqrt(1 + Math.pow(a * decelT / c, 2)) - 1);
        x = distance - decelX;
      }
      points.push({ t, v, x });
    }
  }
  return points;
};

export const KinematicCharts: React.FC = () => {
  const { driveCore, distanceMeters, accelerationG, speedCapC, warpFactor } = useFlightStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 200 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const data = useMemo(() => {
    return generateChartData(distanceMeters, accelerationG, speedCapC, driveCore, warpFactor);
  }, [distanceMeters, accelerationG, speedCapC, driveCore, warpFactor]);

  if (data.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
        [ Awaiting Navigation Target for Analytics ]
      </div>
    );
  }

  const { width, height } = size;
  const paddingX = 70;
  const paddingY = 25;
  
  const maxT = data[data.length - 1].t || 1;
  const maxV = Math.max(...data.map(d => d.v)) || 1;
  const maxX = distanceMeters || 1;

  const scaleX = (t: number) => paddingX + (t / maxT) * (width - 2 * paddingX);
  const scaleV = (v: number) => height - paddingY - (v / maxV) * (height - 2 * paddingY);
  const scalePos = (x: number) => height - paddingY - (x / maxX) * (height - 2 * paddingY);

  const xTicks = [0, maxT * 0.25, maxT * 0.5, maxT * 0.75, maxT];
  const yTicks = [0, maxV * 0.25, maxV * 0.5, maxV * 0.75, maxV];
  const distTicks = [0, maxX * 0.25, maxX * 0.5, maxX * 0.75, maxX];

  const vPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(d.t)},${scaleV(d.v)}`).join(' ');
  const xPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(d.t)},${scalePos(d.x)}`).join(' ');

  const flipX = scaleX(maxT / 2);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Grid lines */}
        <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="var(--color-border)" strokeWidth="1" />
        <line x1={paddingX} y1={paddingY} x2={paddingX} y2={height - paddingY} stroke="var(--color-border)" strokeWidth="1" />
        <line x1={width - paddingX} y1={paddingY} x2={width - paddingX} y2={height - paddingY} stroke="var(--color-border)" strokeWidth="1" />
        
        {/* Dynamic Ticks */}
        {xTicks.map((t, i) => (
          <text key={`x-${i}`} x={scaleX(t)} y={height - paddingY + 12} fill="var(--color-text-muted)" fontSize="9" textAnchor="middle" className="font-mono">
            {formatTime(t)}
          </text>
        ))}
        {yTicks.map((v, i) => (
          <text key={`y-${i}`} x={paddingX - 8} y={scaleV(v) + 3} fill="var(--color-text-muted)" fontSize="9" textAnchor="end" className="font-mono">
            {formatVelocity(v)}
          </text>
        ))}
        {distTicks.map((xVal, i) => (
          <text key={`dist-${i}`} x={width - paddingX + 8} y={scalePos(xVal) + 3} fill="var(--color-text-secondary)" fontSize="9" textAnchor="start" className="font-mono">
            {formatDistance(xVal)}
          </text>
        ))}
        
        {/* Flip & Decel Line (Sublight only) */}
        {driveCore === 'Sublight' && (
          <line 
            x1={flipX} y1={paddingY} 
            x2={flipX} y2={height - paddingY} 
            stroke="var(--color-text-muted)" 
            strokeDasharray="4 4" 
            strokeWidth="1"
            opacity={0.6} 
          />
        )}
        
        {/* Midpoint Label */}
        {driveCore === 'Sublight' && (
          <text x={flipX} y={paddingY - 5} fill="var(--color-text-muted)" fontSize="10" textAnchor="middle" className="font-mono">Midpoint Flip</text>
        )}

        {/* Paths */}
        <path d={xPath} fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" opacity={0.4} />
        <path d={vPath} fill="none" stroke="var(--color-accent-active)" strokeWidth="3" />
        
        {/* Labels */}
        <text x={width - paddingX} y={paddingY + 10} fill="var(--color-text-secondary)" fontSize="11" textAnchor="end" className="font-mono">Position (S-Curve)</text>
        <text x={paddingX + 10} y={paddingY + 10} fill="var(--color-accent-active)" fontSize="11" className="font-mono">Velocity Profile</text>
        
        {/* Axes Labels */}
        <text x={width / 2} y={height - 2} fill="var(--color-text-muted)" fontSize="10" textAnchor="middle" className="font-mono">Time</text>
        <text x={12} y={height / 2} fill="var(--color-text-muted)" fontSize="10" textAnchor="middle" transform={`rotate(-90, 12, ${height / 2})`} className="font-mono">Speed (kph/c)</text>
        <text x={width - 12} y={height / 2} fill="var(--color-text-secondary)" fontSize="10" textAnchor="middle" transform={`rotate(90, ${width - 12}, ${height / 2})`} className="font-mono">Distance</text>
      </svg>
    </div>
  );
};
