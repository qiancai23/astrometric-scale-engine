# Astrometric Scale Engine — Redesign Build Spec

Date: 2026-11-15. Status: **approved by the owner (Bruce) and being built.**
This document is self-contained. It is the shared contract for everyone (human or AI) building a part of the redesign. Background and evidence: `UIUX/DESIGN_REVIEW_2026-11-15.md`.

## 1. What we are building

A browser app (React 18, TypeScript, Vite, Zustand, Three.js via `@react-three/fiber` v8 and `@react-three/drei` v9) that answers: **how long does it take to get there, and how much less do you age than the people you left behind?** The visitor picks an origin and a destination (solar-system bodies, or stars / exoplanets / deep-sky objects), picks one of five engines, and sees the travel time on the ship and on Earth.

The redesign turns a form with a results table into **a flight you plan and then watch** ("Plan it, then fly it"):

- The 3D map fills the whole window. Controls and results float over it as translucent panels.
- The answer is a large plain-language headline with two clocks: "You age 3 y 6 mo. Earth ages 5 y 10 mo."
- **Playback:** a play button and scrubber; a ship marker crosses the map, a cursor crosses the chart, both clocks tick at their different rates.
- Five engine cards show every engine's travel time for the current route side by side.
- One searchable picker for everything, a swap button, and "Fly here" from any object on the map.
- Stars drawn with real color and brightness; exoplanets as a switchable layer.
- The flight lives in the page address, so any flight is a shareable link.
- A real phone layout (map on top, slide-up sheet below).

### Decisions already made by the owner (do not reopen)
1. Layout: full-window map with floating panels.
2. Scope: repairs, headline and controls redesign, playback, map upgrade. Not in scope: one continuous zoom from Moon to Andromeda, ship's-eye relativistic view.
3. Phones get a full layout.
4. The product is called **Astrometric Scale Engine** everywhere.
5. **Top speed is 0.999 c** (antimatter rocket; Lorentz factor about 22.4).
6. **As much animation as possible.** The owner's words: "Make things move, animated, dynamic, alive." See section 5. This is a first-class requirement, not polish.
7. **Stars must be as easy to find as possible**: forgiving search, aliases, browse lists, hover names and labels on the map, click a star to fly there, "show on map".

Audience: curious general visitors and science-fiction fans, not working astronomers. Write every label in plain language. Keep the mission-console personality (uppercase mono micro-labels, monospace numerals).

## 2. Rules for every contributor

- **Colors, fonts, sizes, radii and motion timings come only from the CSS variables in `src/index.css`.** No literal colors in components or component CSS. The single exception is *data colors* (the physical color of a star or planet), which come from `CatalogEntry.color`. Code that cannot use CSS (the 3D scene) reads tokens through `src/lib/tokens.ts`.
- Do not change `src/physics/kinematicsEngine.ts`. Do not change the shared foundation files listed in section 3 unless you own them; if you need something added, say so in your report.
- Every figure shown comes through `src/lib/format.ts`. Never hand-format a duration, distance or speed.
- Every number that can change is shown with `<RollingValue>` (it rolls to the new value). Nothing jumps.
- Minimum text size 12px (`--text-micro`). Text contrast at least 4.5:1: use `--color-text-primary`, `--color-text-secondary` or `--color-text-muted` for text; `--color-text-faint` is for decoration only.
- Touch targets at least 44px (`--hit-target`). Real `<button>`, `<a>`, `<input>` with `<label>`. `aria-label` on icon-only buttons. `aria-pressed` on toggles. Decorative SVG gets `aria-hidden="true"`.
- Respect reduced motion. CSS animations and transitions are neutralised globally in `index.css`; JS-driven motion must check `usePrefersReducedMotion()` / `prefersReducedMotion()` from `src/lib/motion.ts`.
- TypeScript is `strict` with `noUnusedLocals` and `noUnusedParameters`. No `any` in exported APIs.
- No new npm dependencies without asking. Icons are small inline stroke SVGs (1.5px stroke, `currentColor`); no emoji, no icon library.
- Each area has its own stylesheet in `src/styles/`, imported by that area's root component. Prefix class names with the area (`plan-`, `answer-`, `playback-`, `map-`, `shell-`) so they cannot collide.
- Do not append to `session_creation_log` and do not write `LOG.md` / `HANDOFF.md` / `UPDATES_*.md`; the orchestrator does that. List the files you created in your report instead.
- Other people are editing other files at the same time. `npx tsc --noEmit` may show errors in files you do not own; ignore those, fix only your own. Never "fix" another area's file.

