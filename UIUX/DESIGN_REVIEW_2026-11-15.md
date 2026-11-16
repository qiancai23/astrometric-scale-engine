# Astrometric Scale Engine — Critical Design Review (Phase 1)

Date: 2026-11-15
Subject: the live site at https://astro.brucedgates.com/ and the source in this repository (branch `main`, commit `ef8fbd6`).
Status: **awaiting the owner's approval of direction.** No code was changed. The detailed design specification (Phase 2) and the implementation blueprint (Phase 3) follow only after approval.

## How this review was done

- **Read** every source file under `src/`, plus `index.html`, `UIUX/DESIGN.md`, `public/help.html`, and the two catalogs the app imports (`scripts/stars.json`, `scripts/systemic.json`).
- **Fetched** the live site's HTML, response headers and asset sizes.
- **Rendered** the live site in headless Microsoft Edge and captured nine screenshots, saved in `UIUX/review-2026-11-15/`:
  - `01-first-run-1440.png` — first load, nothing selected, 1440×900
  - `02-earth-mars-fusion-1440.png` — Earth to Mars, fusion drive
  - `03-earth-mars-chemical-1440.png` — Earth to Mars, chemical rocket
  - `04-earth-mars-warp-1440.png` — Earth to Mars, warp drive
  - `05-sol-proxima-warp-1440.png` — Sol to Proxima Centauri, warp drive
  - `06-sol-proxima-antimatter-1440.png` — Sol to Proxima Centauri, antimatter rocket
  - `07-sol-proxima-1024.png` — same flight at 1024×768
  - `08-sol-proxima-390.png` — same flight at phone width (390×844)
  - `09-help-1440.png` — the help page

Every finding below is tagged:
- **[Verified]** — seen in a screenshot, measured, or read directly in the code.
- **[Assumption]** — inferred; needs confirmation.

**Limit of the method:** headless Edge draws 3D with a software renderer, not a real graphics card. Findings about layout, text, colors and data are reliable. Fine rendering detail in the 3D map (line shimmer, banding) may look different on a real screen and is tagged as an assumption.

---

## 1. Verdict in one paragraph

The physics is real, the data is real, and the idea — *how long does it actually take to get there, and how much less do you age than the people you left behind* — is genuinely moving. But the site presents that idea as a form with a results table. The most interesting number it produces (the gap between ship time and Earth time) is two small rows of near-identical text. The 3D map, which should be the stage, gets about a third of the screen and is covered in grey noise. The first thing a visitor sees is an empty calculator with no name on it. The opportunity is to turn a **calculator you fill in** into a **flight you plan and then watch**.

---

## 2. What works (keep these)

1. **One accent color per drive type.** Cyan for sublight, amber for warp, switched across the whole interface by a single attribute (`data-drive` on the root element, in `src/index.css`). It is a simple, strong idea and the best piece of the current visual system. [Verified]
2. **Honest physics.** Constant-proper-acceleration relativity with an automatic coast phase, and a pure TypeScript engine with tests. Nothing in the redesign should touch the math. [Verified]
3. **Real catalogs.** 1,430 stars from the HYG database, 1,561 exoplanets from the NASA Exoplanet Archive, real planetary orbits from JPL Horizons, plus Voyager, Pioneer and New Horizons. Most space toys fake this. [Verified]
4. **The mission-console personality.** Uppercase micro-labels, monospace numerals, eight decimals of Lorentz factor. It is a little theatrical and that is its charm.
5. **Instant recalculation.** Every input change updates every output with no "calculate" button. [Verified]
6. **The help page.** `public/help.html` is better designed than the app: darker background, clearer hierarchy, a sidebar, a responsive breakpoint, and a one-sentence statement of what the product is for. The app should rise to its level. [Verified]

---

## 3. What is broken right now

These are defects, not matters of taste. All are visible on the live site.

