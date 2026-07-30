<div align="center">

# TerraHydroVue: National Rainfall Intelligence Dashboard (USA)

### A professional Google Earth Engine rainfall analytics platform powered by **NASA GPM IMERG V07**

<p>
  <a href="https://ee-phdstudentuiowa.projects.earthengine.app/view/nasagpmrainfallintelligencedashboard">
    <img src="https://img.shields.io/badge/Launch-Live%20GEE%20App-2E7D32?style=for-the-badge&logo=googleearthengine&logoColor=white" alt="Live GEE App">
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-1565C0?style=for-the-badge" alt="License">
  </a>
  <img src="https://img.shields.io/badge/Data-NASA%20GPM%20IMERG%20V07-6A1B9A?style=for-the-badge" alt="Data">
  <img src="https://img.shields.io/badge/Coverage-USA%20(50%20States%20%2B%20DC)-C62828?style=for-the-badge" alt="Coverage">
</p>

<p>
  <img src="https://img.shields.io/badge/Methods-Theil--Sen%20Slope-informational?style=flat-square" alt="Theil-Sen">
  <img src="https://img.shields.io/badge/Methods-Mann--Kendall-informational?style=flat-square" alt="Mann-Kendall">
  <img src="https://img.shields.io/badge/Methods-SPI-informational?style=flat-square" alt="SPI">
  <img src="https://img.shields.io/badge/Methods-ETCCDI%20Extremes-informational?style=flat-square" alt="ETCCDI">
</p>

**Near-real-time rainfall monitoring, long-term trend analysis, drought diagnostics, and extreme-event analytics for the United States — all in one interactive Google Earth Engine web application.**

</div>

---

## Quick Access

