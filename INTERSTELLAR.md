# Interstellar Deep Space Architecture Plan

## 1. Core Objective
Migrate from the raw, obscure Gaia DR3 astrometric dump (which relied on unintuitive 19-digit numerical identifiers) to a curated, hybrid, human-readable registry. This new registry provides a high-fidelity dataset structured into distinct ontological categories to improve simulation usability and educational impact.

## 2. Ingestion Pipeline Overhaul (`scripts/build_data.py`)
The data generation pipeline will be re-architected. Instead of querying 2,000 random Gaia stars, it will compile a precise list of targets mapped across four primary origins:

1.  **HYG Database (Famous & Bright Stars)**
    *   *Examples:* Sirius, Vega, Betelgeuse, Alpha Centauri, Polaris.
    *   *Purpose:* Populates local interstellar space with recognizable vectors.
2.  **Messier Catalog (Deep-Sky Objects)**
    *   *Examples:* Andromeda Galaxy (M31), Orion Nebula (M42).
    *   *Purpose:* Demonstrates macro-galactic scales (distances in thousands or millions of light-years).
3.  **NASA Exoplanet Archive**
    *   *Examples:* Gliese 12 b, TRAPPIST-1 e.
    *   *Purpose:* Grounds the simulation in cutting-edge planetary discoveries.
4.  **Static Astrometric Anchors (Anomalies)**
    *   *Examples:* Sagittarius A*, Voyager 1.
    *   *Purpose:* Provides structural galactic framing and historical context.

## 3. Data Schema Evolution
The generated `scripts/stars.json` will adopt a nested, descriptive JSON schema:

```json
{
  "id": "String (Normalized alphanumeric handle, e.g., 'sirius', 'm31')",
  "name": "String (Common human-readable name, e.g., 'Sirius (The Dog Star)')",
  "catalog_origin": "String (HYG / Messier / NASA_Exoplanet / Static)",
  "coords": [0.000000, 0.000000, 0.000000],
  "display_metrics": {
    "constellation": "String or null",
    "apparent_magnitude": 0.00,
    "true_distance_ly": 0.00,
    "scale_narrative": "String (Automated contextual text explaining object size/distance)"
  }
}
```

## 4. Frontend Types and Global State (`src/state/useFlightStore.ts`)
The `AstroObject` interface will be extended to support the new `catalog_origin` and `display_metrics` properties. The distance calculations must ensure compatibility with the new nested metrics without breaking existing Systemic math.

## 5. UI/UX Refactor: Target Selectors (`src/components/FlightConfig.tsx`)
A massive flat list of interstellar objects degrades UX. The dropdown configuration panels will be upgraded:
*   **Categorized Optgroups:** Interstellar targets will be grouped by `catalog_origin` (e.g., "Famous Stars", "Deep-Sky Objects", "Exoplanets").
*   **Contextual Readout:** A new dynamic text block will be mounted below the selection dropdowns to display the `scale_narrative` and `true_distance_ly` when an interstellar object is selected, emphasizing the scale of the target.

## 6. Execution Phases (Log File Approach)
To ensure isolation of concerns, the execution will be split into sequential runs, tracked in `LOG.md`:
*   **Run 7: Curated Data Pipeline (Python)** - Overhaul the build script and generate the new `stars.json`.
*   **Run 8: Global State Schema Update** - Update TypeScript interfaces and Zustand stores.
*   **Run 9: Categorized UI Selectors & Context Readouts** - Update the React frontend to utilize grouped `<select>` menus and mount the contextual narrative data.
