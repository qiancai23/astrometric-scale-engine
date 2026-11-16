import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useFlightStore } from '../../state/useFlightStore';
import { getEntry, labelCandidates } from '../../data/catalog';
import { formatDistance, formatSpeed } from '../../lib/format';
import { useIsCompact } from '../../lib/motion';
import { LabelPool, LABEL_GAP, LABEL_HEIGHT, labelWidth } from './labels';
import { metersPerUnit } from './sceneData';
import { pxPerUnit, scaleBarFor, SafeRect } from './mapMath';
import { shipFraction } from './FlightPath';
import type { MapRuntime } from './mapRuntime';

/* ------------------------------------------------------------------ */
/* Picking                                                             */
/* ------------------------------------------------------------------ */

const PICK_RADIUS = 14;

/**
 * Screen-space picking on last frame's projected positions: the nearest object within about
 * 14 CSS px (more for large planet discs), preferring well-known objects when several are close.
 * Returns an entry index or -1.
 */
export function pickAt(runtime: MapRuntime, x: number, y: number, exoplanets: boolean): number {
  const { sx, sy, front, radiusPx } = runtime;
  const { prominence, isExo } = runtime.data;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < sx.length; i++) {
    if (!front[i]) continue;
    if (isExo[i] && !exoplanets) continue;
    const dx = sx[i] - x;
    const dy = sy[i] - y;
    const r = Math.max(PICK_RADIUS, radiusPx[i] + 6);
    const d2 = dx * dx + dy * dy;
    if (d2 > r * r) continue;
    const score = Math.sqrt(d2) - prominence[i] * 8 - (radiusPx[i] > 0 ? 4 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Small DOM helpers (allocation-free in the hot path)                 */
/* ------------------------------------------------------------------ */

interface Placed {
  x: number;
  y: number;
  vis: boolean;
}

const placedCache = new WeakMap<HTMLElement, Placed>();

/** Move an element to (x, y) and show or hide it, touching the DOM only when something changed. */
function place(el: HTMLElement | null, x: number, y: number, visible: boolean): void {
  if (!el) return;
  let p = placedCache.get(el);
  if (!p) {
    p = { x: NaN, y: NaN, vis: !el.classList.contains('is-hidden') };
    placedCache.set(el, p);
  }
  if (visible !== p.vis) {
    p.vis = visible;
    el.classList.toggle('is-hidden', !visible);
  }
  if (!visible) return;
  const rx = Math.round(x * 2) / 2;
  const ry = Math.round(y * 2) / 2;
  if (rx === p.x && ry === p.y) return;
  p.x = rx;
  p.y = ry;
  el.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
}

/** Anchor a label by its right edge (it sits to the left of its point). */
function setLeft(el: HTMLElement | null, left: boolean): void {
  if (el && el.classList.contains('is-left') !== left) el.classList.toggle('is-left', left);
}

function setText(el: HTMLElement | null, text: string): void {
  if (el && el.textContent !== text) el.textContent = text;
}

/** Rectangles already taken on screen this frame: [left, top, right, bottom] × n. */
class RectList {
  private data = new Float32Array(4 * 128);
  count = 0;
  reset(): void {
    this.count = 0;
  }
  add(l: number, t: number, r: number, b: number): void {
    if (this.count >= 128) return;
    const k = this.count * 4;
    this.data[k] = l;
    this.data[k + 1] = t;
    this.data[k + 2] = r;
    this.data[k + 3] = b;
    this.count++;
  }
  hits(l: number, t: number, r: number, b: number, pad: number): boolean {
    const d = this.data;
    for (let i = 0; i < this.count; i++) {
      const k = i * 4;
      if (l - pad < d[k + 2] && r + pad > d[k] && t - pad < d[k + 3] && b + pad > d[k + 1]) return true;
    }
    return false;
  }
}

const inside = (rect: SafeRect, l: number, t: number, r: number, b: number, m: number): boolean =>
  l >= rect.left + m && r <= rect.right - m && t >= rect.top + m && b <= rect.bottom - m;

/** Endpoint label width: tag + gap + name. */
const endpointLabelWidth = (tag: string, name: string): number => labelWidth(tag) + 20 + labelWidth(name);

const viewProj = new THREE.Matrix4();

/**
 * Runs once per frame after the camera: projects every object to the screen, picks the object
 * under the pointer, culls and places labels, and positions every DOM overlay (rings, markers,
 * ship, card, beacon, scale bar).
 */
export const OverlayDriver: React.FC<{ runtime: MapRuntime }> = ({ runtime }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const compact = useIsCompact();
  const pool = useRef<LabelPool | null>(null);
  const state = useRef({
    hoverIdx: -1,
    hoverSetByMap: null as string | null,
    hoverShownIdx: -2,
    arrival: useFlightStore.getState().arrivalCount,
    markerKey: '',
    scaleLabel: '',
    scaleWidth: -1,
    cardW: 300,
    cardH: 200,
    cardFor: '' as string,
    cardMeasure: 0,
    speedText: '',
    lastCursor: '',
  });

  const candidates = useMemo(() => {
    const list = labelCandidates(runtime.regime);
    const idx: number[] = [];
    const names: string[] = [];
    const widths: number[] = [];
    for (const e of list) {
      const i = runtime.data.index.get(e.id);
      if (i === undefined) continue;
      idx.push(i);
      names.push(e.name);
      widths.push(labelWidth(e.name));
    }
    return { idx, names, widths };
  }, [runtime.regime, runtime.data]);

  useEffect(
    () => () => {
      pool.current?.dispose();
      pool.current = null;
    },
    [],
  );

  useEffect(() => {
    pool.current?.clear();
  }, [candidates]);

  const rects = useMemo(() => new RectList(), []);
  const posOut = useMemo(() => ({ x: 0, y: 0, ok: false }), []);

  useFrame(() => {
    const s = useFlightStore.getState();
    if (s.regime !== runtime.regime) return;
    const st = state.current;
    const dom = runtime.dom;
    const data = runtime.data;
    const W = runtime.width;
    const H = runtime.height;
    const now = performance.now();

    /* ---- 1. Project every object ---- */
    camera.updateMatrixWorld();
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const e = viewProj.elements;
    const pos = data.pos;
    const { sx, sy, front } = runtime;
    const n = data.entries.length;
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const z = pos[i * 3 + 2];
      const cx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const cy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
      const ok = cw > 1e-12;
      const w = ok ? cw : Math.max(-cw, 1e-12);
      front[i] = ok ? 1 : 0;
      sx[i] = ((cx / w) * 0.5 + 0.5) * W;
      sy[i] = (0.5 - (cy / w) * 0.5) * H;
    }
    const onScreen = (i: number, m = 0): boolean => i >= 0 && front[i] === 1 && sx[i] >= -m && sx[i] <= W + m && sy[i] >= -m && sy[i] <= H + m;
    const rect = runtime.safe();

    /* ---- 2. Hover picking (one pass per frame) ---- */
    let hoverIdx = -1;
    if (runtime.pointerInside && !runtime.pointerDown) {
      hoverIdx = pickAt(runtime, runtime.pointerX, runtime.pointerY, s.layers.exoplanets);
      const id = hoverIdx >= 0 ? data.entries[hoverIdx].id : null;
      if (id !== s.hoveredId) {
        s.setHovered(id);
        st.hoverSetByMap = id;
      }
    } else if (st.hoverSetByMap !== null && s.hoveredId === st.hoverSetByMap) {
      s.setHovered(null);
      st.hoverSetByMap = null;
    }
    // Draw the hover state for whatever the store says is hovered (panels can set it too).
    const hId = s.hoveredId;
    const hIdx = hId ? data.index.get(hId) ?? -1 : -1;
    const wrap = dom.canvasWrap;
    if (wrap) {
      const cursor = runtime.pointerDown ? 'grabbing' : hoverIdx >= 0 ? 'pointer' : 'grab';
      if (cursor !== st.lastCursor) {
        st.lastCursor = cursor;
        wrap.style.cursor = cursor;
      }
    }

    /* ---- 3. Origin and destination ---- */
    const oi = s.origin ? data.index.get(s.origin.id) ?? -1 : -1;
    const di = s.destination ? data.index.get(s.destination.id) ?? -1 : -1;
    rects.reset();
    const oVis = onScreen(oi, 40);
    const dVis = onScreen(di, 40);
    // Each endpoint label sits on the side facing away from the other end, so it never covers the path.
    const destRight = oi >= 0 && di >= 0 && front[oi] && front[di] ? sx[di] >= sx[oi] : true;
    const oName = s.origin?.name ?? '';
    const dName = s.destination?.name ?? '';
    const oW = endpointLabelWidth('origin', oName);
    const dW = endpointLabelWidth('destination', dName);
    const ringR = 14;
    // Place an endpoint label beside its ring on the side away from the other end. If that side
    // would run under a panel or off the window, put it under (or over) the ring instead,
    // slid sideways to stay inside the uncovered part of the map.
    const placeEndLabel = (label: HTMLDivElement | null, x: number, y: number, w: number, awayLeft: boolean, otherY: number) => {
      const m = 8;
      // The zoom buttons occupy the bottom-right corner of the uncovered area and the scale bar
      // the bottom-left; labels at that height must stop short of them.
      const rightEdge = y > rect.bottom - 200 ? rect.right - 64 : rect.right;
      const leftEdge = y > rect.bottom - 60 ? rect.left + 150 : rect.left;
      const sideX = awayLeft ? x - ringR - 4 - w : x + ringR + 4;
      const fitsSide = awayLeft ? sideX >= leftEdge + m : sideX + w <= rightEdge - m;
      if (fitsSide) {
        place(label, awayLeft ? x - ringR - 4 : x + ringR + 4, y, true);
        setLeft(label, awayLeft);
        rects.add(sideX, y - 10, sideX + w, y + 10);
        return;
      }
      const lx = Math.max(leftEdge + m, Math.min(x - w / 2, rightEdge - m - w));
      // Above or below: whichever side faces away from the other end, if it fits.
      const above = y - ringR - 16;
      const below = y + ringR + 16;
      const aboveFits = above >= rect.top + m + 10;
      const belowFits = below <= rect.bottom - m - 10;
      const wantAbove = otherY > y;
      const ly = wantAbove ? (aboveFits ? above : below) : belowFits ? below : above;
      place(label, lx, ly, true);
      setLeft(label, false);
      rects.add(lx, ly - 10, lx + w, ly + 10);
    };
    if (oVis) {
      const x = sx[oi];
      const y = sy[oi];
      place(dom.originRing, x, y, true);
      placeEndLabel(dom.originLabel, x, y, oW, destRight, di >= 0 ? sy[di] : y);
      rects.add(x - ringR, y - ringR, x + ringR, y + ringR);
    } else {
      place(dom.originRing, 0, 0, false);
      place(dom.originLabel, 0, 0, false);
    }
    if (dVis) {
      const x = sx[di];
      const y = sy[di];
      place(dom.destRing, x, y, true);
      placeEndLabel(dom.destLabel, x, y, dW, !destRight, oi >= 0 ? sy[oi] : y);
      rects.add(x - ringR, y - ringR, x + ringR, y + ringR);
    } else {
      place(dom.destRing, 0, 0, false);
      place(dom.destLabel, 0, 0, false);
    }

    /* ---- 4. Flight markers, ship and its speed tag ---- */
    const profile = s.profile;
    const haveRoute = oi >= 0 && di >= 0 && !!profile && profile.distance > 0;
    // Unit screen direction of the route and a normal pointing up the screen.
    let ux = 1;
    let uy = 0;
    if (haveRoute && front[oi] && front[di]) {
      const ddx = sx[di] - sx[oi];
      const ddy = sy[di] - sy[oi];
      const len = Math.sqrt(ddx * ddx + ddy * ddy);
      if (len > 0.5) {
        ux = ddx / len;
        uy = ddy / len;
      }
    }
    let nx = -uy;
    let ny = ux;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const lerpScreen = (f: number, out: { x: number; y: number; ok: boolean }) => {
      // Project the world point along the route (perspective-correct).
      const x = pos[oi * 3] + (pos[di * 3] - pos[oi * 3]) * f;
      const y = pos[oi * 3 + 1] + (pos[di * 3 + 1] - pos[oi * 3 + 1]) * f;
      const z = pos[oi * 3 + 2] + (pos[di * 3 + 2] - pos[oi * 3 + 2]) * f;
      const cx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const cy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
      out.ok = cw > 1e-12;
      const w = out.ok ? cw : 1;
      out.x = ((cx / w) * 0.5 + 0.5) * W;
      out.y = (0.5 - (cy / w) * 0.5) * H;
    };
    const nearEnd = (x: number, y: number): boolean => {
      const m = 18 + ringR;
      if (oVis && Math.abs(x - sx[oi]) < m && Math.abs(y - sy[oi]) < m && Math.hypot(x - sx[oi], y - sy[oi]) < m) return true;
      if (dVis && Math.abs(x - sx[di]) < m && Math.abs(y - sy[di]) < m && Math.hypot(x - sx[di], y - sy[di]) < m) return true;
      return false;
    };

    // Marker labels sit off the line along its normal, far enough that the text box clears the
    // line whatever the slope of the route.
    const placeMarker = (el: HTMLDivElement | null, labelEl: HTMLSpanElement | null, f: number, text: string) => {
      if (!el) return;
      if (f < 0 || !haveRoute) {
        place(el, 0, 0, false);
        return;
      }
      lerpScreen(f, posOut);
      const vis = posOut.ok && posOut.x > -20 && posOut.x < W + 20 && posOut.y > -20 && posOut.y < H + 20 && !nearEnd(posOut.x, posOut.y);
      place(el, posOut.x, posOut.y, vis);
      const w = labelWidth(text);
      const off = Math.abs(nx) * (w / 2) + Math.abs(ny) * 10 + 10;
      let lx = Math.round(nx * off);
      let ly = Math.round(ny * off);
      // If an endpoint label already occupies that spot, use the other side of the line.
      if (rects.hits(posOut.x + lx - w / 2, posOut.y + ly - 9, posOut.x + lx + w / 2, posOut.y + ly + 9, 2)) {
        lx = -lx;
        ly = -ly;
      }
      // Both sides taken (a short route on a small screen): keep the marker, drop its caption.
      const crowded = rects.hits(posOut.x + lx - w / 2, posOut.y + ly - 9, posOut.x + lx + w / 2, posOut.y + ly + 9, 2);
      if (labelEl) {
        const visibility = crowded ? 'hidden' : 'visible';
        if (labelEl.style.visibility !== visibility) labelEl.style.visibility = visibility;
        setText(labelEl, text);
        const key = `${lx},${ly}`;
        if (labelEl.dataset.offset !== key) {
          labelEl.dataset.offset = key;
          labelEl.style.transform = `translate(calc(-50% + ${lx}px), calc(-50% + ${ly}px))`;
        }
      }
      if (vis && !crowded) rects.add(posOut.x + lx - w / 2, posOut.y + ly - 9, posOut.x + lx + w / 2, posOut.y + ly + 9);
    };
    let fa = -1;
    let fb = -1;
    let ta = '';
    let tb = '';
    if (haveRoute && profile && profile.drive === 'Sublight') {
      if (!profile.hasCoast) {
        fa = 0.5;
        ta = 'FLIP · turn and brake';
      } else {
        const k = profile.accelDistance / profile.distance;
        fa = k;
        fb = 1 - k;
        ta = 'ENGINES OFF · coast';
        tb = 'BRAKE';
      }
    }
    placeMarker(dom.markerA, dom.markerALabel, fa, ta);
    placeMarker(dom.markerB, dom.markerBLabel, fb, tb);

    const ship = shipFraction(s);
    if (ship >= 0 && haveRoute) {
      lerpScreen(ship, posOut);
      const vis = posOut.ok && posOut.x > -30 && posOut.x < W + 30 && posOut.y > -30 && posOut.y < H + 30;
      place(dom.ship, posOut.x, posOut.y, vis);
      if (dom.ship && vis) {
        const angle = Math.round((Math.atan2(uy, ux) * 180) / Math.PI);
        const inner = dom.ship.firstElementChild as HTMLElement | null;
        if (inner && inner.dataset.angle !== String(angle)) {
          inner.dataset.angle = String(angle);
          inner.style.transform = `rotate(${angle}deg)`;
        }
      }
      const showTag = vis && s.progress > 0 && s.progress < 1;
      if (showTag && profile) {
        const text = formatSpeed(profile.atFraction(s.progress).v);
        if (text !== st.speedText) {
          st.speedText = text;
          setText(dom.shipTag, text);
        }
        // Marker labels sit above the line, so the speed tag goes below it.
        const tx = posOut.x - nx * 36;
        const ty = posOut.y - ny * 36;
        place(dom.shipTag, tx, ty, true);
        const w = labelWidth(text) + 12;
        rects.add(tx - w / 2, ty - 20, tx + w / 2, ty);
      } else place(dom.shipTag, 0, 0, false);
    } else {
      place(dom.ship, 0, 0, false);
      place(dom.shipTag, 0, 0, false);
    }

    /* ---- 5. Hover ring and label ---- */
    if (hIdx >= 0 && onScreen(hIdx, 10)) {
      const x = sx[hIdx];
      const y = sy[hIdx];
      place(dom.hoverRing, x, y, true);
      if (st.hoverShownIdx !== hIdx) {
        st.hoverShownIdx = hIdx;
        const entry = data.entries[hIdx];
        const r = Math.max(9, runtime.radiusPx[hIdx] + 5);
        if (dom.hoverRing) dom.hoverRing.style.setProperty('--ring-size', `${Math.round(r * 2)}px`);
        setText(dom.hoverName, entry.name);
        const dist = entry.distanceFromSolMeters > 0 ? ` · ${formatDistance(entry.distanceFromSolMeters)} from the Sun` : '';
        setText(dom.hoverMeta, `${entry.kindLabel}${dist}`);
        // Restart the ring's grow-in.
        dom.hoverRing?.classList.remove('is-pop');
        void dom.hoverRing?.offsetWidth;
        dom.hoverRing?.classList.add('is-pop');
      }
      const r = Math.max(9, runtime.radiusPx[hIdx] + 5);
      // Flip to the left near the right edge of the uncovered area.
      const flip = x + r + 230 > rect.right;
      place(dom.hoverLabel, flip ? x - r - 4 : x + r + 4, y - r - 4, true);
      setLeft(dom.hoverLabel, flip);
    } else {
      st.hoverShownIdx = -2;
      place(dom.hoverRing, 0, 0, false);
      place(dom.hoverLabel, 0, 0, false);
    }

    /* ---- 6. Selection reticle and object card ---- */
    const selIdx = s.selectedId ? data.index.get(s.selectedId) ?? -1 : -1;
    if (selIdx >= 0 && front[selIdx]) {
      const x = sx[selIdx];
      const y = sy[selIdx];
      const vis = onScreen(selIdx, 30);
      place(dom.reticle, x, y, vis);
      if (dom.reticle && vis) dom.reticle.style.setProperty('--ring-size', `${Math.round(Math.max(26, runtime.radiusPx[selIdx] * 2 + 16))}px`);
      const card = dom.card;
      if (card) {
        if (st.cardFor !== s.selectedId || now - st.cardMeasure > 500) {
          st.cardFor = s.selectedId ?? '';
          st.cardMeasure = now;
          st.cardW = card.offsetWidth || st.cardW;
          st.cardH = card.offsetHeight || st.cardH;
        }
        const m = 12;
        let cx = x + 22;
        if (cx + st.cardW > rect.right - m) cx = x - 22 - st.cardW;
        cx = Math.min(Math.max(cx, rect.left + m), rect.right - m - st.cardW);
        let cy = y - st.cardH / 2;
        cy = Math.min(Math.max(cy, rect.top + m), rect.bottom - m - st.cardH);
        if (rect.right - rect.left < st.cardW + 2 * m) cx = rect.left + m;
        place(card, cx, cy, true);
        rects.add(cx, cy, cx + st.cardW, cy + st.cardH);
      }
    } else {
      place(dom.reticle, 0, 0, false);
      // Object behind the camera: keep the card parked inside the safe area. No selection: hide it.
      if (selIdx >= 0) place(dom.card, rect.left + 12, rect.top + 12, true);
      else {
        place(dom.card, 0, 0, false);
        st.cardFor = '';
      }
    }

    /* ---- 7. Name labels with collision culling ---- */
    if (!pool.current && dom.labelLayer) pool.current = new LabelPool(dom.labelLayer, 40);
    const p = pool.current;
    if (p) {
      p.begin();
      if (s.layers.labels) {
        const maxLabels = compact ? 12 : 26;
        let shown = 0;
        const { idx, names, widths } = candidates;
        // Pass 0: labels already showing keep their place (hysteresis); pass 1: newcomers.
        for (let pass = 0; pass < 2 && shown < maxLabels; pass++) {
          for (let k = 0; k < idx.length && shown < maxLabels; k++) {
            const i = idx[k];
            const was = p.isShown(i);
            if ((pass === 0) !== was) continue;
            if (i === oi || i === di || i === hIdx || i === selIdx) continue;
            if (!front[i]) continue;
            const x = sx[i];
            const y = sy[i];
            const dotR = Math.max(3, runtime.radiusPx[i]);
            const l = x + LABEL_GAP + (dotR - 3);
            const t = y - LABEL_HEIGHT / 2;
            const r = l + widths[k];
            const b = t + LABEL_HEIGHT;
            if (!inside(rect, l, t, r, b, 6)) continue;
            if (rects.hits(l, t, r, b, was ? 1 : 6)) continue;
            // The dot itself must not sit under another label.
            if (rects.hits(x - 3, y - 3, x + 3, y + 3, 0)) continue;
            if (p.show(i, names[k], x + (dotR - 3), y)) {
              rects.add(l, t, r, b);
              shown++;
            }
          }
        }
      }
      p.end(now, (i, out) => {
        out.ok = front[i] === 1;
        out.x = sx[i];
        out.y = sy[i];
      });
    }

    /* ---- 8. Beacon (search result under the pointer in the picker) ---- */
    const bId = s.beaconId;
    const bEntry = bId ? getEntry(bId) : undefined;
    const bIdx = bEntry && bEntry.regime === s.regime ? data.index.get(bEntry.id) ?? -1 : -1;
    if (bIdx >= 0) {
      const x = sx[bIdx];
      const y = sy[bIdx];
      const visible = front[bIdx] === 1 && x >= rect.left + 8 && x <= rect.right - 8 && y >= rect.top + 8 && y <= rect.bottom - 8;
      place(dom.beacon, x, y, visible);
      if (!visible) {
        // Arrow chip at the nearest edge of the uncovered area, pointing toward the object.
        const cxm = (rect.left + rect.right) / 2;
        const cym = (rect.top + rect.bottom) / 2;
        let dx = x - cxm;
        let dy = y - cym;
        if (!front[bIdx]) {
          dx = -dx;
          dy = -dy;
        }
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const hw = (rect.right - rect.left) / 2 - 90;
        const hh = (rect.bottom - rect.top) / 2 - 26;
        const k = Math.min(Math.abs(dx) > 1e-6 ? Math.max(hw, 20) / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? Math.max(hh, 16) / Math.abs(dy) : Infinity);
        setText(dom.beaconChipName, bEntry ? bEntry.name : '');
        if (dom.beaconArrow) {
          const ang = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
          if (dom.beaconArrow.dataset.angle !== String(ang)) {
            dom.beaconArrow.dataset.angle = String(ang);
            dom.beaconArrow.style.transform = `rotate(${ang}deg)`;
          }
        }
        place(dom.beaconChip, cxm + dx * k, cym + dy * k, true);
      } else place(dom.beaconChip, 0, 0, false);
    } else {
      place(dom.beacon, 0, 0, false);
      place(dom.beaconChip, 0, 0, false);
    }

    /* ---- 9. Arrival burst ---- */
    if (s.arrivalCount !== st.arrival) {
      st.arrival = s.arrivalCount;
      runtime.burstStart = now;
    }
    const burstOn = runtime.burstStart > 0 && now - runtime.burstStart < 1600 && dVis;
    place(dom.burst, dVis ? sx[di] : 0, dVis ? sy[di] : 0, burstOn);

    /* ---- 10. Scale bar ---- */
    const mpp = metersPerUnit(runtime.regime) / pxPerUnit(runtime.targetDistance, H, camera.fov);
    const bar = scaleBarFor(mpp, compact ? 96 : 120);
    if (bar && dom.scaleBar) {
      const w = Math.round(bar.width);
      if (w !== st.scaleWidth) {
        st.scaleWidth = w;
        dom.scaleBar.style.width = `${w}px`;
      }
      if (bar.label !== st.scaleLabel) {
        st.scaleLabel = bar.label;
        setText(dom.scaleLabel, bar.label);
        dom.scaleLabel?.classList.remove('is-swap');
        void dom.scaleLabel?.offsetWidth;
        dom.scaleLabel?.classList.add('is-swap');
      }
    }
  });

  return null;
};
