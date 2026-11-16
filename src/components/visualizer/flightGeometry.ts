import * as THREE from 'three';
import type { FlightState } from '../../state/useFlightStore';
import { bodyPosition } from '../../physics/ephemeris';
import { prefersReducedMotion } from '../../lib/motion';
import { indexByName, setSystemicDay } from './sceneData';
import { MAX_PATH_POINTS, MapRuntime } from './mapRuntime';

/**
 * Where the flight is in space and time, for the map: the date the solar-system map should show,
 * the flight path as scene-space points, and the ship's place along it.
 */

type FlightView = Pick<FlightState, 'regime' | 'origin' | 'destination' | 'profile' | 'plan' | 'progress' | 'playing' | 'departureDay'>;

const SECONDS_PER_DAY = 86400;

/** The date (day number) the solar-system map should show: the launch date, moving on as the flight plays. */
export function mapDayTarget(s: FlightView): number {
  if (s.plan && s.profile) return s.plan.launchDay + (s.progress * s.profile.totalTime) / SECONDS_PER_DAY;
  return s.departureDay;
}

/**
 * Once per frame, before anything else draws: move the solar-system bodies to the map's date.
 * A change of launch date sweeps the planets along their orbits instead of jumping; during
 * playback and scrubbing the date follows the flight exactly.
 */
export function stepMapDay(runtime: MapRuntime, s: FlightView, dt: number): void {
  if (runtime.regime !== 'Systemic' || s.regime !== 'Systemic') return;
  const target = mapDayTarget(s);
  const exact = s.playing || s.progress > 0 || prefersReducedMotion() || !Number.isFinite(runtime.shownDay);
  if (exact || Math.abs(target - runtime.shownDay) < 0.02) runtime.shownDay = target;
  else runtime.shownDay += (target - runtime.shownDay) * (1 - Math.exp(-dt * 6));
  setSystemicDay(runtime.data, runtime.shownDay);
}

/**
 * Fill `runtime.path` with the flight path in scene coordinates.
 * - Star map (no trajectory): a straight line between the two objects.
 * - Solar-system map: the trajectory's own points. Paths measured from a body (the Earth-Moon
 *   trips) ride along with that body.
 */
export function fillPath(runtime: MapRuntime, s: FlightView): void {
  const path = runtime.path;
  const data = runtime.data;
  const pos = data.pos;
  const oi = s.origin ? data.index.get(s.origin.id) ?? -1 : -1;
  const di = s.destination ? data.index.get(s.destination.id) ?? -1 : -1;
  if (oi < 0 || di < 0 || oi === di) {
    path.count = 0;
    return;
  }
  const out = path.points;
  const t = runtime.regime === 'Systemic' ? s.profile?.trajectory : undefined;
  if (!t) {
    out[0] = pos[oi * 3];
    out[1] = pos[oi * 3 + 1];
    out[2] = pos[oi * 3 + 2];
    out[3] = pos[di * 3];
    out[4] = pos[di * 3 + 1];
    out[5] = pos[di * 3 + 2];
    path.count = 2;
    return;
  }
  let fx = 0;
  let fy = 0;
  let fz = 0;
  if (t.frame) {
    const fi = indexByName(data, t.frame);
    if (fi >= 0) {
      fx = pos[fi * 3];
      fy = pos[fi * 3 + 1];
      fz = pos[fi * 3 + 2];
    }
  }
  const n = Math.min(t.count, MAX_PATH_POINTS);
  const p = t.points;
  for (let k = 0; k < n; k++) {
    // Ecliptic (x, y, z) to scene (x, z, -y).
    out[k * 3] = fx + p[k * 3];
    out[k * 3 + 1] = fy + p[k * 3 + 2];
    out[k * 3 + 2] = fz - p[k * 3 + 1];
  }
  path.count = n;
}

/** How far along the path's points (0..1) the ship is, or -1 when the ship is not shown. */
export function shipParam(s: Pick<FlightState, 'profile' | 'progress' | 'playing'>): number {
  const p = s.profile;
  if (!p || !(p.distance > 0)) return -1;
  if (s.progress <= 0 && !s.playing) return -1;
  const u = p.trajectory ? p.trajectory.paramAt(s.progress) : p.atFraction(s.progress).x / p.distance;
  return Math.min(Math.max(u, 0), 1);
}

const scratch = [0, 0, 0];
const tmp = new THREE.Vector3();

/**
 * The sphere the camera should frame to show the whole flight: the path, plus where the
 * destination is at launch and where the origin is on arrival, so both stay in view while the
 * flight plays. Writes the centre into `centre` and the route's general direction into `dir`;
 * returns the radius (scene units), or -1 when there is no route.
 */
export function flightBounds(runtime: MapRuntime, s: FlightView, centre: THREE.Vector3, dir: THREE.Vector3): number {
  fillPath(runtime, s);
  const { count, points } = runtime.path;
  if (count < 2) return -1;
  const box = new THREE.Box3();
  for (let k = 0; k < count; k++) box.expandByPoint(tmp.set(points[k * 3], points[k * 3 + 1], points[k * 3 + 2]));
  const t = s.profile?.trajectory;
  // Paths that ride along with a body (Earth-Moon) are framed on their own: the camera follows the body.
  if (runtime.regime === 'Systemic' && s.plan && t && !t.frame && s.origin && s.destination) {
    bodyPosition(s.destination.name, s.plan.launchDay, scratch);
    box.expandByPoint(tmp.set(scratch[0], scratch[2], -scratch[1]));
    bodyPosition(s.origin.name, s.plan.arrivalDay, scratch);
    box.expandByPoint(tmp.set(scratch[0], scratch[2], -scratch[1]));
  }
  box.getCenter(centre);
  let radius = 0;
  for (let k = 0; k < count; k++) radius = Math.max(radius, centre.distanceTo(tmp.set(points[k * 3], points[k * 3 + 1], points[k * 3 + 2])));
  radius = Math.max(radius, centre.distanceTo(box.min) * 0.75);
  const last = (count - 1) * 3;
  dir.set(points[last] - points[0], points[last + 1] - points[1], points[last + 2] - points[2]);
  if (dir.lengthSq() > 1e-30) dir.normalize();
  return radius;
}
