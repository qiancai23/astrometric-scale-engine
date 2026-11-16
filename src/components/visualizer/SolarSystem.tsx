import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useFlightStore } from '../../state/useFlightStore';
import { prefersReducedMotion } from '../../lib/motion';
import { elementsAt, orbitOutline } from '../../physics/ephemeris';
import { BODY_SPECS, bodyRadiusUnits } from './sceneData';
import { pxPerUnit } from './mapMath';
import type { MapRuntime } from './mapRuntime';

interface Body {
  index: number;
  name: string;
  group: THREE.Group;
  radius: number;
  minPx: number;
}

interface Orbit {
  id: string;
  /** Catalog name, e.g. "Mars". */
  name: string;
  line: THREE.Line;
  material: THREE.LineBasicMaterial;
  /** Resting opacity when the layer is on. */
  base: number;
}

const DEG = Math.PI / 180;
/** Points per orbit line. */
const ORBIT_POINTS = 241;
/** Orbits drift slowly over the centuries: redraw the lines when the date moves this many days. */
const ORBIT_REDRAW_DAYS = 1500;

/** Write a body's orbit for `day` into its line, in scene coordinates. */
function drawOrbit(o: Orbit, day: number): void {
  const attr = o.line.geometry.getAttribute('position') as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  orbitOutline(o.name, day, ORBIT_POINTS, arr);
  for (let k = 0; k < ORBIT_POINTS; k++) {
    // Ecliptic (x, y, z) to scene (x, z, -y).
    const y = arr[k * 3 + 1];
    arr[k * 3 + 1] = arr[k * 3 + 2];
    arr[k * 3 + 2] = -y;
  }
  attr.needsUpdate = true;
}

/**
 * The solar-system map: Sol, the planets and the Moon as small lit spheres that never shrink
 * below a few pixels, Saturn's and Uranus's rings, and the orbit lines.
 */
