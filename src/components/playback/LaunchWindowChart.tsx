import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFlightStore } from '../../state/useFlightStore';
import { porkchop, porkchopCost, Porkchop, ArrivalMode } from '../../physics/transfer';
import { formatDate, formatDeltaV, formatDuration } from '../../lib/format';

/**
 * The launch-window chart (a "porkchop plot"): every launch date across, every travel time up,
 * each cell colored by the fuel that flight needs. Only for chemical-rocket flights round the Sun.
 * The cells are drawn on a canvas; the marker, the cursor and every label are DOM, so moving the
 * cursor never repaints the grid.
 */

interface Cell {
  j: number; // column: launch date
  i: number; // row: travel time (0 = shortest, drawn at the bottom)
}

interface Palette {
  accent: string;
  pale: string;
  dim: string;
}

/** Colors from the design tokens, read at draw time so the chart follows the active drive. */
const readPalette = (): Palette => {
  const style = getComputedStyle(document.documentElement);
  const warp = document.documentElement.getAttribute('data-drive') === 'Warp';
  const get = (name: string) => style.getPropertyValue(name).trim();
  return {
    accent: get(warp ? '--color-accent-warp' : '--color-accent-sublight'),
    pale: get(warp ? '--color-accent-warp-pale' : '--color-accent-sublight-pale'),
    dim: get('--color-text-faint'),
  };
};

const dayOf = (g: Porkchop, j: number): number => g.startDay + j * g.dateStep;
const tofOf = (g: Porkchop, i: number): number => g.tofMin + i * g.tofStep;

/** Cheapest cell of the grid, for the color scale. */
const gridMinimum = (g: Porkchop, mode: ArrivalMode): number => {
  let min = Infinity;
  for (let j = 0; j < g.nDates; j++) {
    for (let i = 0; i < g.nTofs; i++) {
      const c = porkchopCost(g, j, i, mode);
      if (c < min) min = c;
    }
  }
  return min;
};

