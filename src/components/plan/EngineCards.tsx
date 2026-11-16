import React, { useEffect, useRef } from 'react';
import { useFlightStore } from '../../state/useFlightStore';
import { getEngine } from '../../data/engines';
import { formatDuration } from '../../lib/format';
import { prefersReducedMotion } from '../../lib/motion';
import { RollingValue } from '../common/RollingValue';

const NoTime = () => <span className="plan-card-time num">{'—'}</span>;

export const EngineCards: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const comparison = useFlightStore((s) => s.comparison);
  const engineId = useFlightStore((s) => s.engineId);
  const hasRoute = useFlightStore((s) => s.distanceMeters > 0);
  const setEngine = useFlightStore((s) => s.setEngine);
  const listRef = useRef<HTMLDivElement>(null);

  // In the compact row, scroll the selected chip to the middle.
  useEffect(() => {
    if (!compact) return;
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!list || !el) return;
    list.scrollTo({
      left: el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [compact, engineId]);

  const blurb = getEngine(engineId).blurb;

  return (
    <section className="plan-section" aria-label="Engine">
      <div className="plan-head">
        <h3 className="micro-label">Engine</h3>
        <span className="plan-quiet">time for this trip · log scale</span>
      </div>

      <div className={'plan-cards' + (compact ? ' is-compact' : '')} ref={listRef} role="group" aria-label="Engines">
        {comparison.map((row) => {
          const e = row.engine;
          const selected = e.id === engineId;
          const warp = e.id === 'warp';
          return (
            <button
              key={e.id}
              type="button"
              className={'plan-card' + (selected ? ' is-selected' : '') + (warp ? ' is-warp' : '')}
              aria-pressed={selected}
              onClick={() => setEngine(e.id)}
            >
              <span className="plan-card-row">
                <span className="plan-card-name plan-ellipsis">
                  {compact ? e.shortLabel : e.label}
                  {warp && !compact && <span className="plan-quiet"> · hypothetical</span>}
                </span>
                {hasRoute ? (
                  <RollingValue className="plan-card-time num" value={row.earthSeconds} format={formatDuration} log />
                ) : (
                  <NoTime />
                )}
              </span>
              <span className="plan-bar" aria-hidden="true">
                <span className="plan-bar-fill" style={{ width: `${hasRoute ? row.logFraction * 100 : 0}%` }} />
              </span>
              {selected && <span className="plan-sheen" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <p className="plan-blurb" key={engineId}>{blurb}</p>
    </section>
  );
};
