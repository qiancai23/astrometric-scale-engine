import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useFlightStore } from '../../state/useFlightStore';
import { easeInOutCubic, prefersReducedMotion } from '../../lib/motion';
import { pathFragment, pathVertex } from './shaders';
import { fillPath, shipParam } from './flightGeometry';
import { MAX_PATH_POINTS, MapRuntime } from './mapRuntime';

const DRAW_MS = 900;
const DRAW_DELAY_MS = 200;
const MAX_SEGMENTS = MAX_PATH_POINTS - 1;
const bufSize = new THREE.Vector2();
const viewProj = new THREE.Matrix4();

/** Length of the path on screen in CSS px (a large fallback when it cannot be measured). */
function measureScreenLength(runtime: MapRuntime, camera: THREE.Camera): number {
  const { count, points } = runtime.path;
  if (count < 2) return 1000;
  camera.updateMatrixWorld();
  viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const e = viewProj.elements;
  const W = runtime.width;
  const H = runtime.height;
  let total = 0;
  let px = 0;
  let py = 0;
  let prevOk = false;
  let anyBehind = false;
  for (let k = 0; k < count; k++) {
    const x = points[k * 3];
    const y = points[k * 3 + 1];
    const z = points[k * 3 + 2];
    const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
    const ok = cw > 1e-12;
    if (!ok) anyBehind = true;
    const sx = ok ? (((e[0] * x + e[4] * y + e[8] * z + e[12]) / cw) * 0.5 + 0.5) * W : 0;
    const sy = ok ? (0.5 - ((e[1] * x + e[5] * y + e[9] * z + e[13]) / cw) * 0.5) * H : 0;
    if (ok && prevOk) total += Math.hypot(sx - px, sy - py);
    px = sx;
    py = sy;
    prevOk = ok;
  }
  if (anyBehind) return Math.max(total, 1600);
  return Math.max(total, 1);
}

/**
 * The flight path: a ribbon in the accent color with dashes that flow in the direction of
 * travel. A straight line on the star map; on the solar-system map it follows the real path (a
 * coasting orbit, a spiral, or a line to where the destination will be). It draws itself when
 * the route changes; during playback the flown part turns solid with a glowing comet trail
 * behind the ship.
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
    // One quad per path segment. Each vertex carries both ends of its segment, so the vertex
    // shader can give the ribbon a constant width in screen pixels.
    const g = new THREE.BufferGeometry();
    const verts = MAX_SEGMENTS * 4;
    const along = new Float32Array(verts);
    const side = new Float32Array(verts);
    const index = new Uint16Array(MAX_SEGMENTS * 6);
    for (let k = 0; k < MAX_SEGMENTS; k++) {
      along.set([0, 0, 1, 1], k * 4);
      side.set([-1, 1, -1, 1], k * 4);
      const v = k * 4;
      index.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], k * 6);
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    g.setAttribute('segEnd', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    g.setAttribute('segT', new THREE.BufferAttribute(new Float32Array(verts * 2), 2));
    g.setAttribute('along', new THREE.BufferAttribute(along, 1));
    g.setAttribute('side', new THREE.BufferAttribute(side, 1));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: {
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
    if (s.regime !== runtime.regime) return;
    const u = (mesh.material as THREE.ShaderMaterial).uniforms;
    fillPath(runtime, s);
    const { count, points } = runtime.path;
    if (count < 2) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const reduced = prefersReducedMotion();
    const dpr = gl.getPixelRatio();

    // Upload the segments.
    const g = mesh.geometry;
    const start = g.getAttribute('position') as THREE.BufferAttribute;
    const end = g.getAttribute('segEnd') as THREE.BufferAttribute;
    const segT = g.getAttribute('segT') as THREE.BufferAttribute;
    const a = start.array as Float32Array;
    const b = end.array as Float32Array;
    const tt = segT.array as Float32Array;
    const segments = count - 1;
    for (let k = 0; k < segments; k++) {
      const p = k * 3;
      const t0 = k / segments;
      const t1 = (k + 1) / segments;
      for (let v = 0; v < 4; v++) {
        const o = (k * 4 + v) * 3;
        a[o] = points[p];
        a[o + 1] = points[p + 1];
        a[o + 2] = points[p + 2];
        b[o] = points[p + 3];
        b[o + 1] = points[p + 4];
        b[o + 2] = points[p + 5];
        tt[(k * 4 + v) * 2] = t0;
        tt[(k * 4 + v) * 2 + 1] = t1;
      }
    }
    start.needsUpdate = true;
    end.needsUpdate = true;
    segT.needsUpdate = true;
    g.setDrawRange(0, segments * 6);

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

    const lenPx = measureScreenLength(runtime, camera);
    runtime.path.screenLength = lenPx;

    // Dash count snapped to powers of two so zooming does not make the dashes shimmer.
    const wanted = Math.max(lenPx / 16, 1);
    const dashes = Math.pow(2, Math.round(Math.log2(wanted)));
    const d = dash.current;
    if (d.count !== dashes) {
      d.offset = d.count > 0 ? (d.offset * dashes) / d.count : 0;
      d.offset -= Math.floor(d.offset);
      d.count = dashes;
    }
    if (!reduced) {
      d.offset += dt * (s.driveCore === 'Warp' ? 2.6 : 0.75);
      if (d.offset > 1000) d.offset -= Math.floor(d.offset);
    }
    u.uDashCount.value = dashes;
    u.uDashOffset.value = d.offset;
    u.uEndFade.value = Math.min(13 / lenPx, 0.3);

    const ship = shipParam(s);
    u.uShip.value = ship;
    const trail = (s.driveCore === 'Warp' ? 150 : 110) / lenPx;
    u.uTrail.value = ship >= 0 ? Math.min(ship, trail) : Math.min(60 / lenPx, 0.3);
  });

  return <primitive object={mesh} />;
};
