# HANDOFF

Last updated: 2026-11-15 (fifth round of the day)

## Project goal
Astrometric Scale Engine: a browser app (React 18, TypeScript, Vite 6, Zustand, Three.js) that answers "how long does it take to get there, and how much less do you age than the people you left behind?" The visitor picks an origin and a destination (planets and moons in the solar system, or stars, exoplanets and deep-sky objects), picks one of five engines (chemical rocket, ion drive, fusion torch, antimatter rocket, warp drive), and sees the travel time on the ship and on Earth, with a 3D map and a playable flight.

Live site: https://astro.brucedgates.com/ (Cloudflare, deploys on push to `main`). Repository: https://github.com/qiancai23/astrometric-scale-engine.

## Current state: the redesign is committed and pushed to `main`
The whole redesign is one commit on `main` (`47e0201`, "Redesign: full-window map, flight plan, answer and playback panels"), pushed on 2026-11-15. The push should trigger the Cloudflare deployment of the live site; whether that deployment succeeded has not been checked.

The owner (Bruce) approved the design review (`UIUX/DESIGN_REVIEW_2026-11-15.md`) and asked for the build. It is done:

- The 3D map fills the window. Stars are drawn in their real color and brightness with fixed-size name labels. Click any object for a card with "Fly here" and "Start here".
- Left panel "Flight plan": From / To pickers with one forgiving search across everything (aliases such as "Alpha Centauri", "North Star", "M31"; constellation names; typo tolerance; browse lists such as nearest and brightest stars), a swap button, five engine cards that each show that engine's travel time for the current trip, and tuning sliders.
- Right panel "The answer": "You age" against "Earth ages" as two large clocks with bars, one plain sentence about the difference, three stat tiles, and plain-language comparisons.
- Bottom panel "Playback": "Fly this flight" plays the trip in 24 seconds. A ship crosses the map, both clocks tick, a cursor crosses the speed chart, which is also the scrubber. Famous flights are one click.
- The flight is stored in the page address (for example `?from=sol&to=proxima-centauri&engine=antimatter&a=1&v=0.999&m=1000`), so every flight is a shareable link.
- Phones and tablets (below 1024 px wide): full-screen map with a bottom sheet and three tabs.
- Maximum speed is 0.999 c (antimatter rocket).
- Extensive animation throughout (rolling numbers, cross-fading accent color, self-drawing flight path, twinkling stars, camera flights), all switched off for visitors who ask their system for reduced motion.

Verified: 107 Jest tests pass, the TypeScript check is clean, the production build succeeds, and the app was driven in headless Microsoft Edge at 1440, 1280, 1024 and 390 px wide with no console errors and no horizontal overflow. Result screenshots are in `UIUX/build-2026-11-15/`.

**Not verified:** a real graphics card (only the software renderer was used, so star sizes, glow, twinkle and camera feel may need tuning), a real phone, Firefox, Safari, a screen reader, reduced-motion mode.

## Next steps
1. Bruce looks at it on a real screen and a real phone: `npm run dev`, then open the address Vite prints. Things most likely to need tuning are listed under "Where to tune" below.
2. Confirm https://astro.brucedgates.com/ now shows the new design (Cloudflare build may take a few minutes; if it still shows the old design, check the Cloudflare Pages build log, which may need a Node version that supports Vite 6).
3. Optional follow-ups, none started: load the star catalog on demand so the first screen appears sooner (the catalog is a 1 MB chunk loaded before the interface); stop the object card on the map from covering the origin or the path; delete the unused duplicate catalogs in `src/scripts/`.

## Open questions for Bruce
- None pending. Decided 2026-11-15: keep the 0.999 c top speed "for now" (no unlimited sixth engine yet; "1 g to Andromeda" stays at about 114,000 years of ship time). Bruce may revisit this.

