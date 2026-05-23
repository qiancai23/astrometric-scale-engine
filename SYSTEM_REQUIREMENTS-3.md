# System Requirements Specification: Interstellar Kinematics Simulator
## 1. System Abstract & Architectural Blueprint
The Interstellar Kinematics Simulator is a decoupled, client-side data visualization engine that computes and renders interstellar flight trajectories using relativistic kinematics and non-Newtonian space-time metrics.
The system operates on a state-driven architecture, separating raw data processing and math verification pipelines from the display layout.
```text
  [ PYTHON PIPELINE ] ─┬> Generates ─> [ stars.json ]    (Interstellar Layer)
                       │                    │
  (Gaia DR3 & JPL)     └> Generates ─> [ systemic.json ] (Local Solar Layer)
                                            │
                                      (Pre-cached)
                                            ▼
  [ STATE CONTROLLER (Zustand) ] <───> [ DATA ROUTER / INTERLOCK ]
         │                                  │
         ▼                                  ▼
  [ RENDER ENGINE (Three.js) ]         [ RELATIVISTIC PHYSICS ENGINE ]
  (WebGL Scene Graph)                  (Brachistochrone & Metric Integrators)

```
## 2. Celestial Data & Coordinate Processing Pipeline (Data Layer)
### 2.1 Data Sourcing & Extraction Invariants
 * **Interstellar Sourcing:** Input star data must be sourced from the **ESA Gaia Archive (Data Release 3)**.
 * **Systemic Sourcing:** Local solar system bodies (planets, major moons, asteroids) must be sourced from the **NASA JPL Horizons** ephemeris system.
 * **Pre-computation Boundary:** High-latency astronomical queries are strictly forbidden at runtime. The frontend must consume localized, optimized JSON manifests compiled during the build phase via a standalone Python utility script (astroquery).
 * **Manifest Payload Envelope:** The production asset database is capped at the top 2,000 nearest stars to Sol and a curated list of major solar system bodies to guarantee instant client-side processing over low-bandwidth environments.
### 2.2 Ingestion Data Schema
Every record within the cached index files must conform to this JSON schema layout:
**Interstellar Schema (stars.json)**
```json
{
  "id": "String (Unique Gaia DR3 Source Identifier)",
  "name": "String (Common name or Bayer designation)",
  "coords": [0.000000, 0.000000, 0.000000], 
  "mag": 0.00
}

```
**Systemic Schema (systemic.json)**
```json
{
  "id": "String (JPL Horizons Body ID)",
  "name": "String (Common planetary/body name)",
  "type": "String (Planet, Moon, Asteroid)",
  "coords": [0.000000, 0.000000, 0.000000] 
}

```
### 2.3 Mathematical Transformation Rules
The preprocessing pipeline must transform raw Gaia coordinate properties—Right Ascension (\alpha), Declination (\delta), and Parallax (\varpi)—into a standard 3D Cartesian grid layout with the origin (0,0,0) locked to Sol. (JPL Horizons data is already provided in Cartesian format and requires no trigonometric transformation).
#### 2.3.1 Distance Conversion from Parallax
Distance (d) in parsecs is calculated directly from the parallax arcsecond value.
#### 2.3.2 Spherical to Cartesian Mapping
```text
          +Z (North Celestial Pole)
             ^
             │   . Star (x,y,z)
             │  /
             │ /  Declination (δ)
             │/____________> +Y
            / ＼
           /    ＼ Right Ascension (α)
          v       ＼
        +X (Vernal Equinox)

```

Using distance d, Right Ascension \alpha, and Declination \delta, the script maps spatial properties via standard trigonometric functions.
#### 2.3.3 Absolute Distance Vector Integral
The calculation engine must determine the absolute travel distance vector between any chosen Origin Node (S_1) and Destination Node (S_2) using this 3D Euclidean space distance formula:
## 3. Relativistic Physics & Kinematics Engine (Logic Layer)
The physics backend handles calculations using two distinct algorithmic tracks based on the active engine selection state.
### 3.1 Sub-light Track (Tiers 1–4): Relativistic Brachistochrone Calculus
Sub-light engines must model a continuous-thrust profile consisting of constant acceleration (a) up to the spatial midpoint, followed by a 180° flip maneuver and a matching constant deceleration phase back to zero velocity at destination.

```text
VELOCITY PROFILE (With Velocity Ceiling Cap)
      Velocity
         ^
  v_max ─┼─────── /───────────────────────────＼
         │       /                             ＼
         │      /   [ CONSTANT CRUISE PHASE ]   ＼
         │     /                                 ＼
         │    / [ACCEL]                   [DECEL] ＼
       0 ┼───┴─────────────────────────────────────┴───> Time
             │   |            |               |    │
         Start   Midpoint A   Cruise Exits    Arrival

```
#### 3.1.1 Continuous Uncapped Thrust Formulas
If the vessel accelerates continuously across the vector without hitting a user-defined velocity cap (v_{max}), the core functions must calculate Proper Time (\tau, passenger watch time) and Coordinate Time (t, Earth master baseline time) via hyperbolic integration.

 * **Onboard Proper Passenger Time (\tau):**
 * **Earth Observer Coordinate Time (t):**
   
