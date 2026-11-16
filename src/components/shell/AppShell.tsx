import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFlightStore } from '../../state/useFlightStore';
import { usePlaybackDriver } from '../../lib/usePlaybackDriver';
import { useUrlSync } from '../../lib/useUrlSync';
import { useIsCompact, useMediaQuery } from '../../lib/motion';
import { FlightPlanPanel } from '../plan/FlightPlanPanel';
import { AnswerPanel } from '../answer/AnswerPanel';
import { PlaybackPanel } from '../playback/PlaybackPanel';
import { MapBoundary, MapLoading } from './MapBoundary';
import { DesktopTopBar, CompactTopBar, MapSwitch } from './TopBar';
import { BottomSheet } from './BottomSheet';
import { Toasts } from './Toasts';
import { ChevronIcon } from './icons';
import '../../styles/shell.css';

const MapStage = lazy(() => import('../visualizer/MapStage'));

// Set the accent before the first paint, so there is no flash of the wrong color.
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-drive', useFlightStore.getState().driveCore);
}

const GUTTER = 20;

/** React 18 has no typed `inert`; spread it as a plain attribute. */
const inertProps = (inert: boolean): Record<string, unknown> => (inert ? { inert: '', 'aria-hidden': true } : {});

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
};

/* ------------------------------------------------------------------ */
/* Desktop: floating panels                                            */
/* ------------------------------------------------------------------ */

interface SideProps {
  side: 'left' | 'right';
  open: boolean;
  onToggle: () => void;
  frameId?: string;
  label: string;
  /** "the flight plan": used in "Hide the flight plan". */
  noun: string;
  entranceIndex: number;
  wrapRef: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}

const SidePanel: React.FC<SideProps> = ({ side, open, onToggle, frameId, label, noun, entranceIndex, wrapRef, children }) => {
  const contentId = `shell-${side}-content`;
  return (
    <div
      ref={wrapRef}
      className={`shell-side shell-side-${side}${open ? '' : ' is-collapsed'}`}
      style={{ '--i': entranceIndex } as React.CSSProperties}
    >
      <section
        className="panel shell-frame"
        id={frameId ?? contentId}
        tabIndex={-1}
        aria-label={label}
        {...inertProps(!open)}
      >
        {children}
      </section>
      <button
        type="button"
        className="panel shell-handle"
        aria-expanded={open}
        aria-controls={frameId ?? contentId}
        aria-label={open ? `Hide ${noun}` : `Show ${noun}`}
        onClick={onToggle}
      >
        <ChevronIcon direction={(side === 'left') === open ? 'left' : 'right'} />
      </button>
    </div>
  );
};

