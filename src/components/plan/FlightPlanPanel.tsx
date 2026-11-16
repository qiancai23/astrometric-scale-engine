import React from 'react';
import type { PanelProps } from '../panelProps';
import { TargetPickers } from './TargetPicker';
import { EngineCards } from './EngineCards';
import { TuneSliders } from './TuneSliders';
import '../../styles/plan.css';

const at = (i: number) => ({ '--i': i }) as React.CSSProperties;

/** Flight plan: pick from / to, pick an engine, tune it. */
export const FlightPlanPanel: React.FC<PanelProps> = ({ compact }) => (
  <div className={'plan-root' + (compact ? ' is-compact' : '')}>
    <h2 className="micro-label enter" style={at(0)}>Flight plan</h2>
    <div className="enter" style={at(1)}>
      <TargetPickers />
    </div>
    <div className="enter" style={at(2)}>
      <EngineCards compact={compact} />
    </div>
    <div className="enter" style={at(3)}>
      <TuneSliders />
    </div>
  </div>
);
