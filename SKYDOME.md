# Implementation Plan: Astrometric Skydome (Distant Universe Background)

**Document Reference:** SKYDOME.md
**Status:** Pending Execution

## 1. Modular Execution Protocol
This implementation is broken down into discrete **Runs**.
At the end of each run, the active agent must write a summary to `LOG.md` detailing what was accomplished, any deviations, and instructions for the next agent. The next run must start by reading `Implementation Plan.md` and `LOG.md`.

## 2. Run-by-Run Execution Checklist

### 🏃 Run 1: Asset Acquisition & Optimization
* **Objective:** Source, optimize, and load an equirectangular panorama of the Milky Way.
* **Tasks:**
  * Obtain a high-resolution, royalty-free equirectangular Milky Way panorama.
  * Scale the asset to a web-friendly resolution (e.g., 4096x2048) and compress it as `.webp` or `.jpg` to minimize memory overhead.
  * Place the optimized texture in `public/assets/textures/milky_way.jpg` (or `.webp`).
* **Completion:** Write `LOG.md` detailing the asset dimensions, format, and file size optimizations.

### 🏃 Run 2: Background Component Implementation (src/components/visualizer/Skydome.tsx)
* **Objective:** Create a React Three Fiber component using modern `scene.background` techniques.
* **Tasks:**
  * **Avoid `<Sphere>` Geometries:** Do not use physical sphere geometries to avoid clipping plane conflicts (Z-fighting with `near: 0.0001` and massive `far` distances).
  * **Implementation:** Utilize `@react-three/drei`'s `<Environment background files="..." />` component, OR load the texture using `useTexture` and map it to `scene.background` using `THREE.EquirectangularReflectionMapping`.
  * **Async Loading:** Wrap the component or its parent in a `<Suspense>` boundary to prevent WebGL freezing during asset parsing.
* **Completion:** Write `LOG.md` summarizing the background rendering implementation.

### 🏃 Run 3: Astrometric Alignment & Regime State Integration
* **Objective:** Align the visual Milky Way to the Cartesian coordinate math and hook it into the global UI state.
* **Tasks:**
  * **Coordinate Alignment:** Apply a rotational offset (Euler angles) to the `scene.background` or `<Environment>` so that the visual Galactic Equator aligns exactly with the mapped RA/Dec coordinates from the HYG database in the scene.
  * **Regime Transitions:** Hook into `useFlightStore`. When the user is in the `Systemic` regime, apply a subtle color tint or lower the exposure of the background to ensure local planetary bodies pop visually. When switching to `Interstellar`, restore full exposure.
* **Completion:** Write `LOG.md` covering coordinate alignment and state integration.

## 3. Technical Constraints & Notes
- **Performance:** Do not use uncompressed `.png` for 4K/8K panoramas. The WebGL context will choke on texture upload.
- **Z-Fighting Avoidance:** By using `scene.background`, we completely bypass the need to constantly update object positions inside `useFrame`, and we avoid all clipping plane precision errors at interstellar scales.
