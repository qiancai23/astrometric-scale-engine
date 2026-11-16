import * as THREE from 'three';
import type { AstrometricRegime } from '../../types';
import { Insets, SafeRect, safeRect } from './mapMath';
import { RegimeData, regimeData, srgb } from './sceneData';
import type { SceneTokens } from '../../lib/tokens';

/**
 * Mutable state shared by the 3D scene (inside the R3F canvas) and the DOM overlays around it.
 * Nothing here is React state: the render loop reads and writes it every frame, so the map never
 * re-renders React per frame.
 */

export interface OverlayElements {
  canvasWrap: HTMLDivElement | null;
  labelLayer: HTMLDivElement | null;
  originRing: HTMLDivElement | null;
  destRing: HTMLDivElement | null;
  originLabel: HTMLDivElement | null;
  destLabel: HTMLDivElement | null;
  hoverRing: HTMLDivElement | null;
  hoverLabel: HTMLDivElement | null;
  hoverName: HTMLSpanElement | null;
  hoverMeta: HTMLSpanElement | null;
  reticle: HTMLDivElement | null;
  card: HTMLDivElement | null;
  ship: HTMLDivElement | null;
  shipTag: HTMLDivElement | null;
  markerA: HTMLDivElement | null;
  markerB: HTMLDivElement | null;
  markerALabel: HTMLSpanElement | null;
  markerBLabel: HTMLSpanElement | null;
  beacon: HTMLDivElement | null;
  beaconChip: HTMLDivElement | null;
  beaconChipName: HTMLSpanElement | null;
  beaconArrow: HTMLSpanElement | null;
  burst: HTMLDivElement | null;
  scaleBar: HTMLDivElement | null;
  scaleLabel: HTMLSpanElement | null;
}

/** Most points a flight path can have. */
export const MAX_PATH_POINTS = 512;

/** A token color that glides to its new value when the drive changes. */
export class LerpColor {
  readonly value = new THREE.Vector3(1, 1, 1);
  readonly target = new THREE.Vector3(1, 1, 1);
  private initialised = false;
  set(css: string): void {
    srgb(css, this.target);
    if (!this.initialised) {
      this.value.copy(this.target);
      this.initialised = true;
    }
  }
  /** Exponential approach; about 600 ms to settle. */
  step(dt: number, instant: boolean): void {
    if (instant) {
      this.value.copy(this.target);
      return;
    }
    const k = 1 - Math.exp(-dt * 7);
    this.value.lerp(this.target, k);
  }
}

export class MapRuntime {
  width = 1;
  height = 1;
  dpr = 1;
  insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  regime: AstrometricRegime;
  data: RegimeData;

  /** Screen positions (CSS px) of every entry of the current regime, refreshed each frame. */
  sx = new Float32Array(0);
  sy = new Float32Array(0);
  /** 1 when the entry is in front of the camera. */
  front = new Uint8Array(0);
  /** On-screen radius (CSS px) of mesh bodies, 0 for points. */
  radiusPx = new Float32Array(0);

  /** Pointer position over the map (CSS px), and whether it is over the canvas. */
  pointerX = -1;
  pointerY = -1;
  pointerInside = false;
  pointerDown = false;

  /** performance.now() of the last user input on the map. */
  lastInteraction = performance.now();
  /** True when the user has moved the camera since the last automatic framing. */
  userMoved = false;
  /** Set by the camera rig when a camera flight is running. */
  cameraFlying = false;
  /** Incremented when the user grabs the camera; the rig cancels any flight. */
  userInputSerial = 0;

  /** Zoom requests from the control buttons (ratio of camera distance), consumed by the rig. */
  pendingZoom = 1;

  /** Current orbit-target distance and metres per CSS px at the target (for the scale bar). */
  targetDistance = 1;

  /** performance.now() when the last arrival burst started (0 = none). */
  burstStart = 0;

  /** Day number the solar-system map is showing (eases toward the flight's date). NaN before the first frame. */
  shownDay = NaN;

