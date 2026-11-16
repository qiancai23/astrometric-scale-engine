/**
 * GLSL for the map. Kept deliberately simple (no derivatives, no float textures) so it runs on
 * software WebGL renderers too. Colors arrive as sRGB components and are written straight to the
 * screen (these materials skip three's color-space conversion on purpose).
 */

/* ------------------------------------------------------------------ */
/* Point sprites: stars, exoplanets, deep-sky glyphs, small bodies     */
/* ------------------------------------------------------------------ */

export const pointVertex = /* glsl */ `
uniform float uTime;
uniform float uDpr;
uniform float uTwinkle;
uniform float uScale;
attribute vec3 color;
attribute float size;
attribute float core;
attribute float shape;
attribute float phase;
attribute float twinkle;
varying vec3 vColor;
varying float vShape;
varying float vCore;
varying float vTw;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float rate = 0.7 + fract(phase * 7.13) * 1.6;
  float tw = sin(uTime * rate + phase * 6.2831) * 0.6 + sin(uTime * rate * 2.3 + phase * 17.0) * 0.4;
  vTw = 1.0 + uTwinkle * twinkle * 0.14 * tw;
  vColor = color;
  vShape = shape;
  vCore = core;
  gl_PointSize = max(size * uDpr * uScale, 1.5);
}
`;

export const pointFragment = /* glsl */ `

uniform float uOpacity;
varying vec3 vColor;
varying float vShape;
varying float vCore;
varying float vTw;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = 0.0;
  vec3 col = vColor;
  if (vShape < 0.5) {
    // Star: bright core and a faint soft halo.
    float c = 1.0 - smoothstep(vCore * 0.7, vCore * 1.05, r);
    float halo = exp(-r * r * 7.0) * 0.38;
    a = max(c, halo);
    col = mix(vColor, vec3(1.0), c * 0.4);
  } else if (vShape < 1.5) {
    // Exoplanet: thin ring.
    a = 1.0 - smoothstep(0.1, 0.24, abs(r - 0.66));
  } else if (vShape < 2.5) {
    // Spacecraft: hollow diamond with a dot.
    float d = abs(p.x) + abs(p.y);
    a = max(1.0 - smoothstep(0.1, 0.22, abs(d - 0.72)), 1.0 - smoothstep(0.16, 0.3, d));
  } else if (vShape < 3.5) {
    // Nebula: soft cloud inside a faint dotted-looking ring.
    float cloud = exp(-r * r * 3.5) * 0.6;
    float ring = (1.0 - smoothstep(0.05, 0.13, abs(r - 0.82))) * 0.55;
    a = max(cloud, ring);
  } else if (vShape < 4.5) {
    // Galaxy: tilted ellipse with a bright nucleus.
    vec2 q = vec2(p.x * 0.8 + p.y * 0.6, -p.x * 0.6 + p.y * 0.8);
    q.y *= 2.8;
    float e = length(q);
    a = max(exp(-e * e * 2.2) * 0.85, (1.0 - smoothstep(0.06, 0.2, r)));
  } else if (vShape < 5.5) {
    // Black hole: bright ring around an empty centre.
    float ring = 1.0 - smoothstep(0.07, 0.18, abs(r - 0.55));
    float glow = exp(-pow((r - 0.55) * 4.0, 2.0)) * 0.35;
    a = max(ring, glow);
  } else if (vShape < 6.5) {
    // Asteroid: crisp small dot.
    a = 1.0 - smoothstep(0.55, 0.85, r);
  } else {
    // Dwarf planet: dot inside a ring.
    float dotA = 1.0 - smoothstep(0.28, 0.42, r);
    float ring = 1.0 - smoothstep(0.08, 0.18, abs(r - 0.8));
    a = max(dotA, ring * 0.7);
  }
  a *= vTw * uOpacity;
  if (a < 0.008) discard;
  gl_FragColor = vec4(col, a);
}
`;

