# HANDOFF

Last updated: 2026-11-16 (third round of the day: date-based solar-system flights built, reviewed and clicked through; not yet committed)

## Project goal
Astrometric Scale Engine: a browser app (React 18, TypeScript, Vite 6, Zustand, Three.js) that answers "how long does it take to get there, and how much less do you age than the people you left behind?" The visitor picks an origin and a destination (planets and moons in the solar system, or stars, exoplanets and deep-sky objects), picks one of five engines (chemical rocket, ion drive, fusion torch, antimatter rocket, warp drive), and sees the travel time on the ship and on Earth, with a 3D map and a playable flight.

Live site: https://astro.brucedgates.com/ (Cloudflare, deploys on push to `main`). Repository: https://github.com/qiancai23/astrometric-scale-engine.

## Current state
**Everything from the 2026-11-16 rounds is in the working tree, uncommitted and unpushed.** The live site still shows the previous version. Nothing was committed because Bruce has not asked for a commit, and a push to `main` deploys the live site.

Bruce asked (2026-11-16) for the solar-system map to be accurate and date-dependent, after noticing a chemical rocket reached Mars in 1 month 6 days (real missions: 4 to 9 months). He approved building three stages and deferring gravity assists, and asked for the ion drive to be fixed because it was thousands of times stronger than a real one. Built:

- **Planets where they really are on a chosen date.** Positions come from orbital elements (`src/physics/ephemeris.ts`). The flight has a launch date (default today), stored in the page address. Planets move on the map during playback.
- **Chemical rocket follows real coasting orbits.** A Lambert solver (`src/physics/lambert.ts`: finds the orbit joining two points in a given time) and a planner (`src/physics/transfer.ts`, `src/physics/flightPlanner.ts`). The chemical rocket's tuning is a fuel budget in km/s of velocity change (3 to 16, default 6) instead of a speed limit. Of all launches on or after the chosen date that fit the budget, the planner picks the one that arrives soonest, so it may wait for a launch window. If nothing fits, it shows the cheapest flight flagged as over budget. "Enter orbit" or "Fly past" switch. Earth to Mars from 16 Nov 2026 on the default budget: 6 months 27 days.
- **Ion drive made realistic.** Acceleration 0.000001 to 0.0001 g (default 0.00001 g), a slow spiral between orbits on the solar-system map (Earth to Mars about 2 years), and 10 to 200 km/s top speed on the star map (Proxima Centauri: 12,700 years).
- **Fast engines** (fusion, antimatter, warp) still fly a straight line, now aimed at where the destination will be on arrival. Flights to or from the Sun use this model for every engine.
- **Launch-window chart** in the playback panel ("Speed" / "Launch windows" switch): launch date against travel time, brighter where less fuel is needed; clicking a cell flies exactly that flight.
- **Map:** curved flight path, ship follows it, orbit lines drawn from the same orbital elements, "LAUNCH · Earth was here" and "ARRIVAL · Mars will be here" markers, camera frames the whole path.
- **Famous flights** now include real missions with their real launch dates (Apollo 11, Mariner 7, Perseverance, New Horizons).
- **User guide** (`public/help.html`) updated.

The full technical record (every module, the math, the limits) is in `UPDATES_2026-11-16_07-32-23.md`.

### Verified
- `npx tsc --noEmit` clean, 178 Jest tests pass (10 suites), `npx vite build` succeeds.
- Physics checked against reality in tests: planet positions within 0.3% of NASA JPL Horizons samples; minimum-fuel Earth to Mars transfer 259 days; Perseverance's and New Horizons' real launch speeds reproduced to within 1%; Mariner 7's 131-day fly-past needs 3.9 km/s.
- Third round (2026-11-16): the playback panel code left by a helper agent that was cut off was reviewed, and every control was clicked through in headless Microsoft Edge (software renderer) at 1440 px and 390 px wide, with no console errors and no sideways overflow: speed chart for orbit and spiral flights; launch-window chart (hover, click, arrow keys and Enter, "Soonest arrival instead", tap on a phone); month buttons, "Today" and a typed date; "Fly past"; the fuel-budget slider; a whole chemical flight to Mars played to arrival; the reduced-motion setting; the Earth to Moon map.
- Fixed in the third round: speed-chart labels now read "Fastest ..." and "Slowest ..."; the speed tag beside the ship on the map got its pill styling back and avoids labels; the over-budget warning no longer calls a hand-picked flight "the cheapest launch found"; the phone sheet at full height stops below the "Solar system / Stars" switch. Details in `UPDATES_2026-11-16_11-42-42.md`.

