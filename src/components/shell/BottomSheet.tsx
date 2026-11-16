import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFlightStore } from '../../state/useFlightStore';
import { getEntry } from '../../data/catalog';
import { formatDistance, formatDuration } from '../../lib/format';
import { RollingValue } from '../common/RollingValue';
import { FlightPlanPanel } from '../plan/FlightPlanPanel';
import { AnswerPanel } from '../answer/AnswerPanel';
import { PlaybackPanel } from '../playback/PlaybackPanel';
import { PauseIcon, PlayIcon } from './icons';

type Snap = 'peek' | 'half' | 'full';
type TabId = 'plan' | 'answer' | 'flight';

const SNAPS: Snap[] = ['peek', 'half', 'full'];
const TABS: { id: TabId; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'answer', label: 'Answer' },
  { id: 'flight', label: 'Flight' },
];
const PEEK_PX = 148;

const useWindowHeight = (): number => {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return h;
};

const snapHeight = (snap: Snap, vh: number): number => {
  if (snap === 'peek') return PEEK_PX;
  if (snap === 'half') return Math.round(vh * 0.52);
  return Math.max(PEEK_PX + 40, vh - 72);
};

const routeName = (obj: { id: string; name: string } | null): string =>
  obj ? getEntry(obj.id)?.name ?? obj.name : '';

/** The summary row: route, headline time, play button. Always visible at the top of the sheet. */
const Summary: React.FC<{ onChange: () => void }> = ({ onChange }) => {
  const origin = useFlightStore((s) => s.origin);
  const destination = useFlightStore((s) => s.destination);
  const distance = useFlightStore((s) => s.distanceMeters);
  const profile = useFlightStore((s) => s.profile);
  const driveCore = useFlightStore((s) => s.driveCore);
  const playing = useFlightStore((s) => s.playing);
  const togglePlay = useFlightStore((s) => s.togglePlay);
  return (
    <div className="shell-summary">
      <button type="button" className="shell-summary-route" onClick={onChange}>
        <span className="shell-summary-name">
          {origin && destination ? `${routeName(origin)} to ${routeName(destination)}` : 'Choose a flight'}
        </span>
        <span className="shell-summary-sub">{distance > 0 ? `${formatDistance(distance)} · tap to change` : 'Tap to choose'}</span>
      </button>
      <div className="shell-summary-time">
        {profile ? (
          <RollingValue value={profile.totalProperTime} format={formatDuration} log className="shell-summary-value num" />
        ) : (
          <span className="shell-summary-value num">–</span>
        )}
        <span className="shell-summary-label">{driveCore === 'Warp' ? 'travel time' : 'you age'}</span>
      </div>
      <button
        type="button"
        className={`btn-solid shell-play${playing ? '' : ' is-waiting'}`}
        aria-label={playing ? 'Pause the flight' : 'Play the flight'}
        disabled={!profile}
        onClick={togglePlay}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
    </div>
  );
};

export const BottomSheet = React.forwardRef<HTMLDivElement>((_props, ref) => {
  const vh = useWindowHeight();
  const [snap, setSnap] = useState<Snap>('half');
  const [tab, setTab] = useState<TabId>('plan');
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const picker = useFlightStore((s) => s.picker);
  const playing = useFlightStore((s) => s.playing);
  const openPicker = useFlightStore((s) => s.openPicker);
  const restoreSnap = useRef<Snap | null>(null);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const drag = useRef<{ startY: number; startH: number; samples: { y: number; t: number }[]; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  // Playing drops the sheet to peek so the map is visible; pausing or arriving restores it.
  useEffect(() => {
    if (playing) {
      if (restoreSnap.current === null && snapRef.current !== 'peek') restoreSnap.current = snapRef.current;
      setSnap('peek');
    } else if (restoreSnap.current !== null) {
      setSnap(restoreSnap.current);
      restoreSnap.current = null;
    }
  }, [playing]);

  // Opening a picker brings up the Plan tab at full height.
  useEffect(() => {
    if (picker) {
      setTab('plan');
      setSnap('full');
      restoreSnap.current = null;
    }
  }, [picker]);

  const cycle = useCallback(() => {
    setSnap((s) => SNAPS[(SNAPS.indexOf(s) + 1) % SNAPS.length]);
    restoreSnap.current = null;
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      startY: e.clientY,
      startH: snapHeight(snapRef.current, vh),
      samples: [{ y: e.clientY, t: performance.now() }],
      moved: false,
    };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientY - d.startY) < 5) return;
    d.moved = true;
    d.samples.push({ y: e.clientY, t: performance.now() });
    if (d.samples.length > 6) d.samples.shift();
    const min = PEEK_PX - 30;
    const max = snapHeight('full', vh);
    setDragHeight(Math.min(max, Math.max(min, d.startH + (d.startY - e.clientY))));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 0);
    const first = d.samples[0];
    const dt = Math.max(1, performance.now() - first.t);
    const velocity = (first.y - e.clientY) / dt; // px per ms, positive = upward
    const current = Math.min(snapHeight('full', vh), Math.max(PEEK_PX - 30, d.startH + (d.startY - e.clientY)));
    const projected = current + velocity * 180;
    let best: Snap = 'peek';
    for (const s of SNAPS) {
      if (Math.abs(snapHeight(s, vh) - projected) < Math.abs(snapHeight(best, vh) - projected)) best = s;
    }
    restoreSnap.current = null;
    setSnap(best);
    setDragHeight(null);
  };

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[next].id);
    document.getElementById(`shell-tab-${TABS[next].id}`)?.focus();
  };

  const tabIndex = TABS.findIndex((t) => t.id === tab);
  const height = dragHeight ?? snapHeight(snap, vh);

  return (
    <section
      className={`panel shell-sheet${dragHeight !== null ? ' is-dragging' : ''}`}
      ref={ref}
      id="flight-plan"
      tabIndex={-1}
      style={{ height }}
      aria-label="Flight controls"
      data-snap={snap}
    >
      <button
        type="button"
        className="shell-sheet-handle"
        aria-label="Resize the panel"
        onClick={() => {
          if (!suppressClick.current) cycle();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className="shell-sheet-grip" />
      </button>
      <Summary
        onChange={() => {
          setTab('plan');
          setSnap('half');
          restoreSnap.current = null;
          openPicker('destination');
        }}
      />
      <div className="shell-tabs" role="tablist" aria-label="Flight sections" onKeyDown={onTabKey} data-index={tabIndex}>
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`shell-tab-${t.id}`}
            type="button"
            role="tab"
            className="shell-tab"
            aria-selected={tab === t.id}
            aria-controls={`shell-tabpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => {
              setTab(t.id);
              if (snapRef.current === 'peek') setSnap('half');
            }}
          >
            {t.label}
          </button>
        ))}
        <span className="shell-tab-indicator" aria-hidden="true" />
      </div>
      <div className="shell-sheet-body">
        <div id="shell-tabpanel-plan" role="tabpanel" aria-labelledby="shell-tab-plan" hidden={tab !== 'plan'} className="shell-tabpanel">
          <FlightPlanPanel compact />
        </div>
        <div id="shell-tabpanel-answer" role="tabpanel" aria-labelledby="shell-tab-answer" hidden={tab !== 'answer'} className="shell-tabpanel">
          <AnswerPanel compact />
        </div>
        <div id="shell-tabpanel-flight" role="tabpanel" aria-labelledby="shell-tab-flight" hidden={tab !== 'flight'} className="shell-tabpanel">
          <PlaybackPanel compact />
        </div>
      </div>
    </section>
  );
});
BottomSheet.displayName = 'BottomSheet';