#### 3.1.2 Capped Profile Segment Integration
If a velocity ceiling cap is active (v_{max} < \text{peak velocity achieved over } d/2), the physics module must segment the flight path into three sequential phases to run its calculations:
 1. **Acceleration Phase:** From velocity 0 up to v_{max}. Calculates time (t_a, \tau_a) and distance traversed (d_a).
 2. **Deceleration Phase:** Symmetric footprint identical to the acceleration phase (d_d = d_a).
 3. **Linear Cruise Phase:** Crosses the remaining mid-flight distance (d_c = d - 2d_a) at a flat velocity plateau. Time dilation within this middle segment must hold the Lorentz Factor (\gamma) constant.
### 3.2 Superluminal Track (Tier 5): Spacetime Metric Engine
When the user switches the simulator state to Alcubierre Warp Metric, the backend bypasses relativistic equations entirely to prioritize flat space-time expansion metrics.
 * **Lorentz Invariant Override:** The Lorentz Factor (\gamma) must lock hard to a constant vector value of 1.00000000.
 * **Velocity Propagation:** Travel time across the absolute distance vector is calculated linearly using the selected Warp Factor multiplier (w).
 * **Temporal Balance:** The system must enforce perfect clock synchronization. The final elapsed time recorded on Earth must perfectly equal the final elapsed time recorded on the ship.
### 3.3 Logistics & Energy Expenditures
The physics engine must estimate total mission energy requirements (E) in Exajoules. For sub-light tiers, this must incorporate the true Relativistic Kinetic Energy equation ($E_k = (\gamma - 1) M_0 c^2$) to reflect the massive cost of accelerating the Hull Structural Mass ($M_0$). For Superluminal (Warp) tiers, energy costs are speculative and can be modeled as a function of the input mass combined with total integration time to represent baseline engine reactor upkeep overhead.
## 4. UI Control Interlock & State Invariants
### 4.1 State-Driven Input Visibility Rules
The application state machine must maintain structural consistency by dynamically adjusting logic bounds based on the active engine selection:
 * **Sub-light Configuration:** Mounts the Constant Thrust slider and the Terminal Velocity Cap slider. Applies sub-light relativistic mathematical tracks.
 * **Superluminal Configuration:** Unmounts the sub-light sliders. Mounts a single Warp Factor input slider. Bypasses relativistic math for linear velocity models.
### 4.2 Mathematical Input Constraints
To support reactive sliders without generating infinite recalculation loops or app crashes, the UI state machine must follow these strict operational rules:
 * **Unidirectional Flow:** Time is strictly an output variable. Modifying an input slider (Acceleration or Velocity Ceiling) instantly triggers a payload recalculation downstream to update the output cards (Travel Duration).
 * **Mass Isolation:** Adjustments to the Hull Structural Mass slider affect **only** the Energy (E) calculations. Mass modifications must never trigger kinematic timescale recalculations.
## 5. Non-Functional & Runtime Execution Requirements
### 5.1 Presentation Framework Limits
 * **Viewport Geometry:** The interface layout must be locked to a single, un-scrollable desktop frame container (100vh). All internal modular panels must use absolute sizing vectors or strict flex/grid rows to prevent elements from breaking alignment during window scaling.
 * **Zero Jitter Requirement:** To stop numerical readouts and clock modules from shifting or shaking during fast update runs, the app must use a native, fixed-width tabular monospace typography stack:
```css
font-family: ui-monospace, SFMono-Regular, Consolas, Monaco, monospace;

```
### 5.2 Graphic and Asset Isolation
 * **Allowed External Assets:** The app is permitted to use Google Fonts via CDN (e.g., JetBrains Mono) for cross-device compatibility and typographic flexibility.
 * **Vector Self-Containment:** All visual markers, lock switches, and status metrics must be written using raw inline SVGs embedded inside the source files.
### 5.3 Hosting Integration and Optimization Constraints
 * **Relative Path Compilation:** The compilation build config (vite.config.js) must be explicitly set to use relative root paths:
```javascript
base: './'

```
This ensures the final build output runs smoothly out of any isolated subdirectory or local folder without throwing broken absolute path exceptions.
 * **WordPress Isolation Guardrail:** The code must run seamlessly when dropped inside a WordPress custom HTML page iframe container. The sandbox wrapper must keep layout scripts from leaking out or clashing with the outer website's parent styling rules.
 * **Asynchronous Interaction Optimization:** High-fidelity mathematical recalculation loops must bind exclusively to the onChangeEnd user event hooks of the sliders. While a slider is actively dragging, the graphics engine must display a low-sample path estimation vector (~50 processing points) to keep the browser running at a smooth 60 FPS.