const DesktopLayout: React.FC<{ shellRef: React.RefObject<HTMLDivElement> }> = ({ shellRef }) => {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const iconOnly = useMediaQuery('(max-width: 1279px)');
  const bar = useRef<HTMLElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLElement>(null);
  const last = useRef('');

  const measure = useCallback(() => {
    const root = shellRef.current;
    if (!root || !bar.current || !left.current || !right.current || !bottom.current) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    // offset* values ignore transforms, so they stay correct while panels slide.
    const inset = {
      top: bar.current.offsetTop + bar.current.offsetHeight,
      left: leftOpen ? left.current.offsetLeft + left.current.offsetWidth : GUTTER,
      right: rightOpen ? w - right.current.offsetLeft : GUTTER,
      bottom: h - bottom.current.offsetTop,
    };
    const key = `${inset.top}|${inset.left}|${inset.right}|${inset.bottom}`;
    if (key === last.current) return;
    last.current = key;
    root.style.setProperty('--map-inset-top', `${inset.top}px`);
    root.style.setProperty('--map-inset-right', `${inset.right}px`);
    root.style.setProperty('--map-inset-bottom', `${inset.bottom}px`);
    root.style.setProperty('--map-inset-left', `${inset.left}px`);
  }, [shellRef, leftOpen, rightOpen]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    [bar.current, left.current, right.current, bottom.current].forEach((el) => el && ro.observe(el));
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === '[') setLeftOpen((v) => !v);
      else if (e.key === ']') setRightOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onSkip = (e: React.MouseEvent) => {
    e.preventDefault();
    setLeftOpen(true);
    window.setTimeout(() => document.getElementById('flight-plan')?.focus(), 0);
  };

  return (
    <>
      <a className="shell-skip" href="#flight-plan" onClick={onSkip}>
        Skip to the flight plan
      </a>
      <DesktopTopBar ref={bar} iconOnly={iconOnly} />
      <main className="shell-main" data-left={leftOpen ? 'open' : 'closed'} data-right={rightOpen ? 'open' : 'closed'}>
        <SidePanel
          side="left"
          open={leftOpen}
          onToggle={() => setLeftOpen((v) => !v)}
          frameId="flight-plan"
          label="Flight plan"
          noun="the flight plan"
          entranceIndex={1}
          wrapRef={left}
        >
          <FlightPlanPanel />
        </SidePanel>
        <SidePanel
          side="right"
          open={rightOpen}
          onToggle={() => setRightOpen((v) => !v)}
          label="The answer"
          noun="the answer"
          entranceIndex={2}
          wrapRef={right}
        >
          <AnswerPanel />
        </SidePanel>
        <section className="panel shell-bottom" ref={bottom} aria-label="Flight playback" style={{ '--i': 3 } as React.CSSProperties}>
          <PlaybackPanel />
        </section>
      </main>
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Phone and tablet: bottom sheet                                      */
/* ------------------------------------------------------------------ */

const CompactLayout: React.FC<{ shellRef: React.RefObject<HTMLDivElement> }> = ({ shellRef }) => {
  const bar = useRef<HTMLElement>(null);
  const mapSwitch = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const last = useRef('');

  const measure = useCallback(() => {
    const root = shellRef.current;
    if (!root || !bar.current || !sheet.current) return;
    const switchBottom = mapSwitch.current ? mapSwitch.current.offsetTop + mapSwitch.current.offsetHeight : 0;
    const top = Math.max(bar.current.offsetTop + bar.current.offsetHeight, switchBottom);
    const bottom = sheet.current.offsetHeight;
    const key = `${top}|${bottom}`;
    if (key === last.current) return;
    last.current = key;
    root.style.setProperty('--map-inset-top', `${top}px`);
    root.style.setProperty('--map-inset-right', '0px');
    root.style.setProperty('--map-inset-bottom', `${bottom}px`);
    root.style.setProperty('--map-inset-left', '0px');
  }, [shellRef]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    [bar.current, mapSwitch.current, sheet.current].forEach((el) => el && ro.observe(el));
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  const onSkip = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById('flight-plan')?.focus();
  };

  return (
    <>
      <a className="shell-skip" href="#flight-plan" onClick={onSkip}>
        Skip to the flight plan
      </a>
      <CompactTopBar ref={bar} showName />
      <div className="shell-compact-switch" ref={mapSwitch}>
        <MapSwitch small />
      </div>
      <main className="shell-main">
        <BottomSheet ref={sheet} />
      </main>
    </>
  );
};

/* ------------------------------------------------------------------ */
/* The shell                                                           */
/* ------------------------------------------------------------------ */

export const AppShell: React.FC = () => {
  const driveCore = useFlightStore((s) => s.driveCore);
  const playing = useFlightStore((s) => s.playing);
  const compact = useIsCompact();
  const shellRef = useRef<HTMLDivElement>(null);
  usePlaybackDriver();
  useUrlSync();

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-drive', driveCore);
  }, [driveCore]);

  return (
    <div
      className={`app-shell${compact ? ' is-compact' : ''}`}
      ref={shellRef}
      data-playing={playing ? 'true' : 'false'}
    >
      <div className="shell-map">
        <MapBoundary>
          <Suspense fallback={<MapLoading />}>
            <MapStage />
          </Suspense>
        </MapBoundary>
      </div>
      {compact ? <CompactLayout shellRef={shellRef} /> : <DesktopLayout shellRef={shellRef} />}
      <Toasts />
    </div>
  );
};