export const SolarSystem: React.FC<{ runtime: MapRuntime }> = ({ runtime }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const data = runtime.data;

  const { root, bodies, orbits, disposables } = useMemo(() => {
    const root = new THREE.Group();
    const bodies: Body[] = [];
    const orbits: Orbit[] = [];
    const disposables: { dispose: () => void }[] = [];
    const sphere = new THREE.SphereGeometry(1, 32, 16);
    disposables.push(sphere);

    for (const i of data.bodies) {
      const entry = data.entries[i];
      const spec = BODY_SPECS[entry.catalogName];
      if (!spec) continue;
      const radius = bodyRadiusUnits(entry.catalogName);
      const group = new THREE.Group();
      group.position.set(data.pos[i * 3], data.pos[i * 3 + 1], data.pos[i * 3 + 2]);
      const isSun = entry.kind === 'star';
      const material = isSun
        ? new THREE.MeshBasicMaterial({ color: new THREE.Color(entry.color) })
        : new THREE.MeshLambertMaterial({ color: new THREE.Color(entry.color), emissive: new THREE.Color(entry.color), emissiveIntensity: 0.18 });
      disposables.push(material);
      const mesh = new THREE.Mesh(sphere, material);
      mesh.scale.setScalar(radius);
      group.add(mesh);

      if (spec.ring) {
        const saturn = spec.ring === 'saturn';
        const ringGeo = saturn ? new THREE.RingGeometry(radius * 1.24, radius * 2.27, 96) : new THREE.RingGeometry(radius * 1.6, radius * 2.0, 96);
        const ringMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(entry.color),
          side: THREE.DoubleSide,
          transparent: true,
          opacity: saturn ? 0.55 : 0.28,
          depthWrite: false,
        });
        disposables.push(ringGeo, ringMat);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        // RingGeometry lies in XY; lay it on the ecliptic (scene XZ) and tilt it.
        ring.rotation.set(-Math.PI / 2 + (saturn ? 26.7 : 97.8) * DEG, 0, saturn ? 0.4 : 0.9);
        group.add(ring);
      }
      root.add(group);
      bodies.push({ index: i, name: entry.catalogName, group, radius, minPx: spec.minPx });
    }

    for (const entry of data.entries) {
      // Every body with an orbit round the Sun gets a line (the Moon's would be lost inside Earth's).
      if (entry.catalogName === 'Moon' || !elementsAt(entry.catalogName, 0)) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ORBIT_POINTS * 3), 3));
      const base = entry.kind === 'planet' ? 0.22 : 0.12;
      const material = new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false });
      disposables.push(geo, material);
      const line = new THREE.Line(geo, material);
      line.frustumCulled = false;
      line.renderOrder = 1;
      root.add(line);
      orbits.push({ id: entry.id, name: entry.catalogName, line, material, base });
    }
    return { root, bodies, orbits, disposables };
  }, [data]);

  useEffect(() => () => disposables.forEach((d) => d.dispose()), [disposables]);
  const orbitsDrawnFor = useRef(NaN);
  useEffect(() => {
    orbitsDrawnFor.current = NaN;
  }, [orbits]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const reduced = prefersReducedMotion();
    const s = useFlightStore.getState();
    const fov = camera.fov;
    const h = runtime.height;

    // Orbit lines are drawn from the same orbits the bodies follow, so each body sits on its line.
    const day = data.day;
    if (Number.isFinite(day) && !(Math.abs(day - orbitsDrawnFor.current) < ORBIT_REDRAW_DAYS)) {
      orbitsDrawnFor.current = day;
      for (const o of orbits) drawOrbit(o, day);
    }

    // Minimum on-screen size: scale a body up when its true size would drop below its pixel floor.
    let earthIdx = -1;
    let moonBody: Body | null = null;
    for (const b of bodies) {
      // Bodies move with the map's date.
      b.group.position.set(data.pos[b.index * 3], data.pos[b.index * 3 + 1], data.pos[b.index * 3 + 2]);
      const dist = Math.max(camera.position.distanceTo(b.group.position), 1e-9);
      const k = pxPerUnit(dist, h, fov);
      const truePx = b.radius * k;
      const scale = truePx < b.minPx ? b.minPx / Math.max(truePx, 1e-9) : 1;
      b.group.scale.setScalar(scale);
      runtime.radiusPx[b.index] = Math.max(truePx, b.minPx);
      if (b.name === 'Earth') earthIdx = b.index;
      if (b.name === 'Moon') moonBody = b;
    }
    // Hide the Moon while it would sit on top of Earth.
    if (moonBody && earthIdx >= 0) {
      const mi = moonBody.index;
      const dx = runtime.sx[mi] - runtime.sx[earthIdx];
      const dy = runtime.sy[mi] - runtime.sy[earthIdx];
      const sep = Math.sqrt(dx * dx + dy * dy);
      moonBody.group.visible = sep > runtime.radiusPx[earthIdx] + 5;
    }

    const orbitColor = runtime.colors.orbit.value;
    const on = s.layers.orbits;
    for (const o of orbits) {
      const isEnd = s.origin?.id === o.id || s.destination?.id === o.id;
      const target = on ? (isEnd ? 0.6 : o.base) : 0;
      const m = o.material;
      m.opacity = reduced ? target : m.opacity + (target - m.opacity) * (1 - Math.exp(-dt * 7));
      if (Math.abs(m.opacity - target) < 0.003) m.opacity = target;
      // LineBasicMaterial colors are linear; the token is sRGB.
      m.color.setRGB(orbitColor.x, orbitColor.y, orbitColor.z, THREE.SRGBColorSpace);
      o.line.visible = m.opacity > 0.002;
    }
  });

  return (
    <>
      <ambientLight intensity={0.35} />
      <pointLight position={[0, 0, 0]} intensity={3} decay={0} />
      <primitive object={root} />
    </>
  );
};