## 3. Foundation (already written; read these before you start)

| File | What it gives you |
|---|---|
| `src/types.ts` | `AstroObject`, `AstrometricRegime` (`'Systemic'` = solar-system map in AU, `'Interstellar'` = star map in parsecs), `EngineId`, `Endpoint`, `FlightSpec`, `MapLayers`. |
| `src/state/useFlightStore.ts` | The Zustand store, single source of truth. Read its `FlightState` interface in full; every field and action is documented there. |
| `src/physics/flightProfile.ts` | `FlightProfile` (in the store as `profile`): `atFraction(f)` gives the ship's state (`t`, `tau`, `v`, `x`, `remaining`, `gamma`, `phase`) at fraction `f` of the flight's Earth time. Also `sampleProfile`, `chartPosition`, `fractionFromChartPosition` for the chart (linear or log time axis). |
| `src/data/catalog.ts` | `CatalogEntry` (friendly name, kind, star type, color, magnitude, distance, constellation, aliases, prominence, description), `getEntry(id)`, `findBySlug`, `searchCatalog(query, options)`, `browseGroups`, `labelCandidates(regime)`, `entriesFor(regime)`, `catalogSize`. |
| `src/data/engines.ts` | The five engines (`ENGINES`, `getEngine`, `getSublightEngine`), slider mappings (`speedToSlider` / `sliderToSpeed`, `accelToSlider` / `sliderToAccel`, `massToSlider` / `sliderToMass`; every slider runs 0..1), `shipClass`, `accelFeel`, `compareEngines`, unit constants `C_TO_KMS`, `C_TO_KPH`, `GRAVITY`. |
| `src/data/famousFlights.ts` | `FAMOUS_FLIGHTS` (label, blurb, spec), `DEFAULT_FLIGHT`. Load one with `useFlightStore.getState().loadFlight(spec)`. |
| `src/lib/format.ts` | `formatDuration` ("3 y 6 mo"), `formatDurationLong` ("2 years 4 months"), `formatDistance`, `formatSpeed`, `formatGamma`, `formatMass`, `formatAccel`, `formatWarpFactor`, `formatCount`, `formatBeta`, `sig`. |
| `src/lib/motion.ts` | `useTween`, `usePulse`, `useMounted`, `usePrefersReducedMotion`, `prefersReducedMotion`, `useIsCompact` (true below 1024px), easing functions. |
| `src/components/common/RollingValue.tsx` | `<RollingValue value={n} format={fn} log? immediate? duration? />`. |
| `src/lib/tokens.ts` | `useSceneTokens()` / `readSceneTokens()`: token colors for the 3D scene, switching with the drive. |
| `src/lib/usePlaybackDriver.ts`, `src/lib/useUrlSync.ts`, `src/lib/urlState.ts` | Playback clock, address-bar sync, link building (`currentFlightUrl()`). Mounted once by the shell. |
| `src/index.css` | All tokens, base element styles, `.panel`, `.btn` (+ `.btn-accent`, `.btn-solid`, `.btn-icon`, `.btn-ghost`), `.micro-label`, `.num`, range-slider styling (set `--fill: 37%` inline on the input), shared keyframes (`rise-in`, `pop-in`, `value-flash`, `ring-ping`, `breathe`, `sheen`…), `.enter` stagger helper (`style={{ '--i': n }}`). |
| `src/components/panelProps.ts` | `PanelProps { compact?: boolean }`, accepted by every panel. |

