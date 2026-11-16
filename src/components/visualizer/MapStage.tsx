import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useFlightStore } from '../../state/useFlightStore';
import { readSceneTokens, useSceneTokens } from '../../lib/tokens';
import { prefersReducedMotion, useMediaQuery } from '../../lib/motion';
import { MapRuntime } from './mapRuntime';
import { Backdrop } from './Backdrop';
import { CameraRig } from './CameraRig';
import { StarField } from './StarField';
import { SolarSystem } from './SolarSystem';
import { FlightPath } from './FlightPath';
import { OverlayDriver, pickAt } from './OverlayDriver';
import { MapOverlays } from './MapOverlays';
import { stepMapDay } from './flightGeometry';
import '../../styles/map.css';

/** Everything inside the WebGL canvas. */
const MapScene: React.FC<{ runtime: MapRuntime }> = ({ runtime }) => {
  const regime = useFlightStore((s) => s.regime);
  runtime.setRegime(regime);
  const tokens = useSceneTokens();
  useEffect(() => runtime.applyTokens(tokens), [runtime, tokens]);
  // Token colors glide to their new values (cyan to amber) before anything else draws.
  // The same early step moves the solar-system bodies to the date the map is showing.
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    runtime.stepColors(dt, prefersReducedMotion());
    stepMapDay(runtime, useFlightStore.getState(), dt);
  }, -2);

  return (
    <>
      <Backdrop runtime={runtime} />
      <CameraRig runtime={runtime} />
      <StarField runtime={runtime} />
      {regime === 'Systemic' && <SolarSystem runtime={runtime} />}
      <FlightPath runtime={runtime} />
      <OverlayDriver runtime={runtime} />
    </>
  );
};

const DRAG_THRESHOLD = 5;

/**
 * The 3D map stage: a full-window canvas plus its DOM overlays. Loaded lazily by the shell, which
 * gives it a container that fills the window.
 */
const MapStage: React.FC = () => {
  const runtime = useMemo(() => {
    const r = new MapRuntime(useFlightStore.getState().regime);
    r.applyTokens(readSceneTokens());
    return r;
  }, []);
  const regime = useFlightStore((s) => s.regime);
  const originName = useFlightStore((s) => s.origin?.name);
  const destinationName = useFlightStore((s) => s.destination?.name);
  const coarse = useMediaQuery('(pointer: coarse)');
  const [showHint, setShowHint] = useState(true);
  const press = useRef({ x: 0, y: 0, dragging: false, pointers: 0, active: false });

  const dismissHint = useCallback(() => setShowHint(false), []);

  const local = (e: React.PointerEvent | React.MouseEvent): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const [x, y] = local(e);
    const p = press.current;
    p.pointers++;
    runtime.touch();
    runtime.pointerX = x;
    runtime.pointerY = y;
    if (showHint) dismissHint();
    if (p.pointers > 1 || (e.pointerType === 'mouse' && e.button !== 0)) {
      // Pinch, pan or right-drag: camera input, never a selection.
      p.dragging = true;
      runtime.userCameraInput();
    } else {
      p.x = x;
      p.y = y;
      p.dragging = false;
    }
    p.active = true;
    runtime.pointerDown = true;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const [x, y] = local(e);
    runtime.pointerX = x;
    runtime.pointerY = y;
    runtime.pointerInside = true;
    runtime.touch();
    const p = press.current;
    if (p.active && !p.dragging && Math.hypot(x - p.x, y - p.y) > DRAG_THRESHOLD) {
      p.dragging = true;
      runtime.userCameraInput();
    }
  };

  const endPress = () => {
    const p = press.current;
    p.pointers = Math.max(0, p.pointers - 1);
    if (p.pointers === 0) {
      p.active = false;
      runtime.pointerDown = false;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    const wasClick = p.active && !p.dragging && p.pointers === 1 && (e.pointerType !== 'mouse' || e.button === 0);
    endPress();
    if (!wasClick) return;
    const [x, y] = local(e);
    const s = useFlightStore.getState();
    const i = pickAt(runtime, x, y, s.layers.exoplanets);
    if (i >= 0) s.selectObject(runtime.data.entries[i].id);
    else if (s.selectedId) s.selectObject(null);
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const [x, y] = local(e);
    const s = useFlightStore.getState();
    const i = pickAt(runtime, x, y, s.layers.exoplanets);
    if (i >= 0) s.focusObject(runtime.data.entries[i].id);
  };

  useEffect(() => {
    // Clear the map's hover when the stage unmounts.
    return () => useFlightStore.getState().setHovered(null);
  }, []);

  const mapName = regime === 'Interstellar' ? 'the stars near the Sun' : 'the solar system';
  const ariaLabel =
    originName && destinationName
      ? `3D map of ${mapName} showing the flight from ${originName} to ${destinationName}`
      : `3D map of ${mapName}`;

  return (
    <div className="map-stage">
      <div
        className="map-canvas"
        role="img"
        aria-label={ariaLabel}
        ref={(el) => {
          runtime.dom.canvasWrap = el;
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={endPress}
        onPointerLeave={() => {
          runtime.pointerInside = false;
        }}
        onWheel={() => {
          runtime.userCameraInput();
          if (showHint) dismissHint();
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Canvas
          dpr={[1, 2]}
          flat
          camera={{ fov: 45, near: 0.0001, far: 100000, position: [0, 4, 10] }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        >
          <MapScene runtime={runtime} />
        </Canvas>
      </div>
      <MapOverlays runtime={runtime} showHint={showHint} coarse={coarse} />
    </div>
  );
};

export default MapStage;
