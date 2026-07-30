# National Rainfall Intelligence Dashboard (USA) — NASA GPM IMERG

<p align="left">
  <a href="https://ee-phdstudentuiowa.projects.earthengine.app/view/nasagpmrainfallintelligencedashboard">
    <img src="https://img.shields.io/badge/GEE-Live%20Interactive%20App-7AA116?style=for-the-badge" alt="GEE App">
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License">
  </a>
  <img src="https://img.shields.io/badge/Data-NASA%20GPM%20IMERG%20V07-darkgreen?style=for-the-badge" alt="Data">
  <img src="https://img.shields.io/badge/Coverage-50%20States%20%2B%20DC-red?style=for-the-badge" alt="Coverage">
  <img src="https://img.shields.io/badge/Methods-Theil--Sen%20%7C%20Mann--Kendall%20%7C%20SPI%20%7C%20ETCCDI-purple?style=for-the-badge" alt="Methods">
</p>

An interactive Google Earth Engine application for national-scale rainfall
monitoring, trend, drought, and extreme-event analytics across all 50 U.S.
states and the District of Columbia, built on NASA GPM IMERG V07 satellite
precipitation data.

---

## Live Application

**Launch the interactive Google Earth Engine app:**
## [Open the National Rainfall Intelligence Dashboard](https://ee-phdstudentuiowa.projects.earthengine.app/view/nasagpmrainfallintelligencedashboard)

---

## Visual Highlights

<table>
  <tr>
    <td align="center" width="50%">
      <img src="./docs/flowchart.png" alt="Application Workflow" width="100%">
      <br>
      <b>Data &amp; Analysis Workflow</b>
    </td>
    <td align="center" width="50%">
      <img src="./docs/screenshot.png" alt="Dashboard Interface" width="100%">
      <br>
      <b>Interactive Dashboard Interface</b>
    </td>
  </tr>
</table>

---

## Overview

This repository contains a reproducible, national-scale Google Earth Engine
workflow for U.S. rainfall analytics. It moves beyond simple accumulation maps
by combining near-real-time monitoring with statistically rigorous long-term
climate analysis in a single interactive dashboard:

- recent rainfall monitoring from half-hourly IMERG,
- robust long-term trend estimation with significance testing,
- standardized drought indices,
- satellite-based extreme-event indices, and
- standardized anomalies against a fixed climate baseline,

all with per-state data download in CSV and GeoTIFF formats.

---

## Key Features

- **National coverage** — all 50 states + DC (`TIGER/2018/States`), selectable
  by dropdown or map click
- **Recent monitoring** — rolling 7 / 30 / 90-day rainfall accumulation
- **Robust trend** — Theil–Sen slope with **Mann–Kendall** significance
  (trend reported only when p < 0.05)
- **Drought index** — Standardized Precipitation Index (SPI) at 1 / 3 / 6 / 12
  month timescales
- **Extreme indices** — ETCCDI Rx1day and Rx5day from IMERG daily totals
- **Anomalies** — standardized annual anomaly vs a 2001–2020 baseline
- **Colorblind-safe visualization** — viridis (magnitude) and ColorBrewer
  BrBG / RdBu (diverging) palettes
- **Data download** — CSV (daily series, annual totals + trend, monthly
  climatology) and GeoTIFF (any raster layer)
- **Runtime date detection** — the app auto-detects the latest available IMERG
  data, so it stays current with no code changes

---

## Study Area

The application covers the full territory of the United States — all
**50 states plus the District of Columbia** — using U.S. Census TIGER/Line
2018 state boundaries.

---

## Data Sources

| Purpose | Dataset | Earth Engine ID |
|---|---|---|
| Recent monitoring, daily extremes | GPM IMERG V07 (30-minute) | `NASA/GPM_L3/IMERG_V07` |
| Historical totals, trend, SPI, climatology | GPM IMERG Monthly V07 | `NASA/GPM_L3/IMERG_MONTHLY_V07` |
| State boundaries | U.S. Census TIGER 2018 | `TIGER/2018/States` |

