---
name: Interstellar Kinematics Simulator
colors:
  surface: '#020617'
  surface-dim: '#0e1416'
  surface-bright: '#343a3c'
  surface-container-lowest: '#090f11'
  surface-container-low: '#171d1e'
  surface-container: '#1b2122'
  surface-container-high: '#252b2d'
  surface-container-highest: '#303638'
  on-surface: '#dee3e6'
  on-surface-variant: '#bcc9cd'
  inverse-surface: '#dee3e6'
  inverse-on-surface: '#2b3133'
  outline: '#869397'
  outline-variant: '#3d494c'
  surface-tint: '#4cd7f6'
  primary: '#4cd7f6'
  on-primary: '#003640'
  primary-container: '#06b6d4'
  on-primary-container: '#00424f'
  inverse-primary: '#00687a'
  secondary: '#ffb95f'
  on-secondary: '#472a00'
  secondary-container: '#ee9800'
  on-secondary-container: '#5b3800'
  tertiary: '#ffb873'
  on-tertiary: '#4b2800'
  tertiary-container: '#e89337'
  on-tertiary-container: '#5b3200'
  error: '#ef4444'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#acedff'
  primary-fixed-dim: '#4cd7f6'
  on-primary-fixed: '#001f26'
  on-primary-fixed-variant: '#004e5c'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#ffdcbf'
  tertiary-fixed-dim: '#ffb873'
  on-tertiary-fixed: '#2d1600'
  on-tertiary-fixed-variant: '#6a3b00'
  background: '#0e1416'
  on-background: '#dee3e6'
  surface-variant: '#303638'
  canvas: '#0f172a'
  border: '#1e293b'
typography:
  clock-display:
    fontFamily: jetbrainsMono
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  section-heading:
    fontFamily: jetbrainsMono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  telemetry-readout:
    fontFamily: jetbrainsMono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  micro-label:
    fontFamily: jetbrainsMono
    fontSize: 10px
    fontWeight: '400'
    lineHeight: 12px
spacing:
  margin: 1.5rem
  gutter: 1rem
  panel-left: 25%
  panel-center: 50%
  panel-right: 25%
---

# Design Specification: Interstellar Kinematics Simulator Dashboard
## 1. Document Overview & Objective
This document defines the complete user interface layout, visual hierarchy, theme constraints, and state-driven component behaviors for the Interstellar Kinematics Simulator. It serves as the single source of truth for UI generation agents (e.g., Google Stitch) and frontend development agents (e.g., Google Antigravity).
---
## 2. Visual Theme & Aesthetic Guidelines
### 2.1 Color Palette (Strict Dark Mode / Tactical Aerospace)
* **Application Canvas (Background):** Deep Slate (`#0f172a` / Tailwind `bg-slate-900`)
* **Component Containers (Surfaces):** Absolute Dark Slate (`#020617` / Tailwind `bg-slate-950`)
* **Borders, Rules, Dividers:** Medium Slate (`#1e293b` / Tailwind `border-slate-800`)
* **Primary Sublight Accent:** Neon Cyan (`#06b6d4` / Tailwind `text-cyan-500`, `bg-cyan-500`)
* **Primary Superluminal Accent:** Deep Amber (`#f59e0b` / Tailwind `text-amber-500`, `bg-amber-500`)
* **Alerts / System Errors:** Crimson Red (`#ef4444` / Tailwind `text-red-500`)
### 2.2 Typography Hierarchy
* **Primary Typeface:** Native system monospace font stack (ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace). NO EXTERNAL FONTS.
* **Sizing Matrix:**
    * Global Header Clocks: `text-2xl` to `text-3xl`, tracking tight, tabular figures (monospace numerical alignment to prevent jitter).
    * Section Headings: `text-xs`, font-bold, tracking-wider, uppercase.
    * Telemetry Readouts: `text-sm`, font-mono.
    * Micro Labels / Units: `text-[10px]`, font-mono, opacity-50.
---
## 3. Layout Architecture & Responsive Grid System
The interface uses a strict 3-column asymmetric layout confined to exactly `100vh`. No vertical scrolling is permitted on the desktop viewport to maintain a locked "mission control console" presentation.
```text
┌──────────────────────────────────────────────────────────────────────────┐
│                      1. GLOBAL HEADER & MASTER CLOCKS                    │
├───────────────────┬──────────────────────────────────┬───────────────────┤
│                   │                                  │                   │
│   2. LEFT PANEL   │         3. CENTER PANEL          │  4. RIGHT PANEL   │
│   Flight Config   │   Tactical Visualization Array   │  Telemetry & HUD  │
│   (Width: 25%)    │           (Width: 50%)           │   (Width: 25%)    │
│                   │                                  │                   │
└───────────────────┴──────────────────────────────────┴───────────────────┘
```
## 4. UI Components & Controls
* **Icons & Decorations:** STRICTLY NO EXTERNAL PACKAGES. Use raw inline SVG vectors or text glyphs (▲, ▼, █, ◄, ►, ⚙, ⏛).
* **Mock Dataset:**
    1. Earth (Systemic, Coords: 0, 0, 0)
    2. Saturn (Systemic, Coords: 0, 9.58, 0)
    3. Alpha Centauri (Interstellar, Coords: 0.75, 1.21, -1.02)
    4. Betelgeuse (Interstellar, Coords: 45.2, 120.6, -140.1)