### Not verified, and known rough edges
- No real graphics card, real phone, Firefox, Safari or screen reader has been tried.
- After picking a flight on the launch-window chart, "Soonest arrival instead" keeps the picked launch date as the earliest date; it does not return to the date chosen before.
- The fuel-budget slider moves only about 0.01 km/s per arrow key.
- With the phone sheet at full height, only about 40 px of map remains and the zoom buttons crowd into it.
- On the Earth to Moon map, the Moon's orbit line (seen nearly edge-on) runs through the arrival caption.

## Next steps
1. Ask Bruce to look at it locally (`npm run dev`), then commit; push only on his go-ahead (a push deploys the live site).
2. Later, not started, Bruce agreed to wait: gravity assists (a flyby of Venus, Earth, Mars or Jupiter on the way).
3. Optional: the rough edges listed above; load the star catalog on demand; stop the object card on the map from covering the origin or the path; delete the unused duplicate catalogs in `src/scripts/`.

## Decisions by Bruce
- 2026-11-16: the chemical rocket's default fuel budget stays 6 km/s (Mars in about 7 months; Jupiter needs 6.7 and shows as over budget until the slider is raised).
- 2026-11-16: the default flight on a first visit stays Earth to Mars by fusion torch at 1 g.
- Earlier: keep the 0.999 c top speed "for now".

## Open questions for Bruce
- None that block work. Commit and push wait for his word.

## Key file paths
- `UPDATES_2026-11-16_07-32-23.md` — technical record of the build; `UPDATES_2026-11-16_11-42-42.md` — the review and fixes after it. `UPDATES_2026-11-15_18-23-07.md` — the redesign before it.
- `UIUX/BUILD_SPEC_2026-11-15.md` — interface rules; read before changing the interface.
- `src/physics/ephemeris.ts` (positions by date), `lambert.ts` (orbit solver), `transfer.ts` (trip models and launch-window grid), `flightPlanner.ts` (which model for which engine; `FlightPlan`), `flightProfile.ts` (ship state over time; `Trajectory`), `kinematicsEngine.ts` (do not change).
- `src/state/useFlightStore.ts` — single source of truth. New fields: `departureDay`, `arrivalMode`, `pinnedTofDays`, `deltaVKms`, `plan`. Tests: `src/state/systemicFlights.test.ts`.
- `src/data/engines.ts` (engines, ranges, slider mappings), `src/data/famousFlights.ts`.
- `src/components/visualizer/flightGeometry.ts` (map date, path points, ship position, camera bounds), `sceneData.ts` (`setSystemicDay`), `FlightPath.tsx`, `OverlayDriver.tsx`, `CameraRig.tsx`, `SolarSystem.tsx`.
- `src/components/plan/WhenSection.tsx`, `TuneSliders.tsx`; `src/components/playback/LaunchWindowChart.tsx`, `SpeedChart.tsx`; `src/components/answer/AnswerPanel.tsx`.
- `scripts/build_elements.py` writes `scripts/elements.json` (orbital elements of the small bodies).

## Gotchas
- Dates are "day numbers": days since 2000-01-01 12:00 UT. Orbit math is in AU and days; fuel in km/s.
- On the solar-system map, body positions come from `ephemeris.ts`, not from `coords` in `scripts/systemic.json` (a frozen snapshot with each body at a different date).
- The launch can be later than the chosen date (`plan.launchDay` against `departureDay`); `plan.feasible` is false when the fuel budget is too small.
- A flight's shape is `profile.trajectory`; absent on the star map. Earth to Moon paths are measured from Earth (`frame: 'Earth'`) and the camera follows Earth.
- `progress` in the store changes every frame during playback: only small leaf components may subscribe to it.
- Interface colors only from the CSS variables in `src/index.css`; numbers through `src/lib/format.ts` (`formatDate`, `formatDeltaV` are new).
- Long shell heredocs fail in this machine's Git Bash ("unexpected EOF"): write a script to a file and run it.
- `npx vite build` fails from Git Bash ("No matching HTML proxy module found"); run it from PowerShell with the folder written `E:\...` (capital drive letter).
- To screenshot: `npx vite build`, `npx vite preview --port 4319`, then headless Edge through `puppeteer-core` (not a project dependency: run `npm install puppeteer-core` in a scratch folder outside the repository; Edge is at `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`) with `--use-angle=swiftshader --enable-unsafe-swiftshader`. Test address: `/?from=earth&to=mars&engine=chemical&date=2026-11-16`. Stop the preview server afterwards.
- `.agentrules`: append new file paths to `session_creation_log` (mixed encoding; append bytes, never rewrite) and write an `UPDATES_*.md` after sessions that change code. Both done for every round so far.
- `LOG.md` is append-only; dated entries go at the end.
- Jest compiles to CommonJS: import JSON with `import * as` and unwrap `.default`.
- `npm run lint` has no ESLint config in the repository.