IMERG precipitation bands are **rates (mm/hour)**. The app converts them to
depths: monthly rate × hours-in-month, and half-hourly rate × 0.5 h summed per
day. Monthly IMERG lags real time by several months, so trend and climatology
use the latest **complete** calendar year, and any partial year is flagged in
the UI.

---

## Scientific Methods

Full equations, assumptions, and references are in
[`docs/METHODS.md`](docs/METHODS.md). Summary:

| Method | Purpose | Reference |
|---|---|---|
| Theil–Sen slope | Robust trend magnitude (mm/yr) | Sen (1968) |
| Mann–Kendall test | Trend significance (p-value) | Mann (1945); Kendall (1975) |
| SPI (1/3/6/12-month) | Standardized drought index | McKee et al. (1993) |
| ETCCDI Rx1day, Rx5day | Extreme-rainfall indices | Zhang et al. (2011) |
| Standardized anomaly | Departure from baseline (z) | — |

**Baseline:** 2001–2020. IMERG monthly begins mid-2000, so a WMO 1991–2020
normal is not possible; a 20-year IMERG-native window is used throughout. See
[`docs/METHODS.md`](docs/METHODS.md) for the rationale.

---

## Quick Start

1. Sign in to the
   [Earth Engine Code Editor](https://code.earthengine.google.com/) with an
   Earth Engine–enabled Google account.
2. Copy the contents of
   [`src/TerraHydroVue_National_Rainfall_Dashboard.js`](src/TerraHydroVue_National_Rainfall_Dashboard.js)
   into a new script.
3. Click **Run**. Select a state and analysis period, then **Run Analysis**.

Or simply use the
[live app](https://ee-phdstudentuiowa.projects.earthengine.app/view/nasagpmrainfallintelligencedashboard) —
no installation required.

---

## Limitations

- **Satellite, not gauge.** IMERG values are satellite-derived area means and
  are **not** a substitute for rain-gauge validation. Satellite extreme-value
  indices (Rx1day, Rx5day) carry larger uncertainty than gauge-based ETCCDI.
- **SPI is a normal-based approximation**, not a gamma fit (Earth Engine has no
  closed-form gamma inverse). It closely approximates gamma-fit SPI at ≥ 3-month
  scales and is weakest at 1 month. This is labeled in the app UI.
- **Performance.** Nationwide multi-decade reductions are computation-heavy; the
  app coarsens the interactive scale for large states. Full-resolution GeoTIFF
  of large rasters uses an `Export.image.toDrive` fallback (requires your own
  Earth Engine account).

---

## Repository Structure

```text
National_Rainfall_USA_NASA_GPM/
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── src/
│   └── TerraHydroVue_National_Rainfall_Dashboard.js   # the GEE application
└── docs/
    ├── METHODS.md          # equations, assumptions, references
    ├── flowchart.png       # data & analysis workflow
    └── screenshot.png      # dashboard interface
```

---

## Author

**Mirza Md Tasnim Mukarram**

Informatics, Dept of Computer Science
School of Earth, Environment, and Sustainability​
FAA 107 Certified Remote Pilot | PGD (Data Science)​ | MEcon (Environmental Economics)​ | BSc (Civil & Environmental Engineering)

Office: 216 Jessup Hall (JH), 5 West Jefferson Street
Iowa City, IA 52242, United States, The University of Iowa
Phone: +1 (319) 800 8098
Email: mtasnimmukarram@uiowa.edu

---

## Citation

If you use this repository, application, or derived outputs, please cite it
along with the underlying NASA GPM IMERG datasets (see the DOIs on the
[GES DISC IMERG pages](https://disc.gsfc.nasa.gov/)). A suggested form:

> Mukarram, M. M. T. (2026). *National Rainfall Intelligence Dashboard (USA):
> An interactive Google Earth Engine application using NASA GPM IMERG V07.*
> GitHub repository.

---

## License

Released under the MIT License — see [`LICENSE`](LICENSE).
The NASA GPM IMERG and U.S. Census TIGER/Line datasets retain their own terms
of use and citation requirements.
