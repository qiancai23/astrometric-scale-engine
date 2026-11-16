# CLAUDE.md

Astrometric Scale Engine: a React + Three.js app that simulates flights between solar-system bodies or stars. A full-window 3D map with floating panels: plan a flight, see how long it takes on the ship and on Earth (relativistic sublight or Alcubierre warp), then play the flight back.

**Session start:** read HANDOFF.md first, then LOG.md if more history is needed. **Session end:** append a dated entry to LOG.md (append-only) and overwrite HANDOFF.md (see the global instructions).

## Commands
- `npm run dev` — Vite dev server
- `npm run build` — `tsc && vite build` (output in `dist/`)
- `npm test` — Jest (ts-jest, `testEnvironment: node`): physics, flight profile, store, catalog, formatting, perspective. Pure logic only; no component tests.
- `npm run lint` — ESLint (no eslint config file is checked in, so this may not run)
- `python scripts/build_elements.py` — regenerates `scripts/elements.json` (orbital elements of Pluto, the dwarf planets and the asteroids) from the NASA JPL Small-Body Database. Standard library only; needs network access; the service sometimes answers "502", so the script retries.
- `python scripts/build_data.py` — regenerates `scripts/stars.json` and `scripts/systemic.json` from external archives (needs `astroquery`, network access; see gotchas)

## Stack
React 18, TypeScript, Vite 6, Zustand 4, `three` 0.184 with `@react-three/fiber` v8 and `@react-three/drei` v9 (these majors are pinned on purpose because they match React 18), Jest 29. Fonts are self-hosted through `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono`.

## Architecture
Read `UIUX/BUILD_SPEC_2026-11-15.md` before changing the interface: it holds the design decisions, the rules, the layout and the motion requirements.

- `src/physics/kinematicsEngine.ts` — pure TypeScript class, trip totals. Sublight is relativistic constant proper acceleration with an automatic coast when the speed limit is reached; warp is a linear Alcubierre model (Lorentz factor 1). **Do not change it.**
- `src/physics/ephemeris.ts` — where every solar-system body is on any date (orbital elements solved with Kepler's equation; planets from JPL's approximate-elements table, small bodies from `scripts/elements.json`, the Moon round Earth). Dates are "day numbers": days since 2000-01-01 12:00 UT.
- `src/physics/lambert.ts` — the Lambert solver (the orbit joining two points in a given time) and a coasting-orbit propagator.
- `src/physics/transfer.ts` — solar-system trips: chemical-rocket coasting orbits and the launch-window grid, the Earth to Moon case, the ion-drive spiral, straight flights aimed at where the destination will be, and the flight profiles for all of them.
- `src/physics/flightPlanner.ts` — picks the model for an engine and route on the solar-system map and returns the flight plus a `FlightPlan` (launch and arrival dates, fuel needed, whether the budget is enough). The store calls it for every solar-system flight; the star map still uses `kinematicsEngine.ts` directly.
- `src/physics/flightProfile.ts` — the ship's state (time on both clocks, speed, distance, phase) at any moment of a flight, plus chart sampling with a linear or logarithmic time axis. Must agree with the engine's totals (tested).
- `src/state/useFlightStore.ts` — Zustand store, the single source of truth. Holds the flight (route, engine, tuning, and on the solar-system map the launch date, fuel budget, orbit-or-fly-past choice and any flight pinned on the launch-window chart), everything derived from it (`profile`, `plan`, `comparison` of all five engines), playback (`playing`, `progress`), and map/interface state (layers, selection, hover, camera requests, open picker, toast). The flight is read from the page address at startup.
- `src/data/` — `catalog.ts` (normalizes both catalogs; search with aliases and typo tolerance), `constellations.ts`, `engines.ts` (five engines, ranges, slider mappings; top speed 0.999 c), `famousFlights.ts`.
- `src/lib/` — `format.ts` (every displayed number), `motion.ts` (tweens, reduced motion, `useIsCompact`), `tokens.ts` (CSS variables for the 3D scene), `perspective.ts` (plain-language comparisons), `urlState.ts` + `useUrlSync.ts` (shareable links), `usePlaybackDriver.ts`.
- `src/components/` — `shell/` (window layout, top bar, phone bottom sheet, toasts), `plan/` (pickers, engine cards, sliders), `answer/` (twin clocks, comparisons), `playback/` (play controls, speed chart and scrubber, famous flights), `visualizer/` (the 3D map; `MapStage.tsx` is lazy-loaded), `common/RollingValue.tsx`. One stylesheet per area in `src/styles/`.
- `src/index.css` — all design tokens and base styles.
- `scripts/build_data.py` — builds the catalogs. The app imports `scripts/stars.json` and `scripts/systemic.json` from the project root `scripts/` folder. The copies in `src/scripts/` are not imported by any source file.
- Older requirement documents (pre-redesign, partly outdated): `SYSTEM_REQUIREMENTS-3.md`, `UI-UX_REQUIREMENTS-3.md`, `Implementation Plan.md`, `INTERSTELLAR.md`, `SKYDOME.md`, `UIUX/DESIGN.md`. Per-session technical changelogs: `UPDATES_*.md`.

