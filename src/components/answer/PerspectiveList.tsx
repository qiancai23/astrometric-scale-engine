import React from 'react';
import { usePulse } from '../../lib/motion';
import type { PerspectiveRow } from '../../lib/perspective';

const Row: React.FC<{ row: PerspectiveRow; index: number }> = ({ row, index }) => {
  const changed = usePulse(row.value);
  return (
    <li className="answer-persp-row enter" style={{ ['--i' as string]: index }}>
      <div className="answer-persp-main">
        <span className="answer-persp-label">{row.label}</span>
        <span className={`answer-persp-value num${changed ? ' is-flashing' : ''}`}>{row.value}</span>
      </div>
      {row.note && <div className="answer-persp-note">{row.note}</div>}
    </li>
  );
};

export const PerspectiveList: React.FC<{ rows: PerspectiveRow[]; startIndex: number }> = ({ rows, startIndex }) => (
  <section className="answer-persp enter" style={{ ['--i' as string]: startIndex }} aria-labelledby="answer-persp-heading">
    <div className="micro-label" id="answer-persp-heading">
      In perspective
    </div>
    <ul className="answer-persp-list">
      {rows.map((row, i) => (
        <Row key={row.id} row={row} index={startIndex + 1 + i} />
      ))}
    </ul>
  </section>
);
