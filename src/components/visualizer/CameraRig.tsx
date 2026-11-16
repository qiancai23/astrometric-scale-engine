import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { FlightState, useFlightStore } from '../../state/useFlightStore';
import { getEntry } from '../../data/catalog';
import { easeInOutCubic, prefersReducedMotion } from '../../lib/motion';
import { distanceToFit, framingDiameter } from './mapMath';
import { MapRuntime, readInsets } from './mapRuntime';
import { flightBounds } from './flightGeometry';
import { indexByName } from './sceneData';
import type { AstrometricRegime } from '../../types';

type Controls = React.ElementRef<typeof OrbitControls>;

interface CameraFlight {
  active: boolean;
  start: number;
  duration: number;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromDir: THREE.Vector3;
  toDir: THREE.Vector3;
  fromDist: number;
  toDist: number;
  hump: number;
  /** True when the flight is an automatic framing (resets the "user moved" flag on arrival). */
  framing: boolean;
}

const LIMITS: Record<AstrometricRegime, { min: number; max: number; empty: number }> = {
  // Solar-system map, AU: from 15,000 km out to well past Sedna.
  Systemic: { min: 1e-4, max: 2e4, empty: 40 },
  // Star map, units of 20 pc: from about 8 AU out to past Andromeda.
  Interstellar: { min: 2e-6, max: 2.5e5, empty: 3 },
};

const UP = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();

/** Neighbourhood radius (scene units) to show around a focused object. */
function focusRadius(regime: AstrometricRegime, kind: string, distFromSol: number): number {
  if (regime === 'Systemic') {
    if (kind === 'star') return 2.5;
    if (kind === 'planet' || kind === 'moon') return Math.max(0.004, distFromSol * 0.012);
    return Math.max(0.05, distFromSol * 0.08);
  }
  if (distFromSol < 1e-4) return 0.4;
  return Math.max(0.1, distFromSol * 0.12);
}

/**
 * The camera: OrbitControls with damping, logarithmic (constant-ratio) zoom toward the cursor, and
 * eased camera flights for every automatic move (load, route change, map change, focus, zoom
 * buttons). Frames the flight inside the part of the window not covered by panels, using a view
 * offset so the orbit target sits at the centre of that area. Drifts slowly when left alone.
 */