const draw = (canvas: HTMLCanvasElement, g: Porkchop, mode: ArrivalMode, budget: number, width: number, height: number) => {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const pal = readPalette();
  const min = gridMinimum(g, mode);
  if (!Number.isFinite(min)) return;
  // A log scale capped at four times the cheapest flight: one absurd cell would otherwise squash
  // every useful difference into the same shade.
  const span = Math.log(4);
  const cw = width / g.nDates;
  const ch = height / g.nTofs;
  const inBudget = new Uint8Array(g.nDates * g.nTofs);

  for (let j = 0; j < g.nDates; j++) {
    // Whole-pixel edges so neighbouring cells meet without hairline gaps.
    const x0 = Math.floor(j * cw);
    const x1 = Math.floor((j + 1) * cw);
    for (let i = 0; i < g.nTofs; i++) {
      const c = porkchopCost(g, j, i, mode);
      if (!Number.isFinite(c)) continue;
      const s = Math.min(Math.log(c / min) / span, 1);
      const ok = c <= budget;
      inBudget[j * g.nTofs + i] = ok ? 1 : 0;
      ctx.fillStyle = ok ? pal.accent : pal.dim;
      ctx.globalAlpha = ok ? 1 - 0.7 * s : 0.42 - 0.34 * s;
      const y0 = Math.floor(height - (i + 1) * ch);
      const y1 = Math.floor(height - i * ch);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }

  // Outline the within-budget region so the window reads at a glance.
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = pal.pale;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const ok = (j: number, i: number) => j >= 0 && j < g.nDates && i >= 0 && i < g.nTofs && inBudget[j * g.nTofs + i] === 1;
  for (let j = 0; j < g.nDates; j++) {
    const x0 = Math.floor(j * cw) + 0.5;
    const x1 = Math.floor((j + 1) * cw) + 0.5;
    for (let i = 0; i < g.nTofs; i++) {
      if (!ok(j, i)) continue;
      const yTop = Math.floor(height - (i + 1) * ch) + 0.5;
      const yBot = Math.floor(height - i * ch) + 0.5;
      if (!ok(j - 1, i)) { ctx.moveTo(x0, yTop); ctx.lineTo(x0, yBot); }
      if (!ok(j + 1, i)) { ctx.moveTo(x1, yTop); ctx.lineTo(x1, yBot); }
      if (!ok(j, i + 1)) { ctx.moveTo(x0, yTop); ctx.lineTo(x1, yTop); }
      if (!ok(j, i - 1)) { ctx.moveTo(x0, yBot); ctx.lineTo(x1, yBot); }
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
};

const describe = (g: Porkchop, cell: Cell, mode: ArrivalMode, budget: number): string => {
  const head = `Leave ${formatDate(dayOf(g, cell.j))} · ${formatDuration(tofOf(g, cell.i) * 86400)}`;
  const cost = porkchopCost(g, cell.j, cell.i, mode);
  if (!Number.isFinite(cost)) return `${head} · no orbit joins these two`;
  const needs = `needs ${formatDeltaV(cost)}`;
  return cost <= budget ? `${head} · ${needs}` : `${head} · ${needs}, over your ${formatDeltaV(budget)} budget`;
};

export const LaunchWindowChart: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const origin = useFlightStore((s) => s.origin?.name ?? '');
  const dest = useFlightStore((s) => s.destination?.name ?? '');
  const departureDay = useFlightStore((s) => s.departureDay);
  const budget = useFlightStore((s) => s.deltaVKms);
  const mode = useFlightStore((s) => s.arrivalMode);
  const pinned = useFlightStore((s) => s.pinnedTofDays !== null);
  const launchDay = useFlightStore((s) => s.plan?.launchDay ?? NaN);
  const tripDays = useFlightStore((s) => (s.plan ? s.plan.arrivalDay - s.plan.launchDay : NaN));
  const driveCore = useFlightStore((s) => s.driveCore);
  const pinFlight = useFlightStore((s) => s.pinFlight);
  const clearPin = useFlightStore((s) => s.clearPin);

  /*
   * The grid starts at the earliest launch date. Pinning a cell moves that date to the cell's
   * date, which would slide the whole chart under the visitor's pointer, so a change of date
   * caused by our own pin keeps the grid where it was.
   */
  const ownPin = useRef<number | null>(null);
  const anchor = useRef<{ route: string; dep: number; start: number }>({ route: '', dep: NaN, start: departureDay });
  const route = `${origin}|${dest}`;
  if (anchor.current.route !== route) {
    anchor.current = { route, dep: departureDay, start: departureDay };
  } else if (anchor.current.dep !== departureDay) {
    const keep = pinned && ownPin.current === departureDay;
    anchor.current = { route, dep: departureDay, start: keep ? anchor.current.start : departureDay };
  }
  const startDay = anchor.current.start;
  const key = `${route}|${startDay}`;

  /* The grid costs 0.1–0.2 s the first time: let the "working" state paint, then compute. */
  const [grid, setGrid] = useState<{ key: string; g: Porkchop } | null>(null);
  useEffect(() => {
    if (!origin || !dest || grid?.key === key) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      const g = porkchop(origin, dest, startDay);
      if (!cancelled) setGrid({ key, g });
    }, 16);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [key, origin, dest, startDay, grid?.key]);
  const g = grid?.key === key ? grid.g : null;

  /* ----- size ----- */
  const plotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setSize((prev) => (Math.abs(prev.w - cr.width) < 0.5 && Math.abs(prev.h - cr.height) < 0.5 ? prev : { w: cr.width, h: cr.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Budget, arrival mode, size and drive color only repaint; they never recompute the grid. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !g || size.w <= 0 || size.h <= 0) return;
    // The drive attribute is set by the shell in an effect; paint on the next frame so it has landed.
    const id = requestAnimationFrame(() => draw(canvas, g, mode, budget, size.w, size.h));
    return () => cancelAnimationFrame(id);
  }, [g, mode, budget, size.w, size.h, driveCore]);

  /* ----- cursor ----- */
  const [cursor, setCursor] = useState<Cell | null>(null);
  const [announce, setAnnounce] = useState('');
  useEffect(() => setCursor(null), [key]);

  const cellAt = useCallback(
    (clientX: number, clientY: number): Cell | null => {
      const el = plotRef.current;
      if (!el || !g) return null;
      const r = el.getBoundingClientRect();
      const j = Math.floor(((clientX - r.left) / Math.max(r.width, 1)) * g.nDates);
      const i = Math.floor(((r.bottom - clientY) / Math.max(r.height, 1)) * g.nTofs);
      return { j: Math.min(Math.max(j, 0), g.nDates - 1), i: Math.min(Math.max(i, 0), g.nTofs - 1) };
    },
    [g],
  );

  const pin = (cell: Cell) => {
    if (!g) return;
    const day = Math.round(dayOf(g, cell.j));
    ownPin.current = day;
    pinFlight(day, tofOf(g, cell.i));
  };

  /* The current flight, in cell units (centres at n + 0.5). Clamped when it lies off the grid. */
  const marker = useMemo(() => {
    if (!g || !Number.isFinite(launchDay) || !Number.isFinite(tripDays)) return null;
    const cx = (launchDay - g.startDay) / g.dateStep + 0.5;
    const cy = (tripDays - g.tofMin) / g.tofStep + 0.5;
    const x = Math.min(Math.max(cx, 0.5), g.nDates - 0.5);
    const y = Math.min(Math.max(cy, 0.5), g.nTofs - 0.5);
    return { x: x / g.nDates, y: y / g.nTofs, clamped: x !== cx || y !== cy };
  }, [g, launchDay, tripDays]);

  const markerCell = (): Cell | null =>
    g && marker ? { j: Math.floor(marker.x * g.nDates), i: Math.floor(marker.y * g.nTofs) } : null;

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const c = cellAt(e.clientX, e.clientY);
    setCursor((prev) => (c && prev && prev.i === c.i && prev.j === c.j ? prev : c));
  };

  /* A tap pins; a finger that moved was scrolling the panel, not choosing. */
  const down = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    down.current = e.pointerType === 'mouse' && e.button !== 0 ? null : { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = down.current;
    down.current = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
    const c = cellAt(e.clientX, e.clientY);
    if (c) pin(c);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!g) return;
    const from = cursor ?? markerCell() ?? { j: 0, i: 0 };
    const step = e.shiftKey ? 8 : 1;
    let next: Cell | null = null;
    if (e.key === 'ArrowRight') next = { j: from.j + step, i: from.i };
    else if (e.key === 'ArrowLeft') next = { j: from.j - step, i: from.i };
    else if (e.key === 'ArrowUp') next = { j: from.j, i: from.i + step };
    else if (e.key === 'ArrowDown') next = { j: from.j, i: from.i - step };
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pin(from);
      setAnnounce(`Picked: ${describe(g, from, mode, budget)}`);
      return;
    }
    if (!next) return;
    e.preventDefault();
    next = { j: Math.min(Math.max(next.j, 0), g.nDates - 1), i: Math.min(Math.max(next.i, 0), g.nTofs - 1) };
    setCursor(next);
    setAnnounce(describe(g, next, mode, budget));
  };

  const onFocus = () => {
    if (!g || cursor) return;
    const c = markerCell();
    if (c) setCursor(c);
  };

  /* ----- labels ----- */
  const xTicks = useMemo(() => {
    if (!g) return [];
    const n = size.w > 520 ? 5 : 3;
    return Array.from({ length: n }, (_, k) => {
      const j = Math.round((k / (n - 1)) * (g.nDates - 1));
      return { pos: (j + 0.5) / g.nDates, text: formatDate(dayOf(g, j)), edge: k === 0 ? 'start' : k === n - 1 ? 'end' : '' };
    });
  }, [g, size.w]);

  const yTicks = useMemo(() => {
    if (!g) return [];
    return [g.nTofs - 1, Math.round((g.nTofs - 1) / 2), 0].map((i) => ({
      pos: (i + 0.5) / g.nTofs,
      text: formatDuration(tofOf(g, i) * 86400),
    }));
  }, [g]);

  const cursorText = g && cursor ? describe(g, cursor, mode, budget) : null;
  const flightText =
    Number.isFinite(launchDay) && Number.isFinite(tripDays)
      ? `Your flight: leave ${formatDate(launchDay)} · ${formatDuration(tripDays * 86400)}`
      : '';

  return (
    <div className={`playback-lw${compact ? ' is-compact' : ''}`}>
      <div className="playback-lw-frame">
        <div className="playback-lw-yaxis" aria-hidden="true">
          {yTicks.map((t) => (
            <span key={t.pos} style={{ bottom: `${t.pos * 100}%` }}>{t.text}</span>
          ))}
        </div>
        <div
          ref={plotRef}
          className={`playback-lw-plot${g ? '' : ' is-loading'}`}
          role="group"
          aria-roledescription="launch-window chart"
          aria-label={`Launch windows from ${origin} to ${dest}: launch date across, travel time up, brighter cells need less fuel. Arrow keys move the cursor, Enter flies that launch.`}
          aria-busy={!g}
          tabIndex={g ? 0 : -1}
          onPointerMove={onPointerMove}
          onPointerLeave={() => {
            if (document.activeElement !== plotRef.current) setCursor(null);
          }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (down.current = null)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={() => setCursor(null)}
        >
          {g ? (
            <div key={key} className="playback-lw-reveal">
              <canvas ref={canvasRef} className="playback-lw-canvas" style={{ width: size.w, height: size.h }} aria-hidden="true" />
            </div>
          ) : (
            <div className="playback-lw-working" role="status">Working out launch windows…</div>
          )}
          {g && cursor && (
            <div
              className="playback-lw-cursor"
              aria-hidden="true"
              style={{
                left: `${(cursor.j / g.nDates) * 100}%`,
                bottom: `${(cursor.i / g.nTofs) * 100}%`,
                width: `${100 / g.nDates}%`,
                height: `${100 / g.nTofs}%`,
              }}
            />
          )}
          {g && marker && (
            <div
              key={`${launchDay}|${tripDays}`}
              className={`playback-lw-marker${marker.clamped ? ' is-clamped' : ''}`}
              aria-hidden="true"
              title={marker.clamped ? 'Your flight lies just off this chart' : 'Your flight'}
              style={{ left: `${marker.x * 100}%`, bottom: `${marker.y * 100}%` }}
            />
          )}
        </div>
        <div className="playback-lw-corner" aria-hidden="true" />
        <div className="playback-lw-xaxis" aria-hidden="true">
          {xTicks.map((t) => (
            <span key={t.pos} className={t.edge ? `is-${t.edge}` : undefined} style={{ left: `${t.pos * 100}%` }}>
              {t.text}
            </span>
          ))}
        </div>
      </div>

      <p className="playback-lw-readout" aria-hidden="true" title={cursorText ?? flightText}>
        {cursorText ?? flightText}
      </p>
      <div className="playback-lw-foot">
        <p className="playback-lw-legend">
          <span className="playback-lw-swatch" aria-hidden="true" />
          Brighter = less fuel. Dim = more than your {formatDeltaV(budget)} budget. Pick a square to fly it.
        </p>
        {pinned && (
          <button type="button" className="btn btn-ghost playback-lw-unpin" onClick={clearPin}>
            Soonest arrival instead
          </button>
        )}
      </div>
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
    </div>
  );
};
