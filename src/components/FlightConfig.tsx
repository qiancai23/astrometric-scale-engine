import React, { useState, useEffect } from 'react';
import { useFlightStore, AstroObject, AstrometricRegime } from '../state/useFlightStore';

import systemicData from '../../scripts/systemic.json';
import starsData from '../../scripts/stars.json';

const sublightTiers = {
  Chemical: { maxG: 3.0, maxC: 0.0001 },
  Ion: { maxG: 0.1, maxC: 0.01 },
  Fusion: { maxG: 1.0, maxC: 0.20 },
  Antimatter: { maxG: 3.0, maxC: 0.99 },
};

type EngineTier = keyof typeof sublightTiers | 'Warp';

const SliderTicks = ({ labels }: { labels: { frac: number; label: string }[] }) => (
  <div style={{ position: 'relative', width: '100%', height: '20px', marginTop: '-6px', pointerEvents: 'none' }}>
    {labels.map((l, i) => (
      <div key={i} style={{ position: 'absolute', left: `calc(${l.frac * 100}% + ${8 - l.frac * 16}px)`, transform: 'translateX(-50%)', fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontSize: '0.5rem' }}>|</span>
        <span style={{ marginTop: '-4px' }}>{l.label}</span>
      </div>
    ))}
  </div>
);