## Key file paths
- `UIUX/BUILD_SPEC_2026-11-15.md` — the contract the redesign was built against: decisions, rules, design tokens, motion requirements, layout, who owns which files. Read this before changing the interface.
- `UPDATES_2026-11-15_18-23-07.md` — technical record of the build: every module, the math, the defects closed, technical debt.
- `UIUX/DESIGN_REVIEW_2026-11-15.md` — the review that led to the redesign. `UIUX/review-2026-11-15/` — screenshots of the old site. `UIUX/build-2026-11-15/` — screenshots of the new one.
- `src/state/useFlightStore.ts` — the store, single source of truth; its `FlightState` interface documents every field and action.
- `src/physics/kinematicsEngine.ts` — trip totals (do not change). `src/physics/flightProfile.ts` — the ship's state at any moment of a flight, used by playback and the chart.
- `src/data/catalog.ts` (objects and search), `src/data/engines.ts` (the five engines and slider mappings), `src/data/famousFlights.ts`.
- `src/lib/format.ts` (all number formatting), `src/lib/motion.ts`, `src/lib/tokens.ts`, `src/lib/perspective.ts`, `src/lib/urlState.ts`.
- `src/index.css` — every color, font, size and motion value.
- `src/components/shell/` (window layout, top bar, phone sheet), `plan/`, `answer/`, `playback/`, `visualizer/` (the 3D map), each with a stylesheet in `src/styles/`.
- `public/help.html` — the user guide, rewritten for the new interface.
- `scripts/stars.json` (3,003 objects), `scripts/systemic.json` (27 objects) — the catalogs the app imports.

## Where to tune (if something looks off on a real screen)
- Star dot size and glow: `starCoreDiameter` and `HALO` in `src/components/visualizer/sceneData.ts`.
- How tightly the camera frames a flight: `framingDiameter` in `src/components/visualizer/mapMath.ts`.
- Background photograph brightness: `src/components/visualizer/Backdrop.tsx`.
- Playback length (24 seconds at 1×): `PLAYBACK_BASE_SECONDS` in `src/state/useFlightStore.ts`.
- Colors and animation speeds: the variables at the top of `src/index.css`.

## Gotchas
- Interface colors must come from the CSS variables in `src/index.css`; the 3D scene reads them through `src/lib/tokens.ts`. The only literal colors allowed are the physical colors of stars and planets in `src/data/catalog.ts`, and the boot screen in `index.html`.
- Every displayed number goes through `src/lib/format.ts` and is shown with the `RollingValue` component so it rolls instead of jumping.
- `progress` in the store changes 60 times a second during playback. Only small leaf components may subscribe to it; the map reads it inside its render loop.
- The app shell publishes how much of each window edge its panels cover as CSS custom properties (`--map-inset-top`, `-right`, `-bottom`, `-left`) on the `.app-shell` element. The map uses them to keep the flight, labels and its own buttons in the uncovered area.
- Two separate maps remain ("Systemic" in AU, "Interstellar" in parsecs, the latter drawn at a scale factor of 0.05). The store's `setEndpoint` switches maps automatically when an object from the other map is chosen.
- Loading a flight (`loadFlight`) resets every engine's tuning to defaults on purpose, so the engine comparison is fair.
- The original 4.86 MB background image is in `source-assets/` (not deployed). The app uses `public/assets/textures/milky_way_2k.jpg`.
- To screenshot the app: build, run `npx vite preview`, and drive headless Microsoft Edge with the `puppeteer-core` npm package using the launch flags `--use-angle=swiftshader --enable-unsafe-swiftshader`. It is a software renderer; fine 3D detail differs from a real screen. `puppeteer-core` is not a project dependency; install it outside the repository.
- Jest runs with `testEnvironment: node` and compiles to CommonJS, so JSON must be imported with `import * as` (see the `unwrapJson` helper in `src/data/catalog.ts`). Tests cover pure logic only, not React components.
- `LOG.md` is organized newest-first by "Run" in its older part; dated entries are appended at the end. Do not rewrite old entries.
- `.agentrules` requires every new file to be appended to `session_creation_log` (plain text, Windows line endings at the end of the file; parts of the file are UTF-16, so append bytes, do not rewrite) and an `UPDATES_*.md` file after sessions that change code.
- `npm run lint` has no ESLint config in the repository.
- `src/scripts/*.json` are unused duplicates of `scripts/*.json`. Edit the `scripts/` ones.
- `output.txt` (a scratch dump of Gaia warnings) is in `.gitignore`; it is not part of the project.