  /**
   * The flight path as a polyline in scene coordinates, refreshed every frame (see
   * `flightGeometry.ts`). Two points for a straight flight, a few hundred for an orbit or spiral.
   */
  readonly path = { count: 0, points: new Float32Array(3 * MAX_PATH_POINTS), screenLength: 1000 };

  /**
   * The point a fraction `u` (0..1) of the way along the path's points, written into `out`.
   * Returns false when there is no path.
   */
  pathPoint(u: number, out: THREE.Vector3): boolean {
    const { count, points } = this.path;
    if (count < 2) return false;
    const x = Math.min(Math.max(u, 0), 1) * (count - 1);
    const k = Math.min(Math.floor(x), count - 2);
    const w = x - k;
    const a = k * 3;
    out.set(
      points[a] + (points[a + 3] - points[a]) * w,
      points[a + 1] + (points[a + 4] - points[a + 1]) * w,
      points[a + 2] + (points[a + 5] - points[a + 2]) * w,
    );
    return true;
  }

  readonly colors = {
    accent: new LerpColor(),
    accentSoft: new LerpColor(),
    accentPale: new LerpColor(),
    origin: new LerpColor(),
    muted: new LerpColor(),
    orbit: new LerpColor(),
    background: new LerpColor(),
  };

  readonly dom: OverlayElements = {
    canvasWrap: null,
    labelLayer: null,
    originRing: null,
    destRing: null,
    originLabel: null,
    destLabel: null,
    hoverRing: null,
    hoverLabel: null,
    hoverName: null,
    hoverMeta: null,
    reticle: null,
    card: null,
    ship: null,
    shipTag: null,
    markerA: null,
    markerB: null,
    markerALabel: null,
    markerBLabel: null,
    beacon: null,
    beaconChip: null,
    beaconChipName: null,
    beaconArrow: null,
    burst: null,
    scaleBar: null,
    scaleLabel: null,
  };

  constructor(regime: AstrometricRegime) {
    this.regime = regime;
    this.data = regimeData(regime);
    this.resizeArrays();
  }

  setRegime(regime: AstrometricRegime): void {
    if (regime === this.regime) return;
    this.regime = regime;
    this.data = regimeData(regime);
    this.resizeArrays();
  }

  private resizeArrays(): void {
    const n = this.data.entries.length;
    this.sx = new Float32Array(n);
    this.sy = new Float32Array(n);
    this.front = new Uint8Array(n);
    this.radiusPx = new Float32Array(n);
  }

  applyTokens(t: SceneTokens): void {
    this.colors.accent.set(t.accent);
    this.colors.accentSoft.set(t.accentSoft);
    this.colors.accentPale.set(t.accentPale);
    this.colors.origin.set(t.origin);
    this.colors.muted.set(t.muted);
    this.colors.orbit.set(t.orbit);
    this.colors.background.set(t.background);
  }

  stepColors(dt: number, instant: boolean): void {
    for (const c of Object.values(this.colors)) c.step(dt, instant);
  }

  safe(): SafeRect {
    return safeRect(this.width, this.height, this.insets);
  }

  /** Any user input on the map: resets the idle timer. */
  touch(): void {
    this.lastInteraction = performance.now();
  }

  /** The user grabbed or zoomed the camera: cancel automatic camera motion. */
  userCameraInput(): void {
    this.lastInteraction = performance.now();
    this.userMoved = true;
    this.userInputSerial++;
  }
}

/** Read the shell's --map-inset-* custom properties (px) from the nearest .app-shell. */
export function readInsets(from: Element | null, out: Insets): boolean {
  const shell = from?.closest('.app-shell') ?? null;
  if (!shell) return false;
  const style = getComputedStyle(shell);
  const px = (name: string): number => {
    const raw = style.getPropertyValue(name).trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const next = {
    top: px('--map-inset-top'),
    right: px('--map-inset-right'),
    bottom: px('--map-inset-bottom'),
    left: px('--map-inset-left'),
  };
  const changed =
    Math.abs(next.top - out.top) > 0.5 ||
    Math.abs(next.right - out.right) > 0.5 ||
    Math.abs(next.bottom - out.bottom) > 0.5 ||
    Math.abs(next.left - out.left) > 0.5;
  Object.assign(out, next);
  return changed;
}
