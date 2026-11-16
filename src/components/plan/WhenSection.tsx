import React from 'react';
import { useFlightStore } from '../../state/useFlightStore';
import { MAX_DAY, MIN_DAY, dayFromIso, isoFromDay, todayDay } from '../../physics/ephemeris';
import { formatDate, formatDeltaV, formatDuration } from '../../lib/format';
import { RollingValue } from '../common/RollingValue';
import { ChevronIcon } from './icons';

const MONTH_DAYS = 30;
const clampDay = (d: number) => Math.min(MAX_DAY, Math.max(MIN_DAY, d));

/** Rolls a day number as a date text. */
const DateValue: React.FC<{ day: number }> = ({ day }) => (
  <RollingValue value={day} format={(d) => formatDate(Math.round(d))} className="num" />
);

/** Fuel meter: how much of the budget the flight needs (full and red-ish when it does not fit). */
const FuelMeter: React.FC<{ needed: number; budget: number; ok: boolean }> = ({ needed, budget, ok }) => {
  const share = budget > 0 ? Math.min(needed / budget, 1) : 1;
  return (
    <span
      className={'plan-meter' + (ok ? '' : ' is-over')}
      role="meter"
      aria-label="Fuel needed against fuel budget"
      aria-valuemin={0}
      aria-valuemax={budget}
      aria-valuenow={Math.min(needed, budget)}
      aria-valuetext={`${formatDeltaV(needed)} of ${formatDeltaV(budget)}`}
    >
      <span className="plan-meter-fill" style={{ width: `${share * 100}%` }} />
    </span>
  );
};

/** "When": launch date, the planner's answer for it, and what to do at the destination. */
export const WhenSection: React.FC = () => {
  const regime = useFlightStore((s) => s.regime);
  const plan = useFlightStore((s) => s.plan);
  const departureDay = useFlightStore((s) => s.departureDay);
  const arrivalMode = useFlightStore((s) => s.arrivalMode);
  const setDepartureDay = useFlightStore((s) => s.setDepartureDay);
  const setArrivalMode = useFlightStore((s) => s.setArrivalMode);
  const clearPin = useFlightStore((s) => s.clearPin);

  if (regime !== 'Systemic' || !plan) return null;

  const onDate = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const day = dayFromIso(ev.target.value);
    if (day !== null) setDepartureDay(clampDay(day));
  };
  const step = (delta: number) => setDepartureDay(clampDay(departureDay + delta));

  const hasBudget = plan.model !== 'direct' && plan.dvNeededKms !== null && plan.dvBudgetKms !== null;
  const waits = plan.waitDays >= 1;
  const waitReason = plan.model === 'spiral' ? 'for the planets to line up' : 'for a launch window';
  const split = (plan.model === 'ballistic' || plan.model === 'lunar') && plan.dvDepartKms !== null && plan.dvArriveKms !== null;

  return (
    <section className="plan-section" aria-label="When">
      <div className="plan-head">
        <h3 className="micro-label">When</h3>
      </div>

      <div className="plan-when-date">
        <label htmlFor="plan-departure" className="plan-slider-label">Leave on or after</label>
        <div className="plan-when-row">
          <button type="button" className="plan-step" aria-label="Back one month" onClick={() => step(-MONTH_DAYS)}>
            <ChevronIcon dir="left" />
          </button>
          <input
            id="plan-departure"
            type="date"
            className="plan-date"
            value={isoFromDay(departureDay)}
            min={isoFromDay(MIN_DAY)}
            max={isoFromDay(MAX_DAY)}
            onChange={onDate}
          />
          <button type="button" className="plan-step" aria-label="Forward one month" onClick={() => step(MONTH_DAYS)}>
            <ChevronIcon dir="right" />
          </button>
          <button type="button" className="plan-chip plan-today" onClick={() => setDepartureDay(clampDay(todayDay()))}>
            Today
          </button>
        </div>
      </div>

      <dl className="plan-facts">
        <div className="plan-fact">
          <dt>Launch</dt>
          <dd><DateValue day={plan.launchDay} /></dd>
        </div>
        <div className="plan-fact">
          <dt>Arrive</dt>
          <dd><DateValue day={plan.arrivalDay} /></dd>
        </div>
      </dl>
      {waits && (
        <p className="plan-note">
          Waits <RollingValue value={plan.waitDays * 86400} format={(v) => formatDuration(v)} log /> {waitReason}.
        </p>
      )}
      {plan.model === 'ballistic' && waits && plan.dvOnRequestedDayKms !== null && (
        <p className="plan-note">
          Leaving on {formatDate(departureDay)} itself would need at least{' '}
          <RollingValue value={plan.dvOnRequestedDayKms} format={formatDeltaV} className="num" />.
        </p>
      )}

      {hasBudget && (
        <div className="plan-fuel">
          <p className="plan-fuel-line">
            Needs <RollingValue value={plan.dvNeededKms as number} format={formatDeltaV} className="num" /> of your{' '}
            <RollingValue value={plan.dvBudgetKms as number} format={formatDeltaV} className="num" />
          </p>
          <FuelMeter needed={plan.dvNeededKms as number} budget={plan.dvBudgetKms as number} ok={plan.feasible} />
          {split && (
            <p className="plan-note">
              Leaving burn {formatDeltaV(plan.dvDepartKms as number)}, arriving burn {formatDeltaV(plan.dvArriveKms as number)}.
            </p>
          )}
        </div>
      )}

      {!plan.feasible && hasBudget && (
        <p className="plan-warn" role="status">
          This flight needs {formatDeltaV(plan.dvNeededKms as number)} but the engine has {formatDeltaV(plan.dvBudgetKms as number)}.
          {plan.pinned ? ' ' : ' This is the cheapest launch found. '}Raise the fuel budget
          {plan.arrivalMode === 'orbit' ? ', or try Fly past' : ''}.
        </p>
      )}

      {plan.pinned && (
        <div className="plan-pinned">
          <p className="plan-note">This exact flight was picked on the launch-window chart.</p>
          <button type="button" className="plan-chip" onClick={clearPin}>Soonest arrival instead</button>
        </div>
      )}

      {plan.arrivalMode !== null && (
        <div className="plan-arrival">
          <span className="plan-slider-label" id="plan-arrival-label">At the destination</span>
          <div className="plan-seg" role="group" aria-labelledby="plan-arrival-label">
            <button type="button" className="plan-seg-btn" aria-pressed={arrivalMode === 'orbit'} onClick={() => setArrivalMode('orbit')}>
              Enter orbit
            </button>
            <button type="button" className="plan-seg-btn" aria-pressed={arrivalMode === 'flyby'} onClick={() => setArrivalMode('flyby')}>
              Fly past
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
