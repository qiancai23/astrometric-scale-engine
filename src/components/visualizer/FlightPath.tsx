import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FlightState, useFlightStore } from '../../state/useFlightStore';
import { easeInOutCubic, prefersReducedMotion } from '../../lib/motion';
import { pathFragment, pathVertex } from './shaders';
import type { MapRuntime } from './mapRuntime';

/** Fraction of the route covered by the ship (0..1), or -1 when the ship is not shown. */
export function shipFraction(s: Pick<FlightState, 'profile' | 'progress' | 'playing'>): number {
  const p = s.profile;
  if (!p || !(p.distance > 0)) return -1;
  if (s.progress <= 0 && !s.playing) return -1;
  const x = p.atFraction(s.progress).x / p.distance;
  return Math.min(Math.max(x, 0), 1);
}

/** Screen length (CSS px) of the route, or a large fallback when an end is behind the camera. */
export function routeScreenLength(runtime: MapRuntime, oi: number, di: number): number {
  if (oi < 0 || di < 0) return 1000;
  if (!runtime.front[oi] || !runtime.front[di]) return 1600;
  const dx = runtime.sx[di] - runtime.sx[oi];
  const dy = runtime.sy[di] - runtime.sy[oi];
  return Math.max(Math.sqrt(dx * dx + dy * dy), 1);
}

const DRAW_MS = 900;
const DRAW_DELAY_MS = 200;
const bufSize = new THREE.Vector2();

/**
 * The flight path: a ribbon from origin to destination in the accent color with dashes that flow
 * in the direction of travel. It draws itself when the route changes; during playback the flown
 * part turns solid with a glowing comet trail behind the ship.
 */
export const FlightPath: React.FC<{ runtime: MapRuntime }> = ({ runtime }) => {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const routeRevision = useFlightStore((s) => s.routeRevision);
  const drawStart = useRef(performance.now() + 900);
  const dash = useRef({ offset: 0, count: 0 });
  const mounted = useRef(false);

  useEffect(() => {
    // On load wait for the camera to swing in; on a route change draw almost at once.
    if (mounted.current) drawStart.current = performance.now() + DRAW_DELAY_MS;
    mounted.current = true;
  }, [routeRevision]);

  const mesh = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('along', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 1]), 1));
    g.setAttribute('side', new THREE.BufferAttribute(new Float32Array([-1, 1, -1, 1]), 1));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uA: { value: new THREE.Vector3() },
        uB: { value: new THREE.Vector3(1, 0, 0) },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uWidth: { value: 18 },
        uLineHalf: { value: 1.1 },
        uNear: { value: 0.0001 },
        uColor: { value: new THREE.Vector3(1, 1, 1) },
        uPale: { value: new THREE.Vector3(1, 1, 1) },
        uDraw: { value: 0 },
        uShip: { value: -1 },
        uTrail: { value: 0.05 },
        uDashCount: { value: 32 },
        uDashOffset: { value: 0 },
        uEndFade: { value: 0.02 },
        uOpacity: { value: 0 },
      },
      vertexShader: pathVertex,
      fragmentShader: pathFragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    return mesh;
  }, []);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
    [mesh],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const s = useFlightStore.getState();
    const u = (mesh.material as THREE.ShaderMaterial).uniforms;
    const data = runtime.data;
    const oi = s.origin ? data.index.get(s.origin.id) ?? -1 : -1;
    const di = s.destination ? data.index.get(s.destination.id) ?? -1 : -1;
    if (oi < 0 || di < 0 || oi === di) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const reduced = prefersReducedMotion();
    const dpr = gl.getPixelRatio();

    (u.uA.value as THREE.Vector3).set(data.pos[oi * 3], data.pos[oi * 3 + 1], data.pos[oi * 3 + 2]);
    (u.uB.value as THREE.Vector3).set(data.pos[di * 3], data.pos[di * 3 + 1], data.pos[di * 3 + 2]);
    gl.getDrawingBufferSize(bufSize);
    (u.uResolution.value as THREE.Vector2).copy(bufSize);
    u.uWidth.value = 18 * dpr;
    u.uLineHalf.value = 1.1 * dpr;
    u.uNear.value = camera.near;
    (u.uColor.value as THREE.Vector3).copy(runtime.colors.accent.value);
    (u.uPale.value as THREE.Vector3).copy(runtime.colors.accentPale.value);

    // Draw-on after a route change.
    const now = performance.now();
    const drawT = reduced ? 1 : Math.min(Math.max((now - drawStart.current) / DRAW_MS, 0), 1);
    u.uDraw.value = drawT >= 1 ? 1.0001 : easeInOutCubic(drawT);
    u.uOpacity.value = drawT > 0 || reduced ? 1 : 0;

    const lenPx = routeScreenLength(runtime, oi, di);

    // Dash count snapped to powers of two so zooming does not make the dashes shimmer.
    const wanted = Math.max(lenPx / 16, 1);
    const count = Math.pow(2, Math.round(Math.log2(wanted)));
    const d = dash.current;
    if (d.count !== count) {
      d.offset = d.count > 0 ? (d.offset * count) / d.count : 0;
      d.offset -= Math.floor(d.offset);
      d.count = count;
    }
    if (!reduced) {
      d.offset += dt * (s.driveCore === 'Warp' ? 2.6 : 0.75);
      if (d.offset > 1000) d.offset -= Math.floor(d.offset);
    }
    u.uDashCount.value = count;
    u.uDashOffset.value = d.offset;
    u.uEndFade.value = Math.min(13 / lenPx, 0.3);

    const ship = shipFraction(s);
    u.uShip.value = ship;
    const trail = (s.driveCore === 'Warp' ? 150 : 110) / lenPx;
    u.uTrail.value = ship >= 0 ? Math.min(ship, trail) : Math.min(60 / lenPx, 0.3);
  });

  return <primitive object={mesh} />;
};
