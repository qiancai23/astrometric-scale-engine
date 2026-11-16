import React, { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useFlightStore } from '../../state/useFlightStore';
import { prefersReducedMotion } from '../../lib/motion';
import { pointFragment, pointVertex } from './shaders';
import type { PointBuffers } from './sceneData';
import type { MapRuntime } from './mapRuntime';

function makeGeometry(b: PointBuffers): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(b.position, 3));
  g.setAttribute('color', new THREE.BufferAttribute(b.color, 3));
  g.setAttribute('size', new THREE.BufferAttribute(b.size, 1));
  g.setAttribute('core', new THREE.BufferAttribute(b.core, 1));
  g.setAttribute('shape', new THREE.BufferAttribute(b.shape, 1));
  g.setAttribute('phase', new THREE.BufferAttribute(b.phase, 1));
  g.setAttribute('twinkle', new THREE.BufferAttribute(b.twinkle, 1));
  g.computeBoundingSphere();
  return g;
}

function makeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDpr: { value: 1 },
      uTwinkle: { value: 1 },
      uScale: { value: 1 },
      uOpacity: { value: 0 },
    },
    vertexShader: pointVertex,
    fragmentShader: pointFragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * The star map's point layers: one THREE.Points for the field (stars, deep-sky glyphs, spacecraft,
 * small bodies) and one for exoplanets. Sprites keep a fixed pixel size at every zoom.
 */
export const StarField: React.FC<{ runtime: MapRuntime }> = ({ runtime }) => {
  const gl = useThree((s) => s.gl);
  const data = runtime.data;

  const field = useMemo(() => {
    const points = new THREE.Points(makeGeometry(data.field), makeMaterial());
    points.frustumCulled = false;
    points.renderOrder = 2;
    return points;
  }, [data]);

  const exo = useMemo(() => {
    const points = new THREE.Points(makeGeometry(data.exo), makeMaterial());
    points.frustumCulled = false;
    points.renderOrder = 3;
    points.visible = false;
    return points;
  }, [data]);

  useEffect(
    () => () => {
      field.geometry.dispose();
      (field.material as THREE.Material).dispose();
      exo.geometry.dispose();
      (exo.material as THREE.Material).dispose();
    },
    [field, exo],
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const reduced = prefersReducedMotion();
    const dpr = gl.getPixelRatio();
    const layers = useFlightStore.getState().layers;

    const fm = field.material as THREE.ShaderMaterial;
    fm.uniforms.uTime.value = state.clock.elapsedTime;
    fm.uniforms.uDpr.value = dpr;
    fm.uniforms.uTwinkle.value = reduced ? 0 : 1;
    // Field fades in on load and on a map change.
    const fo = fm.uniforms.uOpacity;
    fo.value = reduced ? 1 : Math.min(1, fo.value + dt / 0.9);

    const em = exo.material as THREE.ShaderMaterial;
    em.uniforms.uDpr.value = dpr;
    const eo = em.uniforms.uOpacity;
    const target = layers.exoplanets ? 0.85 : 0;
    eo.value = reduced ? target : eo.value + (target - eo.value) * (1 - Math.exp(-dt * 8));
    if (Math.abs(eo.value - target) < 0.004) eo.value = target;
    exo.visible = eo.value > 0.001 && data.exo.indices.length > 0;
  });

  return (
    <>
      <primitive object={field} />
      <primitive object={exo} />
    </>
  );
};