### Store usage rules
- Select narrowly: `useFlightStore((s) => s.progress)`, not the whole store. `progress` changes 60 times a second during playback; only small leaf components may subscribe to it. Inside render loops use `useFlightStore.getState()`.
- The store already recomputes everything (`sublightResult` / `warpResult`, `profile`, `comparison`, `distanceMeters`) on every input change. Never compute travel times in a component.
- `driveCore` is `'Sublight'` or `'Warp'`. The `<html>` element carries `data-drive="Sublight|Warp"`, which switches the accent from cyan to amber.
- Use `setEndpoint(which, id)` to choose places (it handles switching between the two maps), `setEngine(id)`, `setShipParams({...})`, `swapEndpoints()`, `loadFlight(spec)`, `play()` / `pause()` / `togglePlay()` / `seek(f)`, `selectObject(id)`, `setHovered(id)`, `setBeacon(id)`, `focusObject(id)`, `frameFlight()`, `openPicker(which)`, `toggleLayer(key)`, `showToast(message)`.
- `flightRevision` increments on any change to the flight; `routeRevision` on a change of origin or destination; `arrivalCount` each time a playback reaches the destination. Use them as animation triggers (`usePulse(flightRevision)`).

## 4. Visual language ("Obsidian Flux")

- Near-black space (`--color-bg-base`), translucent blurred panels (`.panel`), hairline borders, 16px panel radius, 10px control radius.
- One accent, which is the drive type: cyan (`--color-accent-active` when sublight), amber when warp. It cross-fades automatically over 600ms; use the `--color-accent-active*` and `--color-accent-a06…a55` tint variables and you get the cross-fade for free.
- Type: Inter for prose, JetBrains Mono for every numeral and for the uppercase section labels (`.micro-label`: 12px, weight 600, 0.14em tracking). Numerals always tabular (`.num`).
- Hierarchy: the headline clocks are the biggest thing on screen (`--text-display`, 34px mono bold). Section labels are small and quiet. Supporting figures 15 to 16px mono.
- Reference mockups (illustrations, not pixel specs): https://claude.ai/artifact/VVMSzcP3Ti84cMYTqFUbrB. Their layout in words is in section 6.

## 5. Motion: the interface is alive

Principles: (a) nothing jumps: values roll, bars glide, panels arrive; (b) cause and effect are visible: touching a control visibly ripples to everything it affects; (c) the map always has a little life in it; (d) motion is quick and eased (`--ease-out`, 140 / 320 / 700ms), never sluggish, never blocking input; (e) everything honours reduced motion.

Required moments:
- **Load:** panels enter staggered (left panel from the left, right panel from the right, bottom panel rising); the map camera flies in to frame the flight; the flight path draws itself from origin to destination.
- **Any change to the flight:** every affected number rolls; the headline flashes briefly (`value-flash`); engine bars glide to new lengths; the chart re-draws its line; the map path re-draws and the camera re-frames smoothly.
- **Engine change:** the selected card lights up with a sheen; the accent cross-fades (cyan to amber for warp) across the interface and the map.
- **Sliders:** the fill and the value follow the thumb live; the thumb grows on hover and press.
- **Picker:** opens with a short drop; results arrive staggered; hovering a result pings that object on the map (`setBeacon`).
- **Map idle life:** stars twinkle very slightly; origin and destination rings pulse; dashes flow along the flight path in the direction of travel; the camera drifts slowly when untouched.
- **Playback:** the play button breathes while waiting; pressing it morphs to pause; the ship glides with a glowing trail; clocks tick; the gap between the clocks visibly grows; a cursor crosses the chart; phase changes ("Flip", "Coasting") announce themselves; arrival fires a burst at the destination and a flash on the headline.
- **Hover and press** feedback on every control.