export const CameraRig: React.FC<{ runtime: MapRuntime }> = ({ runtime }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const regime = useFlightStore((s) => s.regime);
  const controls = useRef<Controls>(null);

  const flight = useRef<CameraFlight>({
    active: false,
    start: 0,
    duration: 1,
    fromTarget: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
    fromDir: new THREE.Vector3(0, 0.5, 1).normalize(),
    toDir: new THREE.Vector3(0, 0.5, 1).normalize(),
    fromDist: 10,
    toDist: 10,
    hump: 0,
    framing: false,
  });
  const track = useRef({
    regime: null as AstrometricRegime | null,
    route: -1,
    focusNonce: useFlightStore.getState().focusRequest?.nonce ?? -1,
    pendingFocus: null as string | null,
    userSerial: 0,
    insetCheck: 0,
    width: 0,
    height: 0,
    offX: 0,
    offY: 0,
    offInit: false,
    autoSpeed: 0,
    near: 0,
    far: 0,
    flightRev: -1,
    framedDist: 0,
    framedTarget: new THREE.Vector3(),
    anchor: -1,
    anchorPos: new THREE.Vector3(),
  });

  // Esc clears the selection first, otherwise re-frames the flight.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const s = useFlightStore.getState();
      if (s.picker) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (s.selectedId) s.selectObject(null);
      else s.frameFlight();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const currentDir = (out: THREE.Vector3): THREE.Vector3 => {
    const c = controls.current;
    const target = c ? c.target : v3.set(0, 0, 0);
    out.copy(camera.position).sub(target);
    if (out.lengthSq() < 1e-30) out.set(0, 0.5, 1);
    return out.normalize();
  };

  /** Where the camera should be to frame the whole flight: target, direction and distance. */
  const flightFrame = (s: FlightState, outTarget: THREE.Vector3, outDir: THREE.Vector3): number => {
    const rect = runtime.safe();
    const diameter = framingDiameter(rect);
    const lim = LIMITS[runtime.regime];
    const cur = currentDir(v1);

    // The sphere to frame: the whole path, and on the solar-system map also where the two bodies
    // will be at the other end of the flight.
    const routeDir = v3;
    const pathRadius = flightBounds(runtime, s, v2, routeDir);
    if (pathRadius < 0) {
      outTarget.set(0, 0, 0);
      outDir.copy(cur);
      if (Math.abs(outDir.y) > 0.9 || Math.abs(outDir.y) < 0.15) outDir.set(0, 0.45, 1).normalize();
      return distanceToFit(lim.empty, diameter, runtime.height, camera.fov);
    }
    outTarget.copy(v2);

    // Look at the route side-on so it spreads across the screen, from a little above.
    const perp = new THREE.Vector3().crossVectors(routeDir, UP);
    if (perp.lengthSq() < 0.01) perp.set(cur.x, 0, cur.z);
    if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1);
    perp.normalize();
    if (perp.dot(cur) < 0) perp.negate();
    const elevation = runtime.regime === 'Systemic' ? 0.72 : 0.38;
    outDir.copy(perp).multiplyScalar(Math.cos(elevation)).addScaledVector(UP, Math.sin(elevation)).normalize();

    const minRadius = runtime.regime === 'Systemic' ? 0.0015 : 0.004;
    const radius = Math.max(pathRadius, minRadius) * 1.06;
    return distanceToFit(radius, diameter, runtime.height, camera.fov);
  };

  const startFlight = (target: THREE.Vector3, dir: THREE.Vector3, dist: number, duration: number, framing: boolean, from?: { target: THREE.Vector3; dir: THREE.Vector3; dist: number }) => {
    const c = controls.current;
    if (!c) return;
    const lim = LIMITS[runtime.regime];
    const f = flight.current;
    const toDist = Math.min(Math.max(dist, lim.min * 1.5), lim.max * 0.9);
    if (from) {
      f.fromTarget.copy(from.target);
      f.fromDir.copy(from.dir).normalize();
      f.fromDist = from.dist;
    } else {
      f.fromTarget.copy(c.target);
      currentDir(f.fromDir);
      f.fromDist = Math.max(camera.position.distanceTo(c.target), lim.min);
    }
    f.toTarget.copy(target);
    f.toDir.copy(dir).normalize();
    f.toDist = toDist;
    const travel = f.fromTarget.distanceTo(f.toTarget);
    f.hump = from ? 0 : Math.min(Math.max((travel / Math.max(f.fromDist, f.toDist)) * 0.3 - 0.25, 0), 2.5);
    f.start = performance.now();
    f.duration = prefersReducedMotion() ? 0 : duration;
    f.framing = framing;
    f.active = true;
    c.enableDamping = false;
    c.autoRotate = false;
    track.current.autoSpeed = 0;
    runtime.cameraFlying = true;
  };

  const frameFlight = (duration: number) => {
    const target = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const dist = flightFrame(useFlightStore.getState(), target, dir);
    track.current.framedDist = dist;
    track.current.framedTarget.copy(target);
    startFlight(target, dir, dist, duration, true);
  };

  /** Load or map change: start far out, swing round and fly in. */
  const intro = () => {
    const target = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const dist = flightFrame(useFlightStore.getState(), target, dir);
    track.current.framedDist = dist;
    track.current.framedTarget.copy(target);
    const fromDir = dir.clone().applyAxisAngle(UP, -0.9);
    fromDir.y += 0.35;
    const lim = LIMITS[runtime.regime];
    startFlight(target, dir, dist, 2200, true, {
      target,
      dir: fromDir,
      dist: Math.min(dist * 7, lim.max * 0.8),
    });
  };

  const focusOn = (id: string): boolean => {
    const entry = getEntry(id);
    const i = runtime.data.index.get(id);
    if (!entry || i === undefined) return false;
    const p = runtime.data.pos;
    const target = new THREE.Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    const radius = focusRadius(runtime.regime, entry.kind, target.length());
    const rect = runtime.safe();
    const diameter = Math.min(rect.right - rect.left, rect.bottom - rect.top) * 0.6;
    const dist = distanceToFit(radius, diameter, runtime.height, camera.fov);
    const dir = currentDir(new THREE.Vector3());
    if (dir.y < 0.17) {
      dir.y = 0.25;
      dir.normalize();
    }
    startFlight(target, dir, dist, 1300, false);
    useFlightStore.getState().selectObject(id);
    return true;
  };

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const now = performance.now();
    const t = track.current;
    const s = useFlightStore.getState();
    // The store can run a frame ahead of the scene after a map change; wait for the scene.
    if (s.regime !== runtime.regime) return;
    const f = flight.current;
    const reduced = prefersReducedMotion();
    const lim = LIMITS[runtime.regime];

    runtime.width = size.width;
    runtime.height = size.height;
    runtime.dpr = gl.getPixelRatio();
    c.minDistance = lim.min;
    c.maxDistance = lim.max;

    // Safe-area insets from the shell (checked a few times a second).
    let insetsChanged = false;
    if (now - t.insetCheck > 250) {
      t.insetCheck = now;
      insetsChanged = readInsets(gl.domElement, runtime.insets);
    }
    const sizeChanged = t.width !== size.width || t.height !== size.height;
    t.width = size.width;
    t.height = size.height;

    // A user drag or wheel cancels an automatic camera move immediately.
    if (t.userSerial !== runtime.userInputSerial) {
      t.userSerial = runtime.userInputSerial;
      if (f.active) {
        f.active = false;
        c.enableDamping = true;
        runtime.cameraFlying = false;
      }
      c.autoRotate = false;
      t.autoSpeed = 0;
    }

    // A path that rides along with a body (the Earth-Moon trips): the camera rides along too,
    // otherwise Earth would leave the view within seconds of playback.
    const frameName = s.regime === 'Systemic' ? s.profile?.trajectory?.frame ?? null : null;
    const anchor = frameName ? indexByName(runtime.data, frameName) : -1;
    if (anchor >= 0) {
      const p = runtime.data.pos;
      v1.set(p[anchor * 3], p[anchor * 3 + 1], p[anchor * 3 + 2]);
      if (t.anchor === anchor) {
        v2.subVectors(v1, t.anchorPos);
        if (v2.lengthSq() > 0) {
          c.target.add(v2);
          camera.position.add(v2);
          f.fromTarget.add(v2);
          f.toTarget.add(v2);
          t.framedTarget.add(v2);
        }
      }
      t.anchorPos.copy(v1);
    }
    t.anchor = anchor;

    // Map change (also the first frame): rebuild framing with an intro flight.
    if (t.regime !== s.regime) {
      t.regime = s.regime;
      t.route = s.routeRevision;
      t.flightRev = s.flightRevision;
      runtime.userMoved = false;
      intro();
    } else if (t.route !== s.routeRevision) {
      t.route = s.routeRevision;
      t.flightRev = s.flightRevision;
      frameFlight(1200);
    } else if (t.flightRev !== s.flightRevision) {
      // Same route, different flight (another engine, date or fuel budget). On the solar-system
      // map that can change the shape and size of the path: re-frame when it has moved or grown
      // noticeably, unless the user has taken the camera.
      t.flightRev = s.flightRevision;
      if (s.regime === 'Systemic' && !runtime.userMoved) {
        const target = new THREE.Vector3();
        const dir = new THREE.Vector3();
        const dist = flightFrame(s, target, dir);
        const ratio = t.framedDist > 0 ? dist / t.framedDist : 2;
        const moved = target.distanceTo(t.framedTarget) / Math.max(dist, 1e-9);
        if (ratio > 1.12 || ratio < 0.88 || moved > 0.06) frameFlight(900);
      }
    }

    // Requests from the rest of the interface.
    const req = s.focusRequest;
    if (req && req.nonce !== t.focusNonce) {
      t.focusNonce = req.nonce;
      if (req.kind === 'flight') frameFlight(1200);
      else if (!focusOn(req.id)) t.pendingFocus = req.id;
      else t.pendingFocus = null;
    }
    if (t.pendingFocus) {
      const e = getEntry(t.pendingFocus);
      if (!e) t.pendingFocus = null;
      else if (e.regime === s.regime) {
        focusOn(t.pendingFocus);
        t.pendingFocus = null;
      }
    }

    // Zoom buttons: an eased dolly by a constant ratio.
    if (runtime.pendingZoom !== 1) {
      const ratio = runtime.pendingZoom;
      runtime.pendingZoom = 1;
      const base = f.active ? f.toDist : camera.position.distanceTo(c.target);
      const target = f.active ? f.toTarget.clone() : c.target.clone();
      const dir = f.active ? f.toDir.clone() : currentDir(new THREE.Vector3());
      startFlight(target, dir, base * ratio, 450, false);
      runtime.userMoved = true;
    }

    // Panels moved or the window resized: re-frame, unless the user has taken the camera.
    if ((insetsChanged || sizeChanged) && !runtime.userMoved && !f.active && t.regime !== null) {
      frameFlight(800);
    }

    // Run the camera flight.
    if (f.active) {
      const p = f.duration > 0 ? Math.min((now - f.start) / f.duration, 1) : 1;
      const e = easeInOutCubic(p);
      const l0 = Math.log(f.fromDist);
      const l1 = Math.log(f.toDist);
      const baseDist = Math.exp(l0 + (l1 - l0) * e);
      const dist = baseDist * (1 + f.hump * Math.sin(Math.PI * e));
      // When the zoom changes a lot, move the target in step with the distance so the view never races.
      const span = f.toDist - f.fromDist;
      const k = Math.abs(l1 - l0) > 0.7 && Math.abs(span) > 1e-12 ? (baseDist - f.fromDist) / span : e;
      c.target.lerpVectors(f.fromTarget, f.toTarget, Math.min(Math.max(k, 0), 1));
      v1.lerpVectors(f.fromDir, f.toDir, e);
      if (v1.lengthSq() < 1e-8) v1.copy(f.toDir);
      v1.normalize();
      camera.position.copy(c.target).addScaledVector(v1, dist);
      camera.lookAt(c.target);
      if (p >= 1) {
        f.active = false;
        c.enableDamping = true;
        runtime.cameraFlying = false;
        if (f.framing) runtime.userMoved = false;
      }
    }

    // Idle life: a very slow drift around the target after a few seconds without input.
    const idle = !f.active && !reduced && !runtime.pointerDown && now - runtime.lastInteraction > 6000;
    const wanted = idle ? 0.16 : 0;
    t.autoSpeed = idle ? t.autoSpeed + (wanted - t.autoSpeed) * 0.01 : 0;
    c.autoRotate = t.autoSpeed > 0.002;
    c.autoRotateSpeed = t.autoSpeed;

    // Keep the orbit target at the centre of the uncovered area (eased when panels move).
    const rect = runtime.safe();
    const ox = size.width / 2 - (rect.left + rect.right) / 2;
    const oy = size.height / 2 - (rect.top + rect.bottom) / 2;
    const ease = reduced || !t.offInit ? 1 : 0.12;
    t.offInit = true;
    t.offX += (ox - t.offX) * ease;
    t.offY += (oy - t.offY) * ease;
    if (Math.abs(t.offX - ox) < 0.3) t.offX = ox;
    if (Math.abs(t.offY - oy) < 0.3) t.offY = oy;

    // Near and far planes follow the camera distance (the scale runs from the Moon to Andromeda).
    const dist = Math.max(camera.position.distanceTo(c.target), 1e-9);
    runtime.targetDistance = dist;
    const near = Math.min(Math.max(dist * 0.002, 1e-7), 5);
    const far = Math.max(1e5, dist * 60);
    const view = camera.view;
    const offsetStale =
      !view || !view.enabled || view.fullWidth !== size.width || view.fullHeight !== size.height || Math.abs(view.offsetX - t.offX) > 0.01 || Math.abs(view.offsetY - t.offY) > 0.01;
    if (offsetStale || Math.abs(near - t.near) > t.near * 0.05 || far !== t.far) {
      t.near = near;
      t.far = far;
      camera.near = near;
      camera.far = far;
      camera.setViewOffset(size.width, size.height, t.offX, t.offY, size.width, size.height);
      camera.updateProjectionMatrix();
    }
  }, -1);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      zoomSpeed={1.4}
      rotateSpeed={0.6}
      zoomToCursor
      minDistance={LIMITS[regime].min}
      maxDistance={LIMITS[regime].max}
    />
  );
};