/* ------------------------------------------------------------------ */
/* Flight path ribbon: a camera-facing quad from A to B whose width is  */
/* set in screen pixels. The fragment shader draws the line, the        */
/* flowing dashes, the flown part, the comet trail and the draw-on tip. */
/* ------------------------------------------------------------------ */

export const pathVertex = /* glsl */ `
// One quad per path segment: position is the segment's start, segEnd its end, and segT the
// fraction of the whole path at each of the two.
uniform vec2 uResolution;
uniform float uWidth;
uniform float uNear;
attribute vec3 segEnd;
attribute vec2 segT;
attribute float along;
attribute float side;
varying float vT;
varying float vSide;
void main() {
  vec4 a = modelViewMatrix * vec4(position, 1.0);
  vec4 b = modelViewMatrix * vec4(segEnd, 1.0);
  float nearZ = -uNear * 1.001;
  float ta = 0.0;
  float tb = 1.0;
  if (a.z > nearZ && b.z > nearZ) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vT = 0.0;
    vSide = 0.0;
    return;
  }
  if (a.z > nearZ) {
    float k = (nearZ - a.z) / (b.z - a.z);
    a = mix(a, b, k);
    ta = k;
  } else if (b.z > nearZ) {
    float k = (nearZ - a.z) / (b.z - a.z);
    b = mix(a, b, k);
    tb = k;
  }
  vec4 ca = projectionMatrix * a;
  vec4 cb = projectionMatrix * b;
  vec2 hres = uResolution * 0.5;
  vec2 sa = ca.xy / ca.w * hres;
  vec2 sb = cb.xy / cb.w * hres;
  vec2 dir = sb - sa;
  float len = length(dir);
  dir = len > 0.0001 ? dir / len : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  vec4 c = along < 0.5 ? ca : cb;
  c.xy += n * side * uWidth * 0.5 / hres * c.w;
  gl_Position = c;
  vT = mix(segT.x, segT.y, mix(ta, tb, along));
  vSide = side;
}
`;

export const pathFragment = /* glsl */ `

uniform vec3 uColor;
uniform vec3 uPale;
uniform float uWidth;
uniform float uLineHalf;
uniform float uDraw;
uniform float uShip;
uniform float uTrail;
uniform float uDashCount;
uniform float uDashOffset;
uniform float uEndFade;
uniform float uOpacity;
varying float vT;
varying float vSide;
void main() {
  if (vT > uDraw) discard;
  float px = abs(vSide) * uWidth * 0.5;
  float line = 1.0 - smoothstep(uLineHalf - 0.6, uLineHalf + 0.8, px);
  float dash = fract(vT * uDashCount - uDashOffset);
  float dashOn = smoothstep(0.0, 0.08, dash) * (1.0 - smoothstep(0.5, 0.58, dash));
  float ef = max(uEndFade, 0.00001);
  float endFade = smoothstep(0.0, ef, vT) * smoothstep(0.0, ef, 1.0 - vT);
  vec3 col = uColor;
  float alpha;
  if (uShip < 0.0) {
    alpha = line * mix(0.35, 0.95, dashOn);
  } else if (vT <= uShip) {
    alpha = line;
    float behind = uShip - vT;
    if (behind < uTrail) {
      float k = 1.0 - behind / max(uTrail, 0.00001);
      float glow = exp(-pow(px / (uWidth * 0.2), 2.0)) * k * k;
      alpha = max(alpha, glow * 0.85);
      col = mix(col, uPale, k * 0.65);
    }
  } else {
    alpha = line * dashOn * 0.42;
  }
  if (uDraw < 1.0) {
    float tip = 1.0 - smoothstep(0.0, max(uTrail, 0.004), uDraw - vT);
    alpha = max(alpha, exp(-pow(px / (uWidth * 0.22), 2.0)) * tip);
    col = mix(col, uPale, tip * 0.7);
  }
  alpha *= endFade * uOpacity;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
}
`;
