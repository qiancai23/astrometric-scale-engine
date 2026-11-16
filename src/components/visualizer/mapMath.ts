import { formatCount, formatDistance, AU_METERS, LIGHTYEAR_METERS } from '../../lib/format';

/** The uncovered part of the window, in CSS px from the map's top-left corner. */
export interface SafeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The rectangle not covered by panels. Falls back to the whole viewport when the insets would
 * leave an unusably small area (a wrong inset degrades to "use the whole window").
 */
export function safeRect(width: number, height: number, insets: Insets): SafeRect {
  let left = insets.left;
  let right = width - insets.right;
  let top = insets.top;
  let bottom = height - insets.bottom;
  if (right - left < Math.min(160, width * 0.4)) {
    left = 0;
    right = width;
  }
  if (bottom - top < Math.min(140, height * 0.35)) {
    top = 0;
    bottom = height;
  }
  return { left, top, right, bottom };
}

/**
 * Camera distance at which a sphere of radius `radius` (scene units) around the orbit target
 * spans `diameterPx` CSS px on a viewport `viewportHeight` px tall with vertical field of view
 * `fovDeg`. Pixels per unit at distance D are (H/2) / (D·tan(fov/2)), so
 * D = radius · H / (diameterPx · tan(fov/2)).
 */
export function distanceToFit(radius: number, diameterPx: number, viewportHeight: number, fovDeg: number): number {
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360);
  const d = Math.max(diameterPx, 40);
  return (radius * viewportHeight) / (d * tanHalf);
}

/** CSS px per scene unit at camera distance `distance`. */
export function pxPerUnit(distance: number, viewportHeight: number, fovDeg: number): number {
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360);
  return viewportHeight / 2 / Math.max(distance * tanHalf, 1e-12);
}

/** Diameter (px) the flight should occupy inside the safe rect, leaving room for the end labels. */
export function framingDiameter(rect: SafeRect): number {
  const w = rect.right - rect.left;
  const h = rect.bottom - rect.top;
  const labelRoom = Math.min(w - 2 * 110, h * 0.7);
  return Math.max(labelRoom, Math.min(w, h) * 0.38);
}

/* ------------------------------------------------------------------ */
/* Scale bar                                                           */
/* ------------------------------------------------------------------ */

export interface ScaleBarValue {
  /** Bar width in CSS px. */
  width: number;
  label: string;
}

/** Largest 1-2-5 × 10ⁿ number not above `max`. */
function niceFloor(max: number): number {
  if (!(max > 0)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const m = max / p;
  const step = m >= 5 ? 5 : m >= 2 ? 2 : 1;
  return step * p;
}

/**
 * A round distance for the scale bar given metres per CSS px and the longest bar allowed.
 * Units follow formatDistance's own thresholds (km below 0.01 AU, AU below 0.1 ly, then ly) so
 * the label always reads as the round number it is.
 */
export function scaleBarFor(metersPerPx: number, maxWidthPx = 120): ScaleBarValue | null {
  if (!(metersPerPx > 0) || !Number.isFinite(metersPerPx)) return null;
  const maxMeters = metersPerPx * maxWidthPx;
  let meters: number;
  let label: string;
  if (maxMeters < 0.01 * AU_METERS) {
    const km = niceFloor(maxMeters / 1000);
    meters = km * 1000;
    label = formatDistance(meters);
  } else if (maxMeters < 0.1 * LIGHTYEAR_METERS) {
    const au = niceFloor(maxMeters / AU_METERS);
    meters = au * AU_METERS;
    label = formatDistance(meters);
    if (au < 100) label += ` · ${formatCount(meters / 1000, 2)} km`;
  } else {
    const ly = niceFloor(maxMeters / LIGHTYEAR_METERS);
    meters = ly * LIGHTYEAR_METERS;
    label = formatDistance(meters, { long: true });
  }
  if (!(meters > 0)) return null;
  return { width: meters / metersPerPx, label };
}