## Rules
From `.agentrules` (these still apply):
- Keep the "Obsidian Flux" dark-space look. Use only the CSS variables defined in `src/index.css`; no ad-hoc colors in the interface. The 3D scene reads the same variables through `src/lib/tokens.ts`. The only literal colors are the physical colors of stars and planets in `src/data/catalog.ts` and the boot screen in `index.html`.
- Slider, input and chart changes must keep unit conversions in sync with the store: use the mappings in `src/data/engines.ts`.
- Sublight is relativistic; warp is the linear Alcubierre model. Check chart edge cases visually (for example a chemical rocket at interstellar distance).
- Append every newly created file path to `session_creation_log`.
- At the end of a significant session, also write an `UPDATES_{YYYY-MM-DD_HH-mm-ss}.md` file with exact filenames, function names, math changes and technical debt.

From the redesign:
- Every displayed number goes through `src/lib/format.ts` and is rendered with `RollingValue` so it rolls instead of jumping.
- Motion is a requirement, not polish, and all of it must stop under the reduced-motion system setting.
- The store's `progress` changes every frame during playback: only small leaf components subscribe to it; render loops read `useFlightStore.getState()`.
- Minimum text size 12px; touch targets 44px; real buttons, links and labelled inputs.

## Gotchas
- The solar-system map is date-driven. Body positions come from `src/physics/ephemeris.ts`, not from `coords` in `scripts/systemic.json` (those are a frozen snapshot, each body at a different date; they only seed the catalog). `setSystemicDay` in `sceneData.ts` rewrites the scene positions every frame; orbit lines are drawn from the same orbital elements.
- On the solar-system map each engine has its own model: chemical rocket = coasting orbit with a fuel budget (km/s of velocity change) instead of a speed limit; ion drive = low-thrust spiral; fusion, antimatter, warp and anything touching the Sun = straight line to where the destination will be. A flight's shape is `profile.trajectory`; the map draws it through `flightGeometry.ts`.
- The chemical planner returns the launch that arrives soonest within the fuel budget, on or after the chosen date, so the launch can be later than the chosen date. If nothing fits it returns the cheapest flight with `plan.feasible === false`.
- The launch-window grid (`porkchop` in `transfer.ts`) costs about 0.2 s the first time for a route and date; it is cached (8 entries).
- Long shell heredocs fail in this environment's Git Bash; write scripts to a file and run them.
- `npx vite build` fails from Git Bash ("No matching HTML proxy module found", a drive-letter case mismatch); run it from PowerShell with the folder written `E:\...`.
- Two maps: "Systemic" (coordinates in AU, scale 1) and "Interstellar" (parsecs, multiplied by `INTERSTELLAR_SCALE = 0.05` in `src/components/visualizer/sceneData.ts`). `setEndpoint` in the store switches maps when an object from the other map is chosen.
- Scene scale is extreme (Earth to Moon is 0.0026 AU; Andromeda is 38,900 scene units). The camera's near and far planes are adjusted to the camera distance every frame in `CameraRig.tsx`; star points do not use depth. The Milky Way backdrop is applied through `scene.background` (never a sphere mesh) and is dimmed hard.
- Stars, labels, rings, markers and the ship are a fixed pixel size at every zoom. Labels and other map overlays are DOM elements positioned once per frame by `OverlayDriver.tsx`, not React state.
- The shell publishes `--map-inset-top/right/bottom/left` on `.app-shell` (how much of each edge the panels cover); the map frames flights and places its controls inside the uncovered area.
- Map selection is single click or tap (a drag never selects); double-click centres; `Esc` clears the selection, then re-frames the flight.
- `loadFlight` resets every engine's tuning to defaults on purpose.
- Jest compiles to CommonJS: import JSON with `import * as` (see `unwrapJson` in `src/data/catalog.ts`).
- Running `build_data.py` needed an SSL monkey-patch for NASA JPL Horizons on the author's machine, and the JPL Horizons API rejects ambiguous target names.
- Warp energy uses an arbitrary reactor constant (1e12) and is a placeholder, not real physics; the interface labels it "notional".
- The original 4.86 MB background image is in `source-assets/` and is not deployed.
- `output.txt` (UTF-16 Gaia warning dump) is untracked scratch; `readme.txt` is a placeholder. Neither matters.
- `session_creation_log` is a mixed-encoding file (parts are UTF-16); append bytes, never rewrite it.