- **Live App:** [Open the National Rainfall Intelligence Dashboard](https://ee-phdstudentuiowa.projects.earthengine.app/view/nasagpmrainfallintelligencedashboard)
- **Main Script:** [`RainfallDashboard/TerraHydroVue_National_Rainfall_Dashboard.js`](./RainfallDashboard/TerraHydroVue_National_Rainfall_Dashboard.js)
- **Workflow Figure:** [`RainfallDashboard/Flowchart.png`](./RainfallDashboard/Flowchart.png)
- **License:** [MIT License](./LICENSE)

---

## Project Overview

**TerraHydroVue** is a national-scale rainfall intelligence platform developed in **Google Earth Engine (GEE)** using **NASA GPM IMERG V07** satellite precipitation data.

The dashboard is designed to support:

- **rainfall monitoring**
- **spatiotemporal trend assessment**
- **drought characterization**
- **extreme precipitation analysis**
- **climate anomaly interpretation**

across **all 50 U.S. states and the District of Columbia**.

Rather than serving only as a simple rainfall map viewer, the platform integrates **near-real-time monitoring** with **statistically robust long-term hydroclimatic analysis** in a single web-based interface.

---

## Visual Summary

<table>
  <tr>
    <td width="55%" align="center">
      <img src="./RainfallDashboard/Flowchart.png" alt="Workflow Figure" width="100%">
      <br>
      <sub><b>Figure:</b> End-to-end workflow of the rainfall intelligence system.</sub>
    </td>
    <td width="45%" valign="top">

### What the Dashboard Provides

- Nationwide rainfall monitoring
- State-wise interactive selection
- Rolling 7 / 30 / 90-day precipitation accumulation
- Long-term rainfall trend estimation
- Trend significance assessment
- Standardized drought analysis (SPI)
- Extreme rainfall metrics
- Standardized anomaly mapping
- Download-ready outputs for analysis and reporting

> **Tip:** You can make this README even more attractive by adding a second image such as a dashboard screenshot (for example `DashboardScreenshot.png`) beside the workflow figure.

   </td>
  </tr>
</table>

---

## Key Features

### 1) National Coverage
- Covers **all 50 U.S. states + Washington, DC**
- Uses **U.S. Census TIGER/Line** state boundaries
- States can be selected through the dashboard interface

### 2) Recent Rainfall Monitoring
- Rolling **7-day**, **30-day**, and **90-day** accumulated rainfall
- Derived from **GPM IMERG 30-minute precipitation**
- Useful for short-term hydrologic and rainfall condition assessment

### 3) Long-Term Trend Analysis
- Robust rainfall trend estimation using **Theil–Sen slope**
- Trend significance tested using **Mann–Kendall**
- Trends are shown only when statistically meaningful

### 4) Drought Diagnostics
- **SPI (Standardized Precipitation Index)** available at:
  - 1 month
  - 3 month
  - 6 month
  - 12 month

### 5) Extreme Rainfall Metrics
- ETCCDI-style rainfall indices including:
  - **Rx1day** — annual maximum 1-day rainfall
  - **Rx5day** — annual maximum consecutive 5-day rainfall

### 6) Climate Anomalies
- Standardized annual rainfall anomaly relative to a **2001–2020 baseline**
- Helps identify unusually wet or dry years

### 7) Export and Reproducibility
- Supports tabular and raster outputs
- Designed as a transparent, reproducible Google Earth Engine workflow

---

## Scientific Scope

This application goes beyond visualization by integrating **hydroclimatic statistics** directly within the decision-support workflow.

The dashboard combines:

- **recent rainfall accumulation**
- **historical climatology**
- **trend detection**
- **drought indicators**
- **extreme event indices**
- **standardized anomalies**

to provide a more comprehensive interpretation of precipitation variability across the United States.

---

## Data Sources

| Purpose | Dataset | Earth Engine ID |
|---|---|---|
| Recent rainfall monitoring | GPM IMERG V07 (30-minute) | `NASA/GPM_L3/IMERG_V07` |
| Historical climatology & rainfall analytics | GPM IMERG Monthly V07 | `NASA/GPM_L3/IMERG_MONTHLY_V07` |
| State boundaries | U.S. Census TIGER/Line 2018 | `TIGER/2018/States` |

### Important Data Note
IMERG precipitation is provided as a **rate (mm/hour)**, not direct accumulated rainfall depth.

Accordingly, the app converts precipitation correctly by:

- multiplying **30-minute IMERG rate × 0.5 hour** before daily accumulation
- multiplying **monthly mean rate × total hours in each month** for monthly rainfall totals

This ensures scientifically appropriate rainfall-depth calculations.

---

## Methods Used

| Method | Purpose |
|---|---|
| **Theil–Sen slope** | Robust estimation of rainfall trend magnitude |
| **Mann–Kendall test** | Statistical significance testing of monotonic trends |
| **SPI** | Standardized drought monitoring |
| **ETCCDI Rx1day / Rx5day** | Extreme rainfall characterization |
| **Standardized anomaly** | Comparison against baseline rainfall climatology |

### Baseline Period
A **2001–2020 baseline** is used for climatology and anomaly calculations.  
This baseline is appropriate given the temporal extent of the IMERG monthly archive.

---

## Live Application

### Launch the Dashboard
## [Open the National Rainfall Intelligence Dashboard](https://ee-phdstudentuiowa.projects.earthengine.app/view/nasagpmrainfallintelligencedashboard)

The live app allows users to explore rainfall conditions interactively without installing any local software.

---

## How to Use

### Option 1 — Use the Live App
Open the published GEE application directly from the link above.

### Option 2 — Run the Script in Google Earth Engine
1. Sign in to the [Google Earth Engine Code Editor](https://code.earthengine.google.com/).
2. Create a new JavaScript script.
3. Copy the contents of:  
   [`RainfallDashboard/TerraHydroVue_National_Rainfall_Dashboard.js`](./RainfallDashboard/TerraHydroVue_National_Rainfall_Dashboard.js)
4. Paste it into the GEE Code Editor.
5. Click **Run**.
6. Interact with the dashboard by selecting the desired state and analysis options.

---

## Repository Structure

```text
National_Rainfall_USA_NASA_GPM/
├── README.md
├── LICENSE
└── RainfallDashboard/
    ├── Flowchart.png
    └── TerraHydroVue_National_Rainfall_Dashboard.js