| # | Defect | Evidence | Cause |
|---|---|---|---|
| 1 | The header reads `PEAK LORENTZ FACTOR (\U03B3)` instead of showing the Greek letter gamma. | [Verified] every screenshot | `src/components/GlobalHeader.tsx` line 47: a `γ` escape written in plain JSX text, where escapes are not processed. |
| 2 | The chart is cut off on the right. The distance axis and its numbers are missing, and there is dead space under the chart. | [Verified] screenshots 02–07 | `src/components/charts/KinematicCharts.tsx`: the code that measures the chart's container runs once, at a moment when the container is not on screen yet (the "Awaiting Navigation Target" message is showing instead). So the chart stays at its default 800×200 pixels forever. It is clipped on any window narrower than 1600 pixels. |
| 3 | A slider tick label reads `0.11000000000000001c`. | [Verified] screenshot 01 | Unrounded floating-point number in `src/components/FlightConfig.tsx` (the `formatLabel` helper). |
| 4 | Number inputs and the object info box do not get their intended accent styling. | [Verified] measured: number inputs are white text on a transparent background | `FlightConfig.tsx` and `SceneGraph.tsx` use CSS variables that do not exist: `--color-accent`, `--color-bg`, `--color-text`. The real names in `src/index.css` are `--color-accent-active`, `--color-bg-base`, `--color-text-primary`. |
| 5 | Section headings collide with the control above them ("Propulsion System" touches the destination dropdown; "Kinematic Readouts" touches the box above). | [Verified] every screenshot | The wrapper class `config-container` has no CSS rule, so there is no gap between sections. |
| 6 | The site is unusable on a phone. At 390 pixels wide the page is 677 pixels wide, the three columns are squeezed to 97 / 195 / 97 pixels, and text is cut off mid-word. | [Verified] screenshot 08 | No responsive rules anywhere in the app. Fixed 25% / 50% / 25% columns; a 350-pixel minimum width in the header. |
| 7 | Changing engine leaves the speed at the bottom of the new engine's range. Going from chemical rocket to antimatter rocket gives an antimatter ship limited to 0.099 c, the weakest it can be. | [Verified] screenshot 06 | The clamp in `FlightConfig.tsx` keeps the old value where it can instead of choosing a sensible default per engine. |
| 8 | The chart says "Midpoint Flip" on flights that coast, while the 3D map correctly says "Decel Horizon" for the same flight. | [Verified] screenshots 03, 06 | The chart always draws the midpoint line for sublight. |
| 9 | Typing in the search box ignores the category dropdown above it. | [Verified] in code | `renderOptions` in `FlightConfig.tsx` filters the whole catalog instead of the already category-filtered list. |
| 10 | The departure date is hard-coded to 23 May 2026, already six months in the past. | [Verified] | `GlobalHeader.tsx` line 14. |
| 11 | Chart can print the unit `kkm`. | [Verified] in code | `formatDistance` in `KinematicCharts.tsx`. |
| 12 | No favicon, no page description, no social-sharing preview. Requests for `/favicon.ico` and `/robots.txt` return the app's HTML page. | [Verified] by fetching | `index.html` has only a title and a font link. |
| 13 | The product has three names: "Astrometric Horizon Terminal" (browser tab), "Astrometric Scale Engine" (help page, repository), "Interstellar Kinematics Simulator" (`UIUX/DESIGN.md`). The app screen itself shows no name at all. | [Verified] | — |

---

## 4. Critical analysis by area

### 4.1 First impression

- A new visitor lands on an empty state: two "Select…" dropdowns, zeros in every readout, and `[ Awaiting Navigation Target for Analytics ]`. Nothing says what the site is, who made it, or what to do. [Verified, screenshot 01]
- The header — the most valuable strip on the page — shows a departure timestamp, a Lorentz factor of `1.00000000`, and two arrival timestamps identical to the departure. [Verified]
- **Recommendation:** load with a flight already planned (Earth to Mars at 1 g), offer a row of famous flights, and show the product name.

### 4.2 Information hierarchy

