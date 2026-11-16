import { useEffect, useState } from 'react';
import { useFlightStore } from '../state/useFlightStore';

/**
 * Design tokens for code that cannot use CSS directly (the 3D scene, canvas drawing).
 * Every color in the interface, including inside the 3D map, comes from the CSS variables in
 * src/index.css. This module reads them at runtime so the scene follows the same token set and
 * switches with the drive type (cyan for sublight, amber for warp).
 */

export interface SceneTokens {
  /** Page background behind the map. */
  background: string;
  /** Accent of the active drive (cyan sublight, amber warp). Flight path, destination, ship. */
  accent: string;
  /** Lighter accent for glows and highlights. */
  accentSoft: string;
  /** Near-white core of the ship marker. */
  accentPale: string;
  /** Origin marker and primary labels. */
  origin: string;
  /** Secondary labels, flip marker, scale bar. */
  muted: string;
  /** Orbit lines. */
  orbit: string;
  /** Hover and selection rings. */
  highlight: string;
}

const read = (style: CSSStyleDeclaration, name: string, fallback: string): string => {
  const value = style.getPropertyValue(name).trim();
  return value || fallback;
};

/** Read the scene tokens from the document as they are right now. */
export function readSceneTokens(): SceneTokens {
  if (typeof document === 'undefined') {
    return {
      background: '#04060c',
      accent: '#22d3ee',
      accentSoft: '#67e8f9',
      accentPale: '#ecfeff',
      origin: '#e8edf5',
      muted: '#a3b0c2',
      orbit: '#7c8aa0',
      highlight: '#e8edf5',
    };
  }
  const style = getComputedStyle(document.documentElement);
  const warp = document.documentElement.getAttribute('data-drive') === 'Warp';
  // Read the per-drive source tokens rather than --color-accent-active: the active token
  // cross-fades over a few hundred milliseconds and would be caught mid-transition.
  return {
    background: read(style, '--color-bg-base', '#04060c'),
    accent: read(style, warp ? '--color-accent-warp' : '--color-accent-sublight', '#22d3ee'),
    accentSoft: read(style, warp ? '--color-accent-warp-soft' : '--color-accent-sublight-soft', '#67e8f9'),
    accentPale: read(style, warp ? '--color-accent-warp-pale' : '--color-accent-sublight-pale', '#ecfeff'),
    origin: read(style, '--color-text-primary', '#e8edf5'),
    muted: read(style, '--color-text-muted', '#a3b0c2'),
    orbit: read(style, '--color-scene-orbit', '#7c8aa0'),
    highlight: read(style, '--color-text-primary', '#e8edf5'),
  };
}

/** Scene tokens that update when the drive type changes. */
export function useSceneTokens(): SceneTokens {
  const driveCore = useFlightStore((s) => s.driveCore);
  const [tokens, setTokens] = useState<SceneTokens>(readSceneTokens);
  useEffect(() => {
    // The data-drive attribute is set in an effect by the shell; read on the next frame so it has landed.
    const id = requestAnimationFrame(() => setTokens(readSceneTokens()));
    return () => cancelAnimationFrame(id);
  }, [driveCore]);
  return tokens;
}
