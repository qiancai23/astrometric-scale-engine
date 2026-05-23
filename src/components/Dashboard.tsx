import React, { useEffect } from 'react';
import { GlobalHeader } from './GlobalHeader';
import { FlightConfig } from './FlightConfig';
import { TelemetryHUD } from './TelemetryHUD';
import { KinematicCharts } from './charts/KinematicCharts';
import { SceneGraph } from './visualizer/SceneGraph';
import { useFlightStore } from '../state/useFlightStore';

export const Dashboard: React.FC = () => {
  const driveCore = useFlightStore(state => state.driveCore);

  useEffect(() => {
    document.documentElement.setAttribute('data-drive', driveCore);
  }, [driveCore]);

  return (
    <div className="dashboard-container">
      <GlobalHeader />
      <div className="dashboard-body">
        <div className="dashboard-panel panel-left">
          <FlightConfig />
        </div>
        <div className="panel-center">
          <div className="webgl-placeholder">
            <SceneGraph />
          </div>
          <div className="charts-placeholder">
            <KinematicCharts />
          </div>
        </div>
        <div className="dashboard-panel panel-right">
          <TelemetryHUD />
        </div>
      </div>
    </div>
  );
};