- The answer to the visitor's question ("how long?") is a 17-pixel number in the top right box of the right-hand column. It has the same visual weight as "Hull Mass", which is just an echo of an input. [Verified]
- The headline of relativistic travel — the traveller ages less — is shown as two rows, "Earth Time" and "Ship Time", which display identical values for almost every flight a visitor will try first, and as two 19-character timestamps in the header that differ by a few digits. Nothing draws the eye to the difference. [Verified, screenshots 02, 06]
- The Lorentz factor has the center of the header, but it reads `1.0000…` in nearly every configuration reachable from the defaults. It is the personality piece, not the answer. [Verified]
- Energy is shown as `4.4370e+2 EJ`. Scientific notation in exajoules means nothing to most people. For warp it is also a placeholder (the project's own notes say the reactor constant is arbitrary), yet it is displayed to five significant figures. [Verified]
- The right-hand column spends a quarter of the screen on six numbers and a permanent list of camera instructions; its lower 40% is empty. [Verified]

### 4.3 Layout

- The 3D map gets 50% of the width and 65% of the height: roughly one third of the screen. Two opaque columns of form controls and labels get half. [Verified]
- In the Interstellar regime the left column overflows (1,009 pixels of content in 836 pixels of height at a 900-pixel-tall window), pushing the acceleration and speed sliders below the fold. This contradicts the "locked console, no scrolling" goal in `UIUX/DESIGN.md`. [Verified]
- **Challenge to the existing decision:** the fixed three-column, exactly-one-screen grid treats the map as one widget among several. The map should be the full-screen stage, with the controls and results floating over it as translucent panels.

### 4.4 Visual design and typography

- The palette is stock Tailwind "slate" (`#0f172a` background, `#1e293b` panels). It reads as a generic admin dashboard rather than deep space. `UIUX/DESIGN.md` actually specified a darker `#020617` surface; the build drifted from it, and the help page uses a darker palette than the app. [Verified]
- Type: Inter for labels, and whatever monospace font the visitor's operating system has (Consolas on Windows, SF Mono on Mac) for numbers. So the "instrument" look differs per machine. The help page uses JetBrains Mono; the app does not. [Verified: only Inter is loaded]
- Small text is too small and too faint. Chart tick labels are 9 pixels. Slider tick labels are about 10 pixels. The muted grey (`#64748b`) on the background (`#0f172a`) has a contrast ratio of about 3.8 to 1, below the 4.5 to 1 accessibility minimum, and it is used for every section heading and header label. [Verified, computed]
- The 3D map uses five hard-coded colors that are not in the design system: teal `#00ffcc` (origin), magenta `#e841f4` (destination), pure red `#ff0000` (flip marker), blue `#4488ff` (stars), magenta `#ff00ff` (warp path). In warp mode the interface turns amber but the flight path on the map is magenta. [Verified]
- Developer scaffolding is visible in the map: red/green/blue axis lines and a floor grid. [Verified]

### 4.5 The 3D map

- **The background image hurts more than it helps.** At this zoom the Milky Way photograph renders as grey static. In the Interstellar view the top of the frame is a bright grey smear that washes out labels. It is also a 4.86 MB download. [Verified, screenshots 05–07]
- **The stars carry no information.** All 3,003 catalog objects are identical 2-pixel blue dots. Brightness, color and type are all in the data and unused. More than half of the dots (1,561) are exoplanets, which sit on top of their host stars. [Verified]
- **Labels are hard to read.** "Decel Horizon" is red text drawn directly over the flight path. Only the origin and destination are named; no planet is labelled until selected. [Verified]
- There is no scale bar, no legend, and no way to learn what a dot is without double-clicking it. Double-click-only selection is undiscoverable.
- Camera moves are instant jumps, not flights. [Verified in code]
- A symmetric dotted blue figure appears around Sol in the Interstellar view. I could not identify what draws it. [Assumption: may be a software-renderer artifact; the owner should check on a real screen. It matches the owner's own note that "the background field of dots is confusing".]
- Horizontal banding appears at the top of the Systemic view. [Assumption: probably the floor grid seen edge-on; may differ on a real graphics card.]
- These add to the five map problems already listed in `Prompt.txt` (dots too large, labels that grow on zoom, confusing background dots, zoom speed, object selection). The redesign should absorb those five rather than treat them separately.

### 4.6 Controls

- Choosing a destination star means: a category dropdown, a search box that visibly does nothing until you open the next control, then a native dropdown with 3,004 entries. Twice — once for origin, once for destination. There is no swap button. [Verified]
- The search box and the dropdown are two separate controls doing one job. This should be one searchable picker.
- The engine choice is a dropdown, so the visitor never sees engines side by side. The most natural question — "how much faster is fusion than chemical for this trip?" — requires flipping back and forth and remembering numbers.
- The map and the controls are not connected: you cannot click a star and say "fly here".
- **Challenge to the existing decision:** the antimatter rocket is capped at 0.99 c, which caps the Lorentz factor at 7.09. That hides the most astonishing result in relativistic travel: at a steady 1 g a ship reaches the Andromeda galaxy in about 28 years of ship time while 2.5 million years pass on Earth. Andromeda is already in the catalog. The site's best story is currently impossible to tell.

### 4.7 The chart

- Besides being clipped (defect 2): two curves share one plot with two different vertical axes; labels sit on top of the lines; there is no hover readout, so no value can be read off the curve. [Verified]
- For any flight with a short acceleration phase (most interstellar flights, all warp flights) the chart is a rectangle plus a diagonal line, with a footnote admitting the interesting part is too small to see. A linear time axis cannot show a burn of days inside a trip of decades. [Verified, screenshots 03, 05, 06]

### 4.8 Accessibility

- None of the seven form labels is linked to its control. There are no ARIA attributes anywhere. There is no main heading. [Verified, measured in the live page]
- Keyboard focus is shown only by a border color change; the default focus outline is removed. [Verified in `src/index.css`]
- The 3D map has no text alternative and no keyboard operation. Drive type is signalled by color alone.
- Slider styling exists only for Chrome, Edge and Safari; Firefox gets default sliders. [Verified in code; Firefox appearance not tested]

### 4.9 Performance

- JavaScript: one file, 2.1 MB (517 KB compressed). It contains the 3D library and both catalogs (1.5 MB of JSON) and everything loads before anything is drawn. [Verified]
- Background image: 4.86 MB JPEG. [Verified]
- Total first visit: about 5.4 MB over the network. On a phone connection that is a long blank screen.

### 4.10 Identity and sharing

- A flight cannot be linked to. Every visit starts from the empty state. For a personal site that people might pass around, this is the single cheapest high-value gap.
- No name, author credit, or link back to the owner's main site on the app screen. [Verified]

---

## 5. Proposed creative direction: "Plan it, then fly it"

Keep the mission-console personality and the cyan/amber language. Change what the console is *for*: not filling in a form, but planning a flight and watching it happen.

### 5.1 The map becomes the stage
The 3D map fills the whole window. The flight plan (left) and the results (right or bottom) become translucent panels floating over it, collapsible. On a phone the panels become a bottom sheet over a full-screen map.

### 5.2 The answer becomes the headline
One large, plain-language result, replacing the timestamp header:

> **Sol → Proxima Centauri** · antimatter rocket at 1 g
> **You age 3 y 6 mo.** Earth ages **5 y 10 mo.**

Two clocks side by side, and the gap between them drawn as a visible bar that grows as the flight becomes more relativistic. The Lorentz factor stays, as a supporting gauge with a plain gloss ("1 ship-year = 7.1 Earth-years").

### 5.3 Fly the flight (the signature feature)
A play button and a timeline scrubber. A ship marker travels the path on the map; a cursor travels the chart; the ship clock and Earth clock tick at their different rates; speed and distance-remaining update live. The visitor *watches* the clocks drift apart. One shared "current moment of the flight" value in the store drives map, chart and clocks together. This is the feature people would screenshot and share.

### 5.4 Engines side by side
Replace the engine dropdown with five selectable cards, each showing its travel time for the current route on a shared logarithmic bar: chemical 37 days · ion … · fusion 2 d 6 h · antimatter … · warp 32 s. The selector *is* the comparison chart.

### 5.5 Scale made felt
Under the headline, rotating plain-language comparisons computed from the result: "Light makes this trip in 4.2 years." "Voyager 1 would need 75,000 years." "A child born on Earth the day you leave is nearly 6 when you arrive." Energy in human terms: "about 0.7 × the world's yearly energy use" instead of `4.4370e+2 EJ`, with warp energy clearly labelled as notional. (The example figures in this section are illustrative; the specification will define the exact formulas.)

### 5.6 A first screen that is alive
Open on a planned flight. Offer a strip of famous flights: Apollo to the Moon, Earth to Mars at 1 g, New Horizons to Pluto, Sol to Proxima Centauri, 1 g to the galactic center, 1 g to Andromeda.

### 5.7 One search for everything
A single searchable picker (type "sir…" and get Sirius, with type, distance and constellation in the results), a swap button between origin and destination, and "set as destination" directly from any object clicked on the map.

### 5.8 A sky worth looking at
Stars colored by their real spectral class and sized by real brightness (both already in the data). Exoplanets as a switchable layer, off by default. Labels for the brightest and nearest objects that stay a fixed size. A scale bar. Smooth camera flights between targets. The background photograph dimmed hard and compressed to under 1 MB, or dropped.

### 5.9 Shareable flights
Every flight lives in the page address (for example `?from=sol&to=proxima-centauri&drive=antimatter&a=1&v=0.99`), with a proper title, description and preview image so a pasted link shows a card.

### 5.10 Sharper visual system
Deeper near-black background in place of Tailwind slate. One self-hosted monospace font for all numerals so the instrument looks the same everywhere, with fixed-width digits so numbers do not jitter. A defined type scale with a 12-pixel floor. All colors, including those inside the 3D scene, taken from one token set. Motion with purpose: the accent color cross-fades when the drive changes; numbers roll to their new values; everything respects the "reduce motion" system setting.

### 5.11 Unconventional ideas (optional, higher risk)
- **One continuous zoom from the Moon to Andromeda.** Remove the Systemic / Interstellar switch. The visitor scrolls out from Earth's orbit through the planets, the nearest stars, and the galaxy, with a logarithmic scale indicator ("powers of ten") at the side. This is what the name *Scale Engine* promises. It requires merging the two coordinate systems and is the hardest item here.
- **A "torchship" tier with no practical speed limit**, on a slider that counts nines (0.9, 0.99, 0.999…), unlocking the 28-years-to-Andromeda story.
- **The view from the bridge.** During playback, optionally switch to the ship's-eye view, where at high speed the stars crowd toward the direction of travel and shift blue — the real relativistic effect.
- **A log-time chart toggle** so the days-long burn is visible inside the decades-long trip.

---

## 6. Priorities

Impact and complexity are rated High / Medium / Low. Order within each tier is the recommended build order.

### Tier 0 — Repair (do regardless of direction; about a day)
| Item | Impact | Complexity |
|---|---|---|
| Fix the 13 defects in section 3 (except the phone layout, which belongs to Tier 1) | High | Low |
| Add name, favicon, description and sharing preview; settle on one product name | Medium | Low |
| Raise small text to a 12-pixel floor and fix the low-contrast grey | Medium | Low |
| Compress the background image; split the JavaScript so the page paints before the 3D library and catalogs arrive | Medium | Low–Medium |

### Tier 1 — Make the answer the hero (highest value for effort)
| Item | Impact | Complexity |
|---|---|---|
| Headline result with twin clocks and plain-language comparisons | High | Low–Medium |
| Open on a planned flight; famous-flights strip | High | Low |
| Flight stored in the page address (shareable links) | High | Low |
| Engine cards with side-by-side travel times | High | Medium |
| Single searchable picker with swap button | High | Medium |
| Full-window map with floating panels; phone layout with bottom sheet | High | Medium–High |
| New visual tokens, self-hosted numeral font, scene colors from tokens | Medium | Medium |
| Accessibility pass: labelled controls, focus rings, headings, keyboard path, text summary of the flight | Medium | Medium |

### Tier 2 — Make it alive
| Item | Impact | Complexity |
|---|---|---|
| Flight playback: play button, scrubber, ship marker, ticking clocks, chart cursor | Very high | Medium–High |
| Stars by real color and brightness; exoplanet layer; fixed-size labels; hover names; single-click select with "set as destination" | High | Medium |
| Smooth camera flights; scale bar; distance-aware zoom | Medium | Medium |
| Chart rebuilt: hover readout, labels off the lines, phase shading, optional log-time axis | Medium | Medium |

### Tier 3 — Make it unforgettable
| Item | Impact | Complexity |
|---|---|---|
| Torchship tier beyond 0.99 c | High | Low (input range and slider only; the engine already handles it) |
| One continuous zoom from the Moon to Andromeda | Very high | High |
| Ship's-eye relativistic view during playback | High | High |

---

## 7. Decisions needed from the owner

1. **Layout.** Full-window map with floating panels (recommended), or keep the three fixed columns and refine them.
2. **Ambition.** How many tiers the specification should cover: Tiers 0–2 plus the torchship tier (recommended), everything including the continuous zoom and ship's-eye view, or Tiers 0–1 only.
3. **Phones.** Full phone layout (recommended), or desktop only with a polite notice on small screens.
4. **Name.** "Astrometric Scale Engine" everywhere (recommended), or "Astrometric Horizon Terminal".

## 8. Open assumptions to confirm

- The audience is curious general visitors and science-fiction enthusiasts arriving from the owner's personal site, not working astronomers. [Assumption — it drives the plain-language headline.]
- The site is hosted on Cloudflare Pages and rebuilt from the GitHub repository. [Assumption from response headers and commit messages; the README says "Deploy target: none", which is out of date.]
- The two 3D rendering oddities in section 4.5 need a look on a real screen.
