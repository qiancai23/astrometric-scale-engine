import React from 'react';
import { useFlightStore } from '../../state/useFlightStore';
import {
  C_TO_KMS,
  accelFeel,
  accelToSlider,
  dvToSlider,
  getEngine,
  massToSlider,
  shipClass,
  sliderToAccel,
  sliderToDv,
  sliderToMass,
  sliderToSpeed,
  speedToSlider,
} from '../../data/engines';
import type { SublightEngine, WarpEngine } from '../../data/engines';
import { formatAccel, formatDeltaV, formatBeta, formatCount, formatMass, formatSpeed, formatWarpFactor } from '../../lib/format';

interface SliderRowProps {
  id: string;
  label: string;
  readout: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** 0..1 for the filled part of the track. */
  fill: number;
  onChange: (value: number) => void;
  children?: React.ReactNode;
}

const SliderRow: React.FC<SliderRowProps> = ({ id, label, readout, min, max, step, value, fill, onChange, children }) => (
  <div className="plan-slider">
    <div className="plan-slider-head">
      <label htmlFor={id} className="plan-slider-label">{label}</label>
      <span className="plan-slider-readout num">{readout}</span>
    </div>
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-valuetext={readout}
      style={{ '--fill': `${Math.min(Math.max(fill, 0), 1) * 100}%` } as React.CSSProperties}
      onChange={(ev) => onChange(Number(ev.target.value))}
    />
    {children}
  </div>
);

const NINES = [0.9, 0.99, 0.999];

const SublightSliders: React.FC<{ engine: SublightEngine }> = ({ engine }) => {
  const accelerationG = useFlightStore((s) => s.accelerationG);
  const speedCapC = useFlightStore((s) => s.speedCapC);
  const deltaVKms = useFlightStore((s) => s.deltaVKms);
  const profile = useFlightStore((s) => s.profile);
  const planModel = useFlightStore((s) => s.plan?.model ?? null);
  const setShipParams = useFlightStore((s) => s.setShipParams);

  // Orbit-following flights (a chemical rocket round the Sun or Earth-Moon, the ion drive's spiral)
  // are limited by fuel, not by a speed limit, so the controls differ from the straight-line case.
  const rocket = !!engine.orbital && (planModel === 'ballistic' || planModel === 'lunar');
  const spiral = !!engine.orbital && planModel === 'spiral';
  const orbitFollowing = rocket || spiral;
  const showAccel = !rocket;
  const showSpeed = !orbitFollowing;
  const dvPos = engine.orbital ? dvToSlider(engine, deltaVKms) : 0;

  const accelPos = accelToSlider(engine, accelerationG);
  const speedPos = speedToSlider(engine, speedCapC);
  const speedReadout = engine.speedInKms ? `${formatCount(speedCapC * C_TO_KMS)} km/s` : `${formatBeta(speedCapC)} c`;
  const tooShort = !orbitFollowing && profile && !profile.hasCoast;

  return (
    <>
      {showAccel && (
      <SliderRow
        id={`plan-accel-${engine.id}`}
        label="Acceleration"
        readout={`${formatAccel(accelerationG)} · ${accelFeel(accelerationG)}`}
        min={0}
        max={1}
        step={0.001}
        value={accelPos}
        fill={accelPos}
        onChange={(p) => setShipParams({ accelerationG: sliderToAccel(engine, p) })}
      >
        {spiral && (
          <p className="plan-note">The engine pushes the whole way: halving the thrust doubles the trip.</p>
        )}
      </SliderRow>
      )}
      {showSpeed && (
      <SliderRow
        id={`plan-speed-${engine.id}`}
        label="Speed limit"
        readout={speedReadout}
        min={0}
        max={1}
        step={0.001}
        value={speedPos}
        fill={speedPos}
        onChange={(p) => setShipParams({ speedCapC: sliderToSpeed(engine, p) })}
      >
        {engine.speedScale === 'nines' && (
          <div className="plan-ticks" aria-hidden="true">
            {NINES.filter((c) => c >= engine.minC && c <= engine.maxC).map((c) => (
              <span
                key={c}
                className="plan-tick num"
                style={{ left: `calc(9px + (100% - 18px) * ${speedToSlider(engine, c)})` }}
              >
                {c}
              </span>
            ))}
          </div>
        )}
        {tooShort && (
          <p className="plan-note">
            This trip is too short to reach the limit: the ship flips at {formatSpeed(profile.peakVelocity)}.
          </p>
        )}
      </SliderRow>
      )}
      {orbitFollowing && engine.orbital && (
        <SliderRow
          id={`plan-dv-${engine.id}`}
          label="Fuel budget"
          readout={formatDeltaV(deltaVKms)}
          min={0}
          max={1}
          step={0.001}
          value={dvPos}
          fill={dvPos}
          onChange={(p) => setShipParams({ deltaVKms: sliderToDv(engine, p) })}
        >
          <p className="plan-note">
            The total change of speed the {rocket ? 'rocket' : 'engine'} can make, counted from a low orbit round the starting body.
          </p>
        </SliderRow>
      )}
    </>
  );
};

const WarpSliders: React.FC<{ engine: WarpEngine }> = ({ engine }) => {
  const warpFactor = useFlightStore((s) => s.warpFactor);
  const setShipParams = useFlightStore((s) => s.setShipParams);
  return (
    <SliderRow
      id="plan-warp-factor"
      label="Warp factor"
      readout={formatWarpFactor(warpFactor)}
      min={engine.minFactor}
      max={engine.maxFactor}
      step={0.1}
      value={warpFactor}
      fill={(warpFactor - engine.minFactor) / (engine.maxFactor - engine.minFactor)}
      onChange={(v) => setShipParams({ warpFactor: v })}
    />
  );
};

export const TuneSliders: React.FC = () => {
  const engineId = useFlightStore((s) => s.engineId);
  const mass = useFlightStore((s) => s.mass);
  const setShipParams = useFlightStore((s) => s.setShipParams);
  const engine = getEngine(engineId);
  const massPos = massToSlider(mass);

  const reset = () => {
    if (engine.drive === 'Warp') setShipParams({ warpFactor: engine.defaultFactor });
    else {
      setShipParams({
        accelerationG: engine.defaultG,
        speedCapC: engine.defaultC,
        ...(engine.orbital ? { deltaVKms: engine.orbital.defaultDv } : {}),
      });
    }
  };

  return (
    <section className="plan-section" aria-label="Tuning">
      <div className="plan-head">
        <h3 className="micro-label plan-swap-in" key={engine.id}>Tune the {engine.label}</h3>
        <button type="button" className="plan-reset" onClick={reset}>Reset</button>
      </div>

      <div className="plan-sliders" key={engine.id}>
        {engine.drive === 'Warp' ? <WarpSliders engine={engine} /> : <SublightSliders engine={engine} />}
      </div>

      <div className="plan-sliders">
        <SliderRow
          id="plan-mass"
          label="Ship mass"
          readout={`${formatMass(mass)} · ${shipClass(mass)}`}
          min={0}
          max={1}
          step={0.001}
          value={massPos}
          fill={massPos}
          onChange={(p) => setShipParams({ mass: sliderToMass(p) })}
        >
          <p className="plan-note">Mass changes the energy needed, not the travel time.</p>
        </SliderRow>
      </div>
    </section>
  );
};