export const FlightConfig: React.FC = () => {
  const {
    regime, setRegime,
    setDriveCore,
    origin, setOrigin,
    destination, setDestination,
    mass, accelerationG, speedCapC, warpFactor, setShipParams
  } = useFlightStore();

  const [engineTier, setEngineTier] = useState<EngineTier>('Fusion');
  const [originFilter, setOriginFilter] = useState('');
  const [destinationFilter, setDestinationFilter] = useState('');
  const [originCategory, setOriginCategory] = useState('All');
  const [destinationCategory, setDestinationCategory] = useState('All');

  const categories = ['All', 'HYG Database', 'Messier Catalog', 'NASA Exoplanet Archive', 'Static Astrometric Anchors'];

  const activeCatalog: AstroObject[] = regime === 'Systemic' 
    ? systemicData as AstroObject[] 
    : starsData as AstroObject[];

  useEffect(() => {
    if (engineTier === 'Warp') {
      setDriveCore('Warp');
    } else {
      setDriveCore('Sublight');
      const limits = sublightTiers[engineTier];
      setShipParams({
        accelerationG: Math.min(Math.max(accelerationG, 0.01), limits.maxG),
        speedCapC: Math.min(Math.max(speedCapC, limits.maxC / 10), limits.maxC)
      });
    }
  }, [engineTier]);

  const renderOptions = (filterStr: string, categoryStr: string) => {
    let filteredCatalog = activeCatalog;
    
    if (regime === 'Interstellar' && categoryStr !== 'All') {
      filteredCatalog = filteredCatalog.filter(obj => obj.catalog_origin === categoryStr);
    }

    if (filterStr) {
      const lowerFilter = filterStr.toLowerCase();
      filteredCatalog = activeCatalog.filter(obj => 
        obj.name.toLowerCase().includes(lowerFilter) ||
        (obj.catalog_origin && obj.catalog_origin.toLowerCase().includes(lowerFilter)) ||
        (obj.display_metrics?.constellation && obj.display_metrics.constellation.toLowerCase().includes(lowerFilter))
      );
    }

    if (regime === 'Systemic') {
      return filteredCatalog.map(obj => (
        <option key={obj.id} value={obj.id}>{obj.name} ({obj.type})</option>
      ));
    } else {
      const groups: Record<string, AstroObject[]> = {};
      filteredCatalog.forEach(obj => {
        const originName = obj.catalog_origin || 'Other';
        if (!groups[originName]) groups[originName] = [];
        groups[originName].push(obj);
      });
      return Object.entries(groups).map(([originName, objs]) => (
        <optgroup key={originName} label={originName}>
          {objs.map(obj => (
            <option key={obj.id} value={obj.id}>{obj.name}</option>
          ))}
        </optgroup>
      ));
    }
  };

  const renderReadout = (node: AstroObject | null) => {
    if (!node || !node.display_metrics?.scale_narrative) return null;
    return (
      <div style={{ marginTop: '8px', fontSize: '0.8rem', padding: '8px', background: 'rgba(0,0,0,0.3)', borderLeft: '2px solid var(--color-accent)' }}>
        <div style={{ marginBottom: '4px' }}>
          <strong>{node.display_metrics.true_distance_ly?.toLocaleString()} ly</strong> 
          {node.display_metrics.constellation && ` | ${node.display_metrics.constellation} Constellation`}
        </div>
        <div style={{ color: 'var(--color-text-muted)' }}>{node.display_metrics.scale_narrative}</div>
      </div>
    );
  };


  return (
    <div className="config-container">
      <div className="config-section">
        <h3>Target Coordinates</h3>
        <div className="form-group">
          <label>Astrometric Regime</label>
          <select 
            value={regime} 
            onChange={e => setRegime(e.target.value as AstrometricRegime)}
          >
            <option value="Systemic">Systemic (Local / AU)</option>
            <option value="Interstellar">Interstellar (Deep Space / PC)</option>
          </select>
        </div>
        
        <div className="form-group">
          <label>Origin Node</label>
          {regime === 'Interstellar' && (
            <select
              value={originCategory}
              onChange={e => setOriginCategory(e.target.value)}
            >
              {categories.map(c => <option key={c} value={c}>{c === 'All' ? '-- All Categories --' : c}</option>)}
            </select>
          )}
          <input 
            type="text" 
            placeholder="Search by name or constellation..." 
            value={originFilter}
            onChange={e => setOriginFilter(e.target.value)}
            style={{ marginBottom: '4px', boxSizing: 'border-box' }}
          />
          <select 
            value={origin?.id || ''} 
            onChange={e => {
              const obj = activeCatalog.find(o => o.id === e.target.value) || null;
              setOrigin(obj);
            }}
          >
            <option value="">-- Select Origin --</option>
            {renderOptions(originFilter, originCategory)}
          </select>
          {renderReadout(origin)}
        </div>

        <div className="form-group">
          <label>Destination Node</label>
          {regime === 'Interstellar' && (
            <select
              value={destinationCategory}
              onChange={e => setDestinationCategory(e.target.value)}
            >
              {categories.map(c => <option key={c} value={c}>{c === 'All' ? '-- All Categories --' : c}</option>)}
            </select>
          )}
          <input 
            type="text" 
            placeholder="Search by name or constellation..." 
            value={destinationFilter}
            onChange={e => setDestinationFilter(e.target.value)}
            style={{ marginBottom: '4px', boxSizing: 'border-box' }}
          />
          <select 
            value={destination?.id || ''} 
            onChange={e => {
              const obj = activeCatalog.find(o => o.id === e.target.value) || null;
              setDestination(obj);
            }}
          >
            <option value="">-- Select Destination --</option>
            {renderOptions(destinationFilter, destinationCategory)}
          </select>
          {renderReadout(destination)}
        </div>
      </div>

      <div className="config-section">
        <h3>Propulsion System</h3>
        <div className="form-group">
          <label>Engine Core Tier</label>
          <select value={engineTier} onChange={e => setEngineTier(e.target.value as EngineTier)}>
            <option value="Chemical">Tier 1: Chemical Rocket</option>
            <option value="Ion">Tier 2: Ion / Plasma Core</option>
            <option value="Fusion">Tier 3: Fusion Tokamak Core</option>
            <option value="Antimatter">Tier 4: Antimatter Rocket</option>
            <option value="Warp">Tier 5: Alcubierre Warp Metric</option>
          </select>
        </div>
      </div>

      <div className="config-section" style={{ marginTop: '2rem' }}>
        <h3>Kinematic Configuration</h3>
        
        {engineTier !== 'Warp' ? (
          <>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label>Acceleration Profile</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input 
                    type="number" 
                    min="0.01" 
                    max={sublightTiers[engineTier as keyof typeof sublightTiers].maxG} 
                    step="0.01" 
                    value={accelerationG.toFixed(2)} 
                    onChange={e => setShipParams({ accelerationG: Math.min(Math.max(parseFloat(e.target.value) || 0.01, 0.01), sublightTiers[engineTier as keyof typeof sublightTiers].maxG) })}
                    style={{ width: '70px', padding: '2px', textAlign: 'right', background: 'var(--color-bg)', color: 'var(--color-accent)', border: '1px solid var(--color-border)', borderRadius: '3px' }}
                  />
                  <span className="text-accent" style={{ fontSize: '0.9rem' }}>G</span>
                </div>
              </div>
              <input 
                type="range" 
                min="0.01" 
                max={sublightTiers[engineTier as keyof typeof sublightTiers].maxG} 
                step="0.01" 
                value={accelerationG} 
                onChange={e => setShipParams({ accelerationG: parseFloat(e.target.value) })}
                style={{ marginTop: '8px', marginBottom: '16px' }}
              />
              <SliderTicks labels={[
                { frac: 0, label: '0.01' },
                { frac: 0.5, label: (sublightTiers[engineTier as keyof typeof sublightTiers].maxG / 2).toFixed(1) },
                { frac: 1, label: sublightTiers[engineTier as keyof typeof sublightTiers].maxG.toFixed(1) }
              ]} />
            </div>
            
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label>Velocity Ceiling</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {(() => {
                    const maxC = sublightTiers[engineTier as keyof typeof sublightTiers].maxC;
                    const minC = maxC / 10;
                    const stepC = maxC / 100;
                    const displayKph = maxC < 0.1;
                    const cToKph = 1079252848.8;
                    return (
                      <>
                        <input 
                          type="number" 
                          min={displayKph ? minC * cToKph : minC} 
                          max={displayKph ? maxC * cToKph : maxC} 
                          step={displayKph ? stepC * cToKph : stepC} 
                          value={displayKph ? Math.round(speedCapC * cToKph) : speedCapC.toFixed(4)} 
                          onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setShipParams({ speedCapC: Math.min(Math.max(displayKph ? val / cToKph : val, minC), maxC) });
                          }}
                          style={{ width: '100px', padding: '2px', textAlign: 'right', background: 'var(--color-bg)', color: 'var(--color-accent)', border: '1px solid var(--color-border)', borderRadius: '3px' }}
                        />
                        <span className="text-accent" style={{ fontSize: '0.9rem' }}>{displayKph ? 'kph' : 'c'}</span>
                      </>
                    );
                  })()}
                </div>
              </div>
              <input 
                type="range" 
                min={sublightTiers[engineTier as keyof typeof sublightTiers].maxC / 10} 
                max={sublightTiers[engineTier as keyof typeof sublightTiers].maxC} 
                step={sublightTiers[engineTier as keyof typeof sublightTiers].maxC / 100} 
                value={speedCapC} 
                onChange={e => setShipParams({ speedCapC: parseFloat(e.target.value) })}
                style={{ marginTop: '8px', marginBottom: '16px' }}
              />
              {(() => {
                const maxC = sublightTiers[engineTier as keyof typeof sublightTiers].maxC;
                const minC = maxC / 10;
                const displayKph = maxC < 0.1;
                const cToKph = 1079252848.8;
                const formatLabel = (valC: number) => {
                  if (displayKph) {
                    const kph = valC * cToKph;
                    return kph >= 1000000 ? `${(kph / 1000000).toFixed(1)}M` : `${Math.round(kph / 1000)}k`;
                  }
                  return `${valC}c`;
                };
                return (
                  <SliderTicks labels={[
                    { frac: 0, label: formatLabel(minC) },
                    { frac: 0.5, label: formatLabel(minC + (maxC - minC) / 2) },
                    { frac: 1, label: formatLabel(maxC) }
                  ]} />
                );
              })()}
            </div>
          </>
        ) : (
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label>Warp Factor</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input 
                  type="number" 
                  min="1.0" 
                  max="50.0" 
                  step="0.1" 
                  value={warpFactor.toFixed(1)} 
                  onChange={e => setShipParams({ warpFactor: Math.min(Math.max(parseFloat(e.target.value) || 1.0, 1.0), 50.0) })}
                  style={{ width: '70px', padding: '2px', textAlign: 'right', background: 'var(--color-bg)', color: 'var(--color-accent)', border: '1px solid var(--color-border)', borderRadius: '3px' }}
                />
                <span className="text-accent" style={{ fontSize: '0.9rem' }}>x</span>
              </div>
            </div>
            <input 
              type="range" 
              min="1.0" 
              max="50.0" 
              step="0.1" 
              value={warpFactor} 
              onChange={e => setShipParams({ warpFactor: parseFloat(e.target.value) })}
              style={{ marginTop: '8px', marginBottom: '16px' }}
            />
            <SliderTicks labels={[
              { frac: 0, label: '1' },
              { frac: 0.25, label: '13' },
              { frac: 0.5, label: '25' },
              { frac: 0.75, label: '38' },
              { frac: 1, label: '50' }
            ]} />
          </div>
        )}

        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label>Hull Structural Mass</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input 
                type="number"
                min="25"
                max="50000000"
                value={Math.round(mass / 1000)}
                onChange={e => setShipParams({ mass: Math.min(Math.max(25, parseFloat(e.target.value) || 25), 50000000) * 1000 })}
                style={{ width: '100px', padding: '2px', textAlign: 'right', background: 'var(--color-bg)', color: 'var(--color-accent)', border: '1px solid var(--color-border)', borderRadius: '3px' }}
              />
              <span className="text-accent" style={{ fontSize: '0.9rem' }}>tonnes</span>
            </div>
          </div>
          <input 
            type="range" 
            min={Math.log10(25)} 
            max={Math.log10(50000000)} 
            step="0.01"
            value={Math.log10(Math.max(25, mass / 1000))} 
            onChange={e => setShipParams({ mass: Math.pow(10, parseFloat(e.target.value)) * 1000 })}
            style={{ marginTop: '8px', marginBottom: '16px' }}
          />
          <SliderTicks labels={[
            { frac: 0, label: '25t' },
            { frac: 0.33, label: '10kt' },
            { frac: 0.66, label: '1Mt' },
            { frac: 1, label: '50Mt' }
          ]} />
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '12px' }}>
            Class: <span style={{ color: 'var(--color-text)' }}>{
              (mass / 1000) <= 75 ? 'Scout' :
              (mass / 1000) <= 5000 ? 'Corvette' :
              (mass / 1000) <= 10000 ? 'Frigate' :
              (mass / 1000) <= 100000 ? 'Cruiser' :
              (mass / 1000) <= 1000000 ? 'Carrier' :
              (mass / 1000) <= 5000000 ? 'Battleship' :
              (mass / 1000) <= 10000000 ? 'Dreadnought' :
              'Generation Ship'
            }</span>
          </div>
        </div>
      </div>
    </div>
  );
};
