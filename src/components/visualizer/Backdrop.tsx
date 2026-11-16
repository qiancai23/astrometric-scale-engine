import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useFlightStore } from '../../state/useFlightStore';
import { prefersReducedMotion } from '../../lib/motion';
import type { MapRuntime } from './mapRuntime';

const TEXTURE_URL = `${import.meta.env.BASE_URL}assets/textures/milky_way_2k.jpg`;

/**
 * The Milky Way photograph behind the map, applied through scene.background (never a big sphere
 * mesh, which fights the depth range). Dimmed hard so it reads as atmosphere. Fades with the
 * `milkyWay` layer. If the texture fails to load the map simply keeps its plain background.
 */
export const Backdrop: React.FC<{ runtime: MapRuntime }> = ({ runtime }) => {
  const scene = useThree((s) => s.scene);
  const texture = useRef<THREE.Texture | null>(null);
  const intensity = useRef(0);
  const plain = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      TEXTURE_URL,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        texture.current = tex;
      },
      undefined,
      () => {
        texture.current = null;
      },
    );
    return () => {
      cancelled = true;
      if (texture.current) texture.current.dispose();
      texture.current = null;
      scene.background = null;
    };
  }, [scene]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const s = useFlightStore.getState();
    const bg = runtime.colors.background.value;
    plain.setRGB(bg.x, bg.y, bg.z, THREE.SRGBColorSpace);

    const tex = texture.current;
    const target = tex && s.layers.milkyWay ? (s.regime === 'Systemic' ? 0.13 : 0.18) : 0;
    const reduced = prefersReducedMotion();
    intensity.current = reduced ? target : intensity.current + (target - intensity.current) * (1 - Math.exp(-dt * 3));
    if (Math.abs(intensity.current - target) < 0.002) intensity.current = target;

    if (tex && intensity.current > 0.003) {
      if (scene.background !== tex) {
        scene.background = tex;
        scene.backgroundRotation.set(0, Math.PI / 2, 0);
      }
      scene.backgroundIntensity = intensity.current;
    } else if (scene.background !== plain) {
      scene.background = plain;
      scene.backgroundIntensity = 1;
    }
  });

  return null;
};
