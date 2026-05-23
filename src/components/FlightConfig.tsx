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
        accelerationG: Math.min(accelerationG, limits.maxG),
        speedCapC: Math.min(speedCapC, limits.maxC)
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

      <div className="config-section">
        <h3>Kinematic Configuration</h3>
        
        {engineTier !== 'Warp' ? (
          <>
            <div className="form-group">
              <label>
                Acceleration Profile 
                <span className="text-accent">{accelerationG.toFixed(2)} G</span>
              </label>
              <input 
                type="range" 
                min="0.01" 
                max={sublightTiers[engineTier as keyof typeof sublightTiers].maxG} 
                step="0.01" 
                value={accelerationG} 
                onChange={e => setShipParams({ accelerationG: parseFloat(e.target.value) })}
              />
            </div>
            
            <div className="form-group">
              <label>
                Velocity Ceiling 
                <span className="text-accent">{speedCapC.toFixed(4)} c</span>
              </label>
              <input 
                type="range" 
                min="0.0001" 
                max={sublightTiers[engineTier as keyof typeof sublightTiers].maxC} 
                step="0.0001" 
                value={speedCapC} 
                onChange={e => setShipParams({ speedCapC: parseFloat(e.target.value) })}
              />
            </div>
          </>
        ) : (
          <div className="form-group">
            <label>
              Warp Factor 
              <span className="text-accent">{warpFactor.toFixed(1)}x</span>
            </label>
            <input 
              type="range" 
              min="1.0" 
              max="50.0" 
              step="0.1" 
              value={warpFactor} 
              onChange={e => setShipParams({ warpFactor: parseFloat(e.target.value) })}
            />
          </div>
        )}

        <div className="form-group">
          <label>
            Hull Structural Mass: <span className="text-accent">{(mass / 1000).toLocaleString()} tonnes</span>
          </label>
          <input 
            type="range" 
            min="25" 
            max="10000000" 
            step="25"
            value={mass / 1000} 
            onChange={e => setShipParams({ mass: parseFloat(e.target.value) * 1000 })} 
          />
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Class: <span style={{ color: 'var(--color-text)' }}>{
              (mass / 1000) <= 75 ? 'Scout' :
              (mass / 1000) <= 1000 ? 'Corvette' :
              (mass / 1000) <= 10000 ? 'Frigate' :
              (mass / 1000) <= 100000 ? 'Cruiser' :
              (mass / 1000) <= 1000000 ? 'Battleship' :
              (mass / 1000) < 10000000 ? 'Dreadnought' :
              'Generation Ship'
            }</span>
          </div>
        </div>
      </div>
    </div>
  );
};