## 6. Layout

### Desktop (1024px and wider)
- **Map stage:** fills the window, behind everything.
- **Top bar** (height 44px, at top 16px): brand mark and "ASTROMETRIC SCALE ENGINE" at the left; a map switch ("Solar system" / "Stars"); at the right: Layers, Share this flight, Help. On a first visit a centered line: "How long does it take to get there?" with the sub-line "Pick two places and an engine. Real physics, real star catalogs."
- **Left panel, "Flight plan"** (340px wide, from 76px below the top to 20px above the bottom, scrolls inside): From / To pickers with a swap button; five engine cards; tuning sliders for the selected engine.
- **Right panel, "The answer"** (360px wide, top 76px, height by content, scrolls inside if needed): route title; "You age" and "Earth ages" clocks with bars; one sentence on the difference; three stat tiles (peak speed, Lorentz factor, distance); "In perspective" comparisons.
- **Bottom panel, "Playback"** (between the two side panels, 20px above the bottom): play button, four live readouts (ship clock, Earth clock, speed now, still to go), the speed chart that doubles as the scrubber, phase captions; before the first playback also the famous-flights strip.
- Side panels can be collapsed to give the map the whole window.
- From 1024 to 1279px the side panels narrow to 300px and 320px.

### Phone and tablet (below 1024px)
- Map fills the screen. Slim top bar (brand mark plus icon buttons).
- A bottom sheet with a drag handle and three heights: peek (route, headline time, play button), half, and full. Inside: tabs "Plan", "Answer", "Flight" showing the same three panels with `compact` set.

### Safe area for the map
The shell maintains four CSS custom properties on the `.app-shell` element: `--map-inset-top`, `--map-inset-right`, `--map-inset-bottom`, `--map-inset-left` (pixel lengths, e.g. `380px`) describing how much of each edge is covered by panels. The map uses them to keep the flight, the scale bar and its own controls inside the uncovered area.

## 7. File ownership

| Area | Owner files |
|---|---|
| Shell | `src/components/shell/**`, `src/styles/shell.css`, `src/App.tsx`, `src/main.tsx`, `index.html`, `vite.config.ts`, `public/favicon.svg`, `public/robots.txt` |
| Flight plan panel | `src/components/plan/**`, `src/styles/plan.css` |
| Answer panel | `src/components/answer/**`, `src/lib/perspective.ts`, `src/lib/perspective.test.ts`, `src/styles/answer.css` |
| Playback panel | `src/components/playback/**`, `src/styles/playback.css` |
| 3D map | `src/components/visualizer/**`, `src/styles/map.css` |
| Foundation (orchestrator) | everything in section 3, `LOG.md`, `HANDOFF.md`, `session_creation_log`, `CLAUDE.md`, `README.md`, `public/help.html` |

Component exports the shell depends on (do not rename): `FlightPlanPanel` (named, `src/components/plan/FlightPlanPanel.tsx`), `AnswerPanel` (named, `src/components/answer/AnswerPanel.tsx`), `PlaybackPanel` (named, `src/components/playback/PlaybackPanel.tsx`), `MapStage` (default export, `src/components/visualizer/MapStage.tsx`, loaded with `React.lazy`), `AppShell` (named, `src/components/shell/AppShell.tsx`). Panels fill the width of whatever container the shell gives them and never set their own outer width, position, background or border (the shell's `.panel` wrapper does that).

## 8. Verifying your work

- `npx tsc --noEmit` — no errors in your files.
- `npm test` — all Jest suites pass (`testEnvironment` is `node`; test pure logic only, not React components).
- `npx vite build` — succeeds.
- You cannot see the screen. Re-read your JSX and CSS once for obvious layout breakage (overflow at 340px panel width, long names such as "Andromeda Galaxy (M31)" and "2MASS J02192210-3925225 b", very large values such as "2.54 million y").
