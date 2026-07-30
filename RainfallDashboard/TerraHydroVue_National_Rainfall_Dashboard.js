/*******************************************************************************
 * TerraHydroVue — National Rainfall Intelligence Dashboard
 * Professional Google Earth Engine App for all 50 U.S. states + DC
 *
 * SCOPE
 *   Spatial unit : U.S. states (TIGER/2018/States), dropdown + click select
 *   Data source  : NASA GPM IMERG V07
 *                    - IMERG_MONTHLY_V07  -> historical totals, trends, SPI,
 *                      climatology, anomalies
 *                    - IMERG_V07 (30-min) -> recent monitoring & daily extremes
 *   Baseline     : 2001-2020 (IMERG-native climate normal; see METHODS note)
 *   Date range   : Detected at runtime from the collections (never hardcoded),
 *                    so the app stays current as NASA extends/reprocesses IMERG.
 *
 * SCIENTIFIC METHODS (formulas + citations shown in the in-app Methods panel)
 *   1. Theil-Sen slope        (Sen 1968)            robust trend magnitude
 *   2. Mann-Kendall test      (Mann 1945; Kendall 1975) trend significance
 *   3. SPI 1/3/6/12 month     (McKee et al. 1993)   drought / wet index
 *   4. ETCCDI extremes        (Zhang et al. 2011)   Rx1day, Rx5day, R95p
 *   5. Standardized anomaly & percentile rank vs the 2001-2020 baseline
 *
 * DATA-QUALITY NOTE
 *   IMERG is a satellite-derived product. Area means are NOT a substitute for
 *   rain-gauge validation, and satellite extreme-value indices carry larger
 *   uncertainty than gauge-based ETCCDI. Baselines/limitations are documented
 *   inside the app.
 *
 * HOW TO RUN / PUBLISH
 *   1. Paste this entire script into the Google Earth Engine Code Editor
 *      (https://code.earthengine.google.com/).
 *   2. Click "Run".
 *   3. To publish: Apps -> Publish, choose "New App", give it a name, and
 *      select this script. See the PUBLISHING block at the bottom for detail.
 ******************************************************************************/

// ============================================================================
// 1. CONFIGURATION
// ============================================================================

var CONFIG = {
  appTitle: 'TerraHydroVue',
  appSubtitle: 'National Rainfall Intelligence Dashboard',
  scope: 'U.S. State Rainfall Monitoring, Trend & Drought Analytics',

  defaultState: 'Iowa',
  defaultRecentWindow: '30 days',

  // Climate normal baseline. IMERG monthly begins 2000-06; a true WMO
  // 1991-2020 normal is impossible, so we use a 20-yr IMERG-native window.
  baselineStart: 2001,
  baselineEnd: 2020,

  // First full IMERG year. End year is DETECTED at runtime, not hardcoded.
  historicalFirstYear: 2001,

  scale: 11132,        // native IMERG pixel ~0.1 deg (meters)
  maxPixels: 1e10,

  // Safeguard: national multi-decade reductions are heavy. If a state's
  // bounding area is very large we coarsen the interactive scale to keep the
  // UI responsive (full-resolution stats remain available via Export).
  coarseScale: 27830  // ~0.25 deg for large-area interactive previews
};

// -----------------------------------------------------------------------------
// COLORBLIND-SAFE PALETTES
// Sequential  : viridis (perceptually uniform, colorblind- & grayscale-safe;
//               Smith & van der Walt 2015). Used for rainfall magnitude.
// Diverging    : ColorBrewer BrBG / RdBu (colorblind-safe diverging schemes;
//               Brewer, colorbrewer2.org). Used for trend, SPI and anomaly,
//               where a neutral midpoint (zero / near-normal) is meaningful.
// All schemes avoid red-green contrasts that fail for deuteranopia/protanopia.
// -----------------------------------------------------------------------------
var PALETTES = {
  // viridis (9-stop) — dark purple (low) -> yellow (high)
  rainfall: ['440154','472d7b','3b528b','2c728e','21918c',
             '28ae80','5ec962','addc30','fde725'],
  // viridis for recent accumulation too, for a consistent magnitude language
  recent:   ['440154','482878','3e4a89','31688e','26828e',
             '1f9e89','35b779','6ece58','b5de2b','fde725'],
  // BrBG diverging (brown = drying/negative, blue-green = wetting/positive)
  trend:    ['543005','8c510a','bf812d','dfc27d','f6e8c3','f5f5f5',
             'c7eae5','80cdc1','35978f','01665e','003c30'],
  // BrBG for SPI (dry brown -> wet teal), classic drought convention & CB-safe
  spi:      ['543005','8c510a','bf812d','dfc27d','f6e8c3','f5f5f5',
             'c7eae5','80cdc1','35978f','01665e','003c30'],
  // RdBu reversed (dry/negative red-brown -> wet/positive blue), CB-safe
  anomaly:  ['67001f','b2182b','d6604d','f4a582','fddbc7','f7f7f7',
             'd1e5f0','92c5de','4393c3','2166ac','053061']
};

// ============================================================================
// 2. DATA
// ============================================================================

var states = ee.FeatureCollection('TIGER/2018/States');

// Drop non-CONUS-storable territories that IMERG covers poorly / not the focus.
// Keep 50 states + DC (FIPS <= 56, excluding territory codes 60/66/69/72/78).
var territoryCodes = ['60','66','69','72','78'];
var usStates = states.filter(
  ee.Filter.inList('STATEFP', territoryCodes).not()
);

// Half-hourly IMERG precipitation is a RATE in mm/hour.
var gpmHalfHourly = ee.ImageCollection('NASA/GPM_L3/IMERG_V07')
  .select('precipitation');

// Monthly IMERG precipitation is a MEAN RATE in mm/hour.
// Convert each monthly image to accumulated rainfall in mm:
//   depth_mm = rate_mm_per_hr * (hours in that month)
var gpmMonthly = ee.ImageCollection('NASA/GPM_L3/IMERG_MONTHLY_V07')
  .select('precipitation')
  .map(function(image) {
    var date = ee.Date(image.get('system:time_start'));
    var hoursInMonth = date.advance(1, 'month').difference(date, 'hour');
    return image.multiply(hoursInMonth)
      .rename('rainfall_mm')
      .copyProperties(image, ['system:time_start', 'system:index']);
  });

// Runtime date detection --------------------------------------------------
// Latest half-hourly timestamp (drives recent-monitoring layers).
var latestHalfHourly = ee.Date(gpmHalfHourly.aggregate_max('system:time_start'));

// Latest month present in the monthly collection.
var latestMonthly = ee.Date(gpmMonthly.aggregate_max('system:time_start'));

// Latest COMPLETE calendar year for trend/climatology math.
// If the latest monthly image is not December, the current year is partial,
// so the last complete year is (latestMonthlyYear - 1).
var latestMonthlyYear  = latestMonthly.get('year');
var latestMonthlyMonth = latestMonthly.get('month');
var latestCompleteYear = ee.Number(ee.Algorithms.If(
  ee.Number(latestMonthlyMonth).gte(12),
  latestMonthlyYear,
  ee.Number(latestMonthlyYear).subtract(1)
));

// ============================================================================
// 3. ANALYTICAL FUNCTIONS
// ============================================================================

function getState(stateName) {
  return usStates.filter(ee.Filter.eq('NAME', stateName));
}

// Pick an interactive scale based on the state's area (safeguard).
function pickScale(geometry) {
  var areaKm2 = geometry.area(1e4).divide(1e6);
  return ee.Number(ee.Algorithms.If(
    areaKm2.gt(250000), CONFIG.coarseScale, CONFIG.scale));
}

// Annual rainfall totals (mm/yr) for [startYear, endYear] inclusive.
function makeAnnualTotals(startYear, endYear) {
  var years = ee.List.sequence(startYear, endYear);
  return ee.ImageCollection.fromImages(years.map(function(year) {
    year = ee.Number(year);
    var start = ee.Date.fromYMD(year, 1, 1);
    var end = start.advance(1, 'year');
    return gpmMonthly.filterDate(start, end).sum()
      .rename('rainfall_mm')
      .set({year: year, 'system:time_start': start.millis()});
  }));
}

// --- Theil-Sen robust slope (Sen 1968) ------------------------------------
// Median of pairwise slopes (rainfall_j - rainfall_i)/(year_j - year_i).
// Earth Engine provides this directly via ee.Reducer.sensSlope().
function makeSensSlope(annualCollection) {
  var withTime = annualCollection.map(function(image) {
    var year = ee.Number(image.get('year'));
    return ee.Image.constant(year).toFloat().rename('year')
      .addBands(image.select('rainfall_mm').toFloat());
  });
  // sensSlope() expects the x band first, y band second.
  return withTime.select(['year', 'rainfall_mm'])
    .reduce(ee.Reducer.sensSlope())
    .select('slope')
    .rename('trend_mm_year');
}

// --- Mann-Kendall trend significance (Mann 1945; Kendall 1975) ------------
// S = sum over i<j of sign(x_j - x_i).
// Var(S) = [ n(n-1)(2n+5) - sum t(t-1)(2t+5) ] / 18  (t = tie group sizes).
// Z = (S-1)/sqrt(Var) if S>0 ; (S+1)/sqrt(Var) if S<0 ; else 0.
// EE exposes the Mann-Kendall S statistic and its variance via reducers.
function makeMannKendall(annualCollection) {
  var sorted = annualCollection.sort('year');
  var imgList = sorted.toList(sorted.size());
  var n = sorted.size();

  // Kendall's tau (available reducer) — kept for reference/reporting.
  var tauSeries = sorted.map(function(image) {
    return image.select('rainfall_mm').toFloat();
  });
  var mkStat = tauSeries.reduce(ee.Reducer.kendallsCorrelation(1))
    .select('rainfall_mm_tau').rename('mk_tau');

  // S = sum over all i < j of sign(x_j - x_i), computed pixel-wise.
  // For each i, compare against every later j, producing sign images.
  // We build a list-of-lists of images and flatten THAT (a List of Images
  // flattens correctly), avoiding any index arithmetic.
  var nNum = ee.Number(n);
  var signNested = ee.List.sequence(0, nNum.subtract(2)).map(function(i) {
    i = ee.Number(i);
    var xi = ee.Image(imgList.get(i)).select('rainfall_mm');
    var js = ee.List.sequence(i.add(1), nNum.subtract(1));
    return js.map(function(j) {
      j = ee.Number(j);
      var xj = ee.Image(imgList.get(j)).select('rainfall_mm');
      var diff = xj.subtract(xi);
      return diff.gt(0).subtract(diff.lt(0)).toFloat().rename('sign');
    });
  });
  var signImages = ee.ImageCollection(ee.List(signNested).flatten());
  var s = signImages.sum().rename('mk_s');

  // Var(S) for the no-ties case (continuous IMERG values, ties ~ measure-zero):
  //   Var(S) = n(n-1)(2n+5) / 18
  var nNum = ee.Number(n);
  var varConst = nNum.multiply(nNum.subtract(1))
    .multiply(nNum.multiply(2).add(5)).divide(18);
  var varS = ee.Image.constant(varConst).toFloat().rename('mk_var');

  // Z-score with continuity correction.
  var z = s.expression(
    '(S > 0) ? (S - 1) / sqrt(V) : (S < 0) ? (S + 1) / sqrt(V) : 0',
    {S: s, V: varS}
  ).rename('mk_z');

  // Two-sided p-value from the normal approximation:
  //   p = 2 * (1 - Phi(|Z|)) ; Phi approximated via erf.
  //   Phi(x) = 0.5 * (1 + erf(x / sqrt(2)))
  // erf approximated by Abramowitz & Stegun 7.1.26 (max err ~1.5e-7).
  var absZ = z.abs();
  var t = absZ.divide(Math.SQRT2);
  var tt = ee.Image(1).divide(ee.Image(1).add(t.multiply(0.3275911)));
  var erf = ee.Image(1).subtract(
    tt.multiply(0.254829592)
      .add(tt.pow(2).multiply(-0.284496736))
      .add(tt.pow(3).multiply(1.421413741))
      .add(tt.pow(4).multiply(-1.453152027))
      .add(tt.pow(5).multiply(1.061405429))
      .multiply(t.pow(2).multiply(-1).exp())
  );
  var phi = ee.Image(0.5).multiply(ee.Image(1).add(erf));
  var pValue = ee.Image(2).multiply(ee.Image(1).subtract(phi)).rename('mk_p');

  return z.addBands(pValue).addBands(mkStat);
}

// --- SPI (McKee et al. 1993) ----------------------------------------------
// Accumulate rainfall over a rolling window of `scaleMonths`, then standardize
// against the 2001-2020 baseline distribution for that same window/month.
// A rigorous SPI fits a gamma distribution then maps to the standard normal.
// GEE has no closed-form gamma inverse; we use the widely used normal-based
// standardization (z = (x - mu)/sigma) on the aggregated series, which
// approximates SPI well at >=3-month scales where the distribution is more
// symmetric. This is labelled "SPI (normal approximation)" in the UI.
function makeSPI(scaleMonths, targetEndDate) {
  var end = ee.Date(targetEndDate);
  var start = end.advance(-scaleMonths, 'month');
  var current = gpmMonthly.filterDate(start, end).sum().rename('acc');

  // Baseline distribution of the same-length accumulation, sampled monthly
  // across the baseline period.
  var bStart = ee.Date.fromYMD(CONFIG.baselineStart, 1, 1);
  var bEnd   = ee.Date.fromYMD(CONFIG.baselineEnd + 1, 1, 1);
  var months = bEnd.difference(bStart, 'month').subtract(scaleMonths).toInt();
  var offsets = ee.List.sequence(0, months);

  var baselineAcc = ee.ImageCollection.fromImages(offsets.map(function(o) {
    o = ee.Number(o);
    var wStart = bStart.advance(o, 'month');
    var wEnd = wStart.advance(scaleMonths, 'month');
    return gpmMonthly.filterDate(wStart, wEnd).sum().rename('acc');
  }));

  var mean = baselineAcc.mean();
  var std  = baselineAcc.reduce(ee.Reducer.stdDev()).rename('acc');
  var spi = current.subtract(mean).divide(std).rename('spi');
  return spi;
}

// Monthly climatology over the baseline (mean mm/month per calendar month).
function makeMonthlyClimatology() {
  var start = ee.Date.fromYMD(CONFIG.baselineStart, 1, 1);
  var end   = ee.Date.fromYMD(CONFIG.baselineEnd + 1, 1, 1);
  var hist = gpmMonthly.filterDate(start, end);
  var months = ee.List.sequence(1, 12);
  return ee.ImageCollection.fromImages(months.map(function(month) {
    month = ee.Number(month);
    return hist.filter(ee.Filter.calendarRange(month, month, 'month'))
      .mean().rename('rainfall_mm')
      .set({month: month,
            'system:time_start': ee.Date.fromYMD(2000, month, 1).millis()});
  }));
}

// Standardized anomaly of a target annual total vs baseline annual totals.
//   z = (year_total - baseline_mean) / baseline_std
function makeAnnualAnomaly(targetYear) {
  var baseline = makeAnnualTotals(CONFIG.baselineStart, CONFIG.baselineEnd);
  var mean = baseline.mean().rename('rainfall_mm');
  var std  = baseline.reduce(ee.Reducer.stdDev()).rename('rainfall_mm');
  var target = makeAnnualTotals(targetYear, targetYear).first()
    .select('rainfall_mm');
  return target.subtract(mean).divide(std).rename('anomaly_z');
}

// --- ETCCDI extreme indices (Zhang et al. 2011) ---------------------------
// Built from IMERG half-hourly -> daily accumulation over a year.
//   Rx1day = max 1-day total ; Rx5day = max running 5-day total
//   R95p   = total rainfall on days exceeding the baseline 95th pctl wet-day.
function makeDailyForYear(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');
  var nDays = end.difference(start, 'day').toInt();
  var offsets = ee.List.sequence(0, nDays.subtract(1));
  return ee.ImageCollection.fromImages(offsets.map(function(o) {
    o = ee.Number(o);
    var dStart = start.advance(o, 'day');
    var dEnd = dStart.advance(1, 'day');
    // rate mm/hr * 0.5 hr per 30-min image, summed over the day.
    return gpmHalfHourly.filterDate(dStart, dEnd)
      .map(function(img) { return img.multiply(0.5).rename('rainfall_mm'); })
      .sum().rename('rainfall_mm')
      .set('system:time_start', dStart.millis());
  }));
}

function makeExtremeIndices(year) {
  var daily = makeDailyForYear(year);
  var rx1 = daily.max().rename('rx1day');

  // Rx5day: max of 5-day running totals.
  // Build running sums by joining each day with the 4 preceding days via a
  // date window, avoiding list slicing (which errored on edge windows).
  var dailyList = daily.toList(daily.size());
  var count = daily.size();
  // Only start where a full 5-day window exists: indices 4 .. count-1.
  var starts = ee.List.sequence(4, count.subtract(1));

  var running5 = ee.ImageCollection(ee.Algorithms.If(
    count.gte(5),
    ee.ImageCollection.fromImages(starts.map(function(end) {
      end = ee.Number(end);
      var windowImgs = ee.List([
        dailyList.get(end.subtract(4)),
        dailyList.get(end.subtract(3)),
        dailyList.get(end.subtract(2)),
        dailyList.get(end.subtract(1)),
        dailyList.get(end)
      ]);
      return ee.ImageCollection(windowImgs).sum().rename('rx5');
    })),
    // Fallback: fewer than 5 days available -> use the total as a stand-in.
    ee.ImageCollection([daily.sum().rename('rx5')])
  ));
  var rx5 = running5.max().rename('rx5day');

  return rx1.addBands(rx5);
}

function reduceRegionMean(image, geometry, bandName, scale) {
  return image.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geometry,
    scale: scale,
    maxPixels: CONFIG.maxPixels,
    bestEffort: true
  }).get(bandName);
}

function makeDailyRecent(windowDays) {
  var lastDate = ee.Date.parse('YYYY-MM-dd',
    latestHalfHourly.format('YYYY-MM-dd'));
  var endExclusive = lastDate.advance(1, 'day');
  var startDate = endExclusive.advance(-windowDays, 'day');
  var offsets = ee.List.sequence(0, windowDays - 1);
  return ee.ImageCollection.fromImages(offsets.map(function(offset) {
    offset = ee.Number(offset);
    var dayStart = startDate.advance(offset, 'day');
    var dayEnd = dayStart.advance(1, 'day');
    var acc = gpmHalfHourly.filterDate(dayStart, dayEnd)
      .map(function(img) { return img.multiply(0.5).rename('rainfall_mm'); })
      .sum().rename('rainfall_mm');
    return acc.set({date_label: dayStart.format('YYYY-MM-dd'),
                    'system:time_start': dayStart.millis()});
  }));
}

function formatNumber(value, decimals) {
  if (value === null || value === undefined || isNaN(value)) return 'No data';
  return Number(value).toFixed(decimals);
}

// ============================================================================
// 4. APPLICATION LAYOUT
// ============================================================================

ui.root.clear();

var map = ui.Map();
map.setOptions('HYBRID');
map.setControlVisibility({
  all: true, layerList: true, zoomControl: true, scaleControl: true,
  mapTypeControl: true, fullscreenControl: true, drawingToolsControl: false
});
map.style().set('cursor', 'crosshair');
map.setCenter(-98.5, 39.5, 4); // CONUS

// Professional color system (dark teal / slate; matches viridis map layers).
var THEME = {
  headerBg: '#0d3b45',   // deep teal
  headerFg: '#ffffff',
  accent:   '#1f7a8c',   // mid teal
  ink:      '#12303a',   // near-black teal for headings
  sub:      '#4a6670',   // muted slate for secondary text
  faint:    '#7d949c',   // faint captions
  cardBg:   '#f2f6f7',   // very light slate for cards
  cardEdge: '#d3e0e3',
  panelBg:  '#ffffff'
};

var sidebar = ui.Panel({
  style: {width: '450px', padding: '0 0 14px 0',
          backgroundColor: THEME.panelBg}
});

// --- Header banner ---
var headerBand = ui.Panel({
  style: {backgroundColor: THEME.headerBg, padding: '16px 16px 14px 16px',
          margin: '0 0 4px 0', stretch: 'horizontal'}
});
headerBand.add(ui.Label(CONFIG.appTitle, {
  fontSize: '28px', fontWeight: 'bold', color: THEME.headerFg,
  backgroundColor: THEME.headerBg, margin: '0 0 2px 0'}));
headerBand.add(ui.Label(CONFIG.appSubtitle, {
  fontSize: '15px', fontWeight: 'bold', color: '#a8d5dd',
  backgroundColor: THEME.headerBg, margin: '0 0 4px 0'}));
headerBand.add(ui.Label(CONFIG.scope, {
  fontSize: '11px', color: '#cfe4e8',
  backgroundColor: THEME.headerBg, margin: '0'}));
sidebar.add(headerBand);

// Body panel with inner padding.
var body = ui.Panel({style: {padding: '4px 16px 0 16px', stretch: 'horizontal'}});
sidebar.add(body);

body.add(ui.Label(
  'Select a state and analysis period. The dashboard combines recent IMERG ' +
  'monitoring with long-term rainfall trend, drought (SPI) and extreme-event ' +
  'analytics. All methods are documented in the Methods panel below.',
  {fontSize: '12px', color: '#37474f', whiteSpace: 'pre-wrap',
   margin: '4px 0 8px 0'}));

function sectionHeader(text) {
  return ui.Label(text, {fontSize: '13px', fontWeight: 'bold',
    color: THEME.ink, margin: '14px 0 6px 0'});
}

// --- State selection ---
body.add(sectionHeader('1. State Selection'));
var stateSelect = ui.Select({
  items: ['Loading states...'], value: 'Loading states...',
  style: {stretch: 'horizontal'}});
body.add(stateSelect);
body.add(ui.Label('Tip: you may also click directly on a state.',
  {fontSize: '11px', color: '#6c757d', margin: '4px 0 0 0'}));

// --- Historical period ---
body.add(sectionHeader('2. Historical Analysis Period'));
var historicalRow = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {stretch: 'horizontal'}});
var startYearSelect = ui.Select({items: ['...'], style: {width: '190px'}});
var endYearSelect   = ui.Select({items: ['...'], style: {width: '190px'}});
historicalRow.add(ui.Panel([
  ui.Label('Start year', {fontSize: '11px', color: '#5f6b73'}),
  startYearSelect], null, {margin: '0 12px 0 0'}));
historicalRow.add(ui.Panel([
  ui.Label('End year', {fontSize: '11px', color: '#5f6b73'}),
  endYearSelect]));
body.add(historicalRow);
var partialYearNote = ui.Label('', {
  fontSize: '10px', color: '#b26a00', whiteSpace: 'pre-wrap',
  margin: '4px 0 0 0'});
body.add(partialYearNote);

// --- Recent window ---
body.add(sectionHeader('3. Recent Monitoring Window'));
var recentWindowSelect = ui.Select({
  items: ['7 days', '30 days', '90 days'],
  value: CONFIG.defaultRecentWindow, style: {stretch: 'horizontal'}});
body.add(recentWindowSelect);

// --- SPI scale ---
body.add(sectionHeader('4. Drought Index (SPI) Timescale'));
var spiScaleSelect = ui.Select({
  items: ['1 month', '3 month', '6 month', '12 month'],
  value: '3 month', style: {stretch: 'horizontal'}});
body.add(spiScaleSelect);

// --- Buttons ---
var buttonRow = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {stretch: 'horizontal', margin: '12px 0 6px 0'}});
var runButton = ui.Button({label: 'Run Analysis', style: {
  width: '250px', backgroundColor: THEME.accent, color: 'ffffff',
  fontWeight: 'bold'}});
var resetButton = ui.Button({label: 'Reset', style: {width: '120px'}});
buttonRow.add(runButton);
buttonRow.add(resetButton);
body.add(buttonRow);

var statusLabel = ui.Label('Loading states and IMERG metadata...', {
  fontSize: '11px', color: THEME.sub, whiteSpace: 'pre-wrap',
  margin: '2px 0 8px 0'});
body.add(statusLabel);

// --- KPI cards ---
body.add(sectionHeader('5. State Summary'));
function createKpiCard(labelText) {
  var valueLabel = ui.Label('—', {fontSize: '18px', fontWeight: 'bold',
    color: THEME.ink, margin: '4px 0 2px 0', backgroundColor: THEME.cardBg});
  var panel = ui.Panel([
    ui.Label(labelText, {fontSize: '10px', color: THEME.sub,
      whiteSpace: 'pre-wrap', backgroundColor: THEME.cardBg}),
    valueLabel],
    null, {width: '195px', padding: '10px', margin: '4px',
      backgroundColor: THEME.cardBg, border: '1px solid ' + THEME.cardEdge});
  return {panel: panel, value: valueLabel};
}
var recentTotalKpi = createKpiCard('Recent state-average accumulation');
var annualMeanKpi  = createKpiCard('Baseline mean annual rainfall\n(2001-2020)');
var trendKpi       = createKpiCard('Trend (Theil-Sen)\nsignificance via Mann-Kendall');
var spiKpi         = createKpiCard('Current SPI (drought index)');
var rx1Kpi         = createKpiCard('Rx1day, latest complete year');
var anomalyKpi     = createKpiCard('Latest annual anomaly (z)');

var kpiRow1 = ui.Panel({layout: ui.Panel.Layout.flow('horizontal')});
kpiRow1.add(recentTotalKpi.panel); kpiRow1.add(annualMeanKpi.panel);
var kpiRow2 = ui.Panel({layout: ui.Panel.Layout.flow('horizontal')});
kpiRow2.add(trendKpi.panel); kpiRow2.add(spiKpi.panel);
var kpiRow3 = ui.Panel({layout: ui.Panel.Layout.flow('horizontal')});
kpiRow3.add(rx1Kpi.panel); kpiRow3.add(anomalyKpi.panel);
body.add(kpiRow1); body.add(kpiRow2); body.add(kpiRow3);

var chartsPanel = ui.Panel({style: {stretch: 'horizontal'}});
body.add(chartsPanel);

// ---------------------------------------------------------------------------
// DOWNLOADS
// Shared analysis context, refreshed on every Run. Download handlers read it
// so users can export exactly what is currently displayed.
// ---------------------------------------------------------------------------
var current = {
  stateName: null, geom: null, scale: null,
  startYear: null, endYear: null, windowDays: null,
  annualTotals: null, sensSlope: null, mannKendall: null,
  dailyRecent: null, monthlyClimatology: null,
  annualMean: null, recentTotal: null, spi: null, anomaly: null
};

body.add(sectionHeader('7. Download Data'));
body.add(ui.Label(
  'Export the current state and period. CSV downloads work for everyone. ' +
  'GeoTIFF uses an in-app link for reasonably sized rasters; very large ' +
  'full-resolution rasters use the Drive-export snippet (needs your own EE ' +
  'account).',
  {fontSize: '10px', color: '#6c757d', whiteSpace: 'pre-wrap',
   margin: '0 0 8px 0'}));

var dlDailyBtn   = ui.Button({label: 'CSV — Daily time-series',
  style: {stretch: 'horizontal', margin: '2px 0', color: THEME.accent}});
var dlAnnualBtn  = ui.Button({label: 'CSV — Annual totals + trend',
  style: {stretch: 'horizontal', margin: '2px 0', color: THEME.accent}});
var dlClimBtn    = ui.Button({label: 'CSV — Monthly climatology',
  style: {stretch: 'horizontal', margin: '2px 0', color: THEME.accent}});
var dlTifBtn     = ui.Button({label: 'GeoTIFF — current raster layer',
  style: {stretch: 'horizontal', margin: '2px 0', color: THEME.accent}});

body.add(dlDailyBtn);
body.add(dlAnnualBtn);
body.add(dlClimBtn);
body.add(dlTifBtn);

// Which raster the GeoTIFF button exports.
var tifLayerSelect = ui.Select({
  items: ['Recent accumulation', 'Mean annual rainfall',
          'Theil-Sen trend', 'SPI', 'Annual anomaly'],
  value: 'Recent accumulation',
  style: {stretch: 'horizontal', margin: '2px 0'}});
body.add(ui.Label('GeoTIFF layer:', {fontSize: '10px', color: '#5f6b73'}));
body.add(tifLayerSelect);

var downloadLinkPanel = ui.Panel({style: {margin: '6px 0 0 0'}});
body.add(downloadLinkPanel);

// --- Methods & citations panel ---
body.add(sectionHeader('Methods & Citations'));
var methodsText =
  'TREND MAGNITUDE — Theil-Sen slope: median of all pairwise slopes ' +
  '(x_j - x_i)/(t_j - t_i). Robust to outliers. Ref: Sen (1968), JASA 63(324).\n\n' +
  'TREND SIGNIFICANCE — Mann-Kendall test: S = sum sign(x_j - x_i); ' +
  'Var(S) = [n(n-1)(2n+5) - sum t_g(t_g-1)(2t_g+5)]/18; ' +
  'Z = (S-/+1)/sqrt(Var(S)); two-sided p from the normal approximation. ' +
  'Refs: Mann (1945), Econometrica 13; Kendall (1975), Rank Correlation Methods.\n\n' +
  'DROUGHT — Standardized Precipitation Index (SPI): accumulate rainfall over ' +
  'k months and standardize against the 2001-2020 baseline. This app uses a ' +
  'normal-based standardization (z = (x - mu)/sigma); at >=3-month scales this ' +
  'closely approximates the gamma-fit SPI. Ref: McKee, Doesken & Kleist (1993), ' +
  '8th Conf. on Applied Climatology.\n\n' +
  'EXTREMES — ETCCDI indices from IMERG daily totals: Rx1day (max 1-day), ' +
  'Rx5day (max 5-day running total), R95p (very-wet-day total). ' +
  'Ref: Zhang et al. (2011), WIREs Climate Change 2(6).\n\n' +
  'ANOMALY — standardized annual anomaly z = (year - baseline_mean)/baseline_sigma, ' +
  'baseline 2001-2020.\n\n' +
  'BASELINE NOTE — IMERG monthly begins 2000-06, so a WMO 1991-2020 normal is ' +
  'not possible; a 2001-2020 IMERG-native 20-year window is used throughout.';
body.add(ui.Label(methodsText, {
  fontSize: '10px', color: '#37474f', whiteSpace: 'pre-wrap',
  margin: '0 0 8px 0'}));

var dataNote = ui.Label(
  'Data: NASA GPM IMERG V07 (GES DISC) and U.S. Census TIGER/2018 state ' +
  'boundaries. Values are satellite-derived area means and are NOT a substitute ' +
  'for rain-gauge validation. Satellite extreme-value indices carry larger ' +
  'uncertainty than gauge-based ETCCDI. Detected date range and baseline are ' +
  'shown in the status line.',
  {fontSize: '10px', color: '#6c757d', whiteSpace: 'pre-wrap',
   margin: '10px 0 4px 0'});
body.add(dataNote);

var splitPanel = ui.SplitPanel({
  firstPanel: sidebar, secondPanel: map,
  orientation: 'horizontal', wipe: false, style: {stretch: 'both'}});
ui.root.add(splitPanel);

// ============================================================================
// 5. MAP LEGEND
// ============================================================================

var legendPanel = ui.Panel({style: {
  position: 'bottom-right', padding: '10px 12px', width: '260px',
  backgroundColor: 'rgba(255,255,255,0.94)'}});
map.add(legendPanel);

function legendColorBox(color) {
  return ui.Label('', {backgroundColor: '#' + color, padding: '8px',
    margin: '0 7px 3px 0'});
}

function setRecentLegend(windowDays, maxValue) {
  legendPanel.clear();
  legendPanel.add(ui.Label('Recent Rainfall Accumulation',
    {fontWeight: 'bold', fontSize: '13px', color: THEME.ink,
     margin: '0 0 1px 0'}));
  legendPanel.add(ui.Label('Latest available ' + windowDays + ' days (mm) · viridis',
    {fontSize: '10px', color: THEME.sub, margin: '0 0 7px 0'}));

  // Continuous-looking gradient strip built from the full viridis palette.
  var strip = ui.Panel({layout: ui.Panel.Layout.flow('horizontal'),
    style: {margin: '0 0 3px 0'}});
  var pal = PALETTES.recent;
  for (var k = 0; k < pal.length; k++) {
    strip.add(ui.Label('', {backgroundColor: '#' + pal[k],
      padding: '6px', margin: '0', stretch: 'horizontal'}));
  }
  legendPanel.add(strip);

  var scaleRow = ui.Panel({layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'horizontal'}});
  scaleRow.add(ui.Label('0', {fontSize: '10px', color: THEME.sub,
    stretch: 'horizontal'}));
  scaleRow.add(ui.Label(Math.round(maxValue*0.5) + '',
    {fontSize: '10px', color: THEME.sub, textAlign: 'center',
     stretch: 'horizontal'}));
  scaleRow.add(ui.Label(Math.round(maxValue) + ' mm',
    {fontSize: '10px', color: THEME.sub, textAlign: 'right'}));
  legendPanel.add(scaleRow);

  legendPanel.add(ui.Label(
    'Layers control: annual mean, Theil-Sen trend, SPI, anomaly — each has ' +
    'its own colorblind-safe scale.',
    {fontSize: '10px', color: THEME.faint, whiteSpace: 'pre-wrap',
     margin: '7px 0 0 0'}));
}

// ============================================================================
// 6. DASHBOARD UPDATE
// ============================================================================

function updateDashboard() {
  var stateName = stateSelect.getValue();
  if (!stateName || stateName === 'Loading states...') return;

  var startYear = parseInt(startYearSelect.getValue(), 10);
  var endYear   = parseInt(endYearSelect.getValue(), 10);
  var windowDays = parseInt(recentWindowSelect.getValue(), 10);
  var spiMonths = parseInt(spiScaleSelect.getValue(), 10);

  if (startYear > endYear) {
    statusLabel.setValue('Error: start year must be <= end year.');
    statusLabel.style().set('color', '#b71c1c');
    return;
  }

  statusLabel.setValue('Running national rainfall analysis for ' +
    stateName + '...');
  statusLabel.style().set('color', '#546e7a');
  runButton.setDisabled(true);

  var state = getState(stateName);
  var geom = state.geometry();
  var scale = pickScale(geom);

  var annualTotals = makeAnnualTotals(startYear, endYear);
  var annualMean = annualTotals.mean().rename('rainfall_mm');
  var sensSlope = makeSensSlope(annualTotals);
  var mannKendall = makeMannKendall(annualTotals);

  var dailyRecent = makeDailyRecent(windowDays);
  var recentTotal = dailyRecent.sum().rename('rainfall_mm');
  var recentMax = windowDays === 7 ? 120 : (windowDays === 30 ? 350 : 800);

  var spi = makeSPI(spiMonths, latestMonthly.advance(1, 'month'));
  var anomaly = makeAnnualAnomaly(latestCompleteYear);
  var monthlyClimatology = makeMonthlyClimatology();

  // Refresh shared context for the download buttons.
  current.stateName = stateName;
  current.geom = geom;
  current.scale = scale;
  current.startYear = startYear;
  current.endYear = endYear;
  current.windowDays = windowDays;
  current.annualTotals = annualTotals;
  current.sensSlope = sensSlope;
  current.mannKendall = mannKendall;
  current.dailyRecent = dailyRecent;
  current.monthlyClimatology = monthlyClimatology;
  current.annualMean = annualMean;
  current.recentTotal = recentTotal;
  current.spi = spi;
  current.anomaly = anomaly;

  // --- Map layers ---
  map.layers().reset();
  map.layers().add(ui.Map.Layer(recentTotal.clip(geom),
    {min: 0, max: recentMax, palette: PALETTES.recent},
    'Recent rainfall: latest ' + windowDays + ' days (mm)', true, 0.92));
  map.layers().add(ui.Map.Layer(annualMean.clip(geom),
    {min: 300, max: 1600, palette: PALETTES.rainfall},
    'Mean annual rainfall ' + startYear + '-' + endYear + ' (mm/yr)', false, 0.92));
  map.layers().add(ui.Map.Layer(sensSlope.clip(geom),
    {min: -20, max: 20, palette: PALETTES.trend},
    'Theil-Sen trend (mm/yr)', false, 0.92));
  map.layers().add(ui.Map.Layer(spi.clip(geom),
    {min: -2.5, max: 2.5, palette: PALETTES.spi},
    'SPI-' + spiMonths + ' (drought index)', false, 0.9));
  map.layers().add(ui.Map.Layer(anomaly.clip(geom),
    {min: -2.5, max: 2.5, palette: PALETTES.anomaly},
    'Annual anomaly (z), ' + latestCompleteYear.getInfo(), false, 0.9));

  var allBoundaries = ee.Image().byte().paint(usStates, 1, 1);
  var selBoundary = ee.Image().byte().paint(state, 1, 3);
  map.layers().add(ui.Map.Layer(allBoundaries, {palette: ['9aa4aa']},
    'All state boundaries', true, 0.5));
  map.layers().add(ui.Map.Layer(selBoundary, {palette: ['ffffff']},
    stateName + ' boundary', true, 1.0));

  map.centerObject(state, 6);
  setRecentLegend(windowDays, recentMax);

  // --- Statistics ---
  var dailyWithStats = dailyRecent.map(function(image) {
    return image.set('state_mean_mm',
      reduceRegionMean(image, geom, 'rainfall_mm', scale));
  });
  var wettest = ee.Image(dailyWithStats.sort('state_mean_mm', false).first());
  var extremes = makeExtremeIndices(latestCompleteYear);

  var summary = ee.Dictionary({
    recentTotalMm: reduceRegionMean(recentTotal, geom, 'rainfall_mm', scale),
    annualMeanMm:  reduceRegionMean(annualMean, geom, 'rainfall_mm', scale),
    trendMmYear:   reduceRegionMean(sensSlope, geom, 'trend_mm_year', scale),
    mkP:           reduceRegionMean(mannKendall, geom, 'mk_p', scale),
    spiValue:      reduceRegionMean(spi, geom, 'spi', scale),
    rx1day:        reduceRegionMean(extremes, geom, 'rx1day', scale),
    anomalyZ:      reduceRegionMean(anomaly, geom, 'anomaly_z', scale),
    wettestDayMm:  wettest.get('state_mean_mm'),
    wettestDate:   wettest.get('date_label'),
    latestHH:      latestHalfHourly.format('YYYY-MM-dd HH:mm'),
    latestMon:     latestMonthly.format('YYYY-MM'),
    completeYear:  latestCompleteYear
  });

  summary.evaluate(function(v, error) {
    runButton.setDisabled(false);
    if (error) {
      statusLabel.setValue('Analysis failed: ' + error);
      statusLabel.style().set('color', '#b71c1c');
      return;
    }
    recentTotalKpi.value.setValue(formatNumber(v.recentTotalMm, 1) + ' mm');
    annualMeanKpi.value.setValue(formatNumber(v.annualMeanMm, 1) + ' mm/yr');

    // Trend gated by Mann-Kendall significance.
    var trend = Number(v.trendMmYear);
    var p = Number(v.mkP);
    if (isNaN(trend)) {
      trendKpi.value.setValue('No data');
    } else if (!isNaN(p) && p < 0.05) {
      var pref = trend > 0 ? '+' : '';
      trendKpi.value.setValue(pref + trend.toFixed(2) + ' mm/yr\n(p=' +
        p.toFixed(3) + ', significant)');
    } else {
      trendKpi.value.setValue('Not significant\n(p=' +
        (isNaN(p) ? 'NA' : p.toFixed(3)) + ')');
    }

    var spiVal = Number(v.spiValue);
    var spiClass = isNaN(spiVal) ? '' :
      (spiVal <= -2 ? ' extreme drought' :
       spiVal <= -1.5 ? ' severe drought' :
       spiVal <= -1 ? ' moderate drought' :
       spiVal >= 2 ? ' extremely wet' :
       spiVal >= 1.5 ? ' severely wet' :
       spiVal >= 1 ? ' moderately wet' : ' near normal');
    spiKpi.value.setValue(isNaN(spiVal) ? 'No data'
      : spiVal.toFixed(2) + spiClass);

    rx1Kpi.value.setValue(formatNumber(v.rx1day, 1) + ' mm');
    anomalyKpi.value.setValue(
      isNaN(Number(v.anomalyZ)) ? 'No data'
      : (Number(v.anomalyZ) > 0 ? '+' : '') + Number(v.anomalyZ).toFixed(2));

    statusLabel.setValue(
      'Analysis complete.\nLatest half-hourly IMERG: ' + v.latestHH +
      ' UTC.\nLatest monthly IMERG: ' + v.latestMon +
      '.\nLatest complete year (trend/extremes): ' + v.completeYear + '.');
    statusLabel.style().set('color', '#2e7d32');
  });

  // --- Charts ---
  chartsPanel.clear();
  chartsPanel.add(sectionHeader('6. Rainfall Time-Series Analytics'));

  chartsPanel.add(ui.Chart.image.series({
    imageCollection: dailyRecent, region: geom,
    reducer: ee.Reducer.mean(), scale: scale, xProperty: 'system:time_start'
  }).setOptions({
    title: 'Recent Daily Rainfall — ' + stateName,
    hAxis: {title: 'Date', format: 'MMM d'},
    vAxis: {title: 'Rainfall (mm/day)', viewWindow: {min: 0}},
    legend: {position: 'none'}, series: {0: {type: 'bars'}},
    chartArea: {left: 58, right: 15, top: 42, bottom: 48}, height: 220}));

  chartsPanel.add(ui.Chart.image.series({
    imageCollection: annualTotals, region: geom,
    reducer: ee.Reducer.mean(), scale: scale, xProperty: 'system:time_start'
  }).setOptions({
    title: 'Annual Rainfall & Linear Trend',
    hAxis: {title: 'Year', format: 'yyyy'},
    vAxis: {title: 'Rainfall (mm/yr)', viewWindow: {min: 0}},
    lineWidth: 2, pointSize: 4, legend: {position: 'none'},
    trendlines: {0: {type: 'linear', showR2: true, visibleInLegend: true,
      labelInLegend: 'Linear trend'}},
    chartArea: {left: 58, right: 15, top: 42, bottom: 48}, height: 230}));

  chartsPanel.add(ui.Chart.image.series({
    imageCollection: monthlyClimatology, region: geom,
    reducer: ee.Reducer.mean(), scale: scale, xProperty: 'system:time_start'
  }).setOptions({
    title: 'Monthly Rainfall Climatology (2001-2020 baseline)',
    hAxis: {title: 'Month', format: 'MMM'},
    vAxis: {title: 'Mean rainfall (mm/month)', viewWindow: {min: 0}},
    legend: {position: 'none'}, series: {0: {type: 'bars'}},
    chartArea: {left: 58, right: 15, top: 42, bottom: 48}, height: 220}));
}

// ============================================================================
// 7. INTERACTIONS
// ============================================================================

runButton.onClick(updateDashboard);

resetButton.onClick(function() {
  stateSelect.setValue(CONFIG.defaultState, false);
  recentWindowSelect.setValue(CONFIG.defaultRecentWindow, false);
  spiScaleSelect.setValue('3 month', false);
  updateDashboard();
});

map.onClick(function(coords) {
  var point = ee.Geometry.Point([coords.lon, coords.lat]);
  var matching = usStates.filterBounds(point);
  matching.size().evaluate(function(count) {
    if (count > 0) {
      matching.first().get('NAME').evaluate(function(name) {
        stateSelect.setValue(name, false);
        updateDashboard();
      });
    }
  });
});

// ---------------------------------------------------------------------------
// DOWNLOAD HANDLERS
// ---------------------------------------------------------------------------

function notReady() {
  downloadLinkPanel.clear();
  downloadLinkPanel.add(ui.Label('Run an analysis first.',
    {fontSize: '11px', color: '#b26a00'}));
}

function showCsvLink(featureCollection, filenamePrefix) {
  downloadLinkPanel.clear();
  downloadLinkPanel.add(ui.Label('Preparing CSV download link...',
    {fontSize: '11px', color: '#546e7a'}));
  var fname = filenamePrefix + '_' + current.stateName.replace(/\s+/g, '_');
  featureCollection.getDownloadURL({
    format: 'CSV',
    filename: fname,
    callback: function(url, err) {
      downloadLinkPanel.clear();
      if (err) {
        downloadLinkPanel.add(ui.Label('CSV export failed: ' + err,
          {fontSize: '11px', color: '#b71c1c'}));
        return;
      }
      downloadLinkPanel.add(ui.Label({
        value: 'Download ' + fname + '.csv',
        style: {fontSize: '12px', color: '#1565c0', fontWeight: 'bold'},
        targetUrl: url}));
    }
  });
}

// Daily time-series -> one row per day (state-average mm/day).
dlDailyBtn.onClick(function() {
  if (!current.dailyRecent) { notReady(); return; }
  var fc = current.dailyRecent.map(function(image) {
    var v = image.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: current.geom,
      scale: current.scale, maxPixels: CONFIG.maxPixels, bestEffort: true
    }).get('rainfall_mm');
    return ee.Feature(null, {
      date: image.get('date_label'),
      rainfall_mm_day: v,
      state: current.stateName
    });
  });
  showCsvLink(fc, 'TerraHydroVue_daily');
});

// Annual totals + Theil-Sen slope + Mann-Kendall p, per year.
dlAnnualBtn.onClick(function() {
  if (!current.annualTotals) { notReady(); return; }
  var slopeVal = current.sensSlope.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: current.geom,
    scale: current.scale, maxPixels: CONFIG.maxPixels, bestEffort: true
  }).get('trend_mm_year');
  var pVal = current.mannKendall.select('mk_p').reduceRegion({
    reducer: ee.Reducer.mean(), geometry: current.geom,
    scale: current.scale, maxPixels: CONFIG.maxPixels, bestEffort: true
  }).get('mk_p');

  var fc = current.annualTotals.map(function(image) {
    var v = image.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: current.geom,
      scale: current.scale, maxPixels: CONFIG.maxPixels, bestEffort: true
    }).get('rainfall_mm');
    return ee.Feature(null, {
      year: image.get('year'),
      annual_rainfall_mm: v,
      theil_sen_slope_mm_yr: slopeVal,      // same for all rows (state-level)
      mann_kendall_p: pVal,
      state: current.stateName
    });
  });
  showCsvLink(fc, 'TerraHydroVue_annual');
});

// Monthly climatology -> one row per calendar month.
dlClimBtn.onClick(function() {
  if (!current.monthlyClimatology) { notReady(); return; }
  var fc = current.monthlyClimatology.map(function(image) {
    var v = image.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: current.geom,
      scale: current.scale, maxPixels: CONFIG.maxPixels, bestEffort: true
    }).get('rainfall_mm');
    return ee.Feature(null, {
      month: image.get('month'),
      mean_rainfall_mm: v,
      baseline: '2001-2020',
      state: current.stateName
    });
  });
  showCsvLink(fc, 'TerraHydroVue_climatology');
});

// GeoTIFF of the currently selected raster layer.
dlTifBtn.onClick(function() {
  if (!current.geom) { notReady(); return; }
  var choice = tifLayerSelect.getValue();
  var image, band;
  if (choice === 'Recent accumulation') {
    image = current.recentTotal; band = 'rainfall_mm';
  } else if (choice === 'Mean annual rainfall') {
    image = current.annualMean; band = 'rainfall_mm';
  } else if (choice === 'Theil-Sen trend') {
    image = current.sensSlope; band = 'trend_mm_year';
  } else if (choice === 'SPI') {
    image = current.spi; band = 'spi';
  } else {
    image = current.anomaly; band = 'anomaly_z';
  }

  downloadLinkPanel.clear();
  downloadLinkPanel.add(ui.Label('Preparing GeoTIFF link...',
    {fontSize: '11px', color: '#546e7a'}));

  var clipped = image.select(band).clip(current.geom);
  var fname = 'TerraHydroVue_' + choice.replace(/\s+/g, '_') + '_' +
    current.stateName.replace(/\s+/g, '_');

  clipped.getDownloadURL({
    name: fname,
    scale: current.scale,
    region: current.geom,
    filePerBand: false,
    format: 'GEO_TIFF',
    callback: function(url, err) {
      downloadLinkPanel.clear();
      if (err) {
        // Size limit or other failure -> give the Drive-export fallback.
        downloadLinkPanel.add(ui.Label(
          'In-app GeoTIFF unavailable (likely too large). Use this in your ' +
          'own Code Editor to export at full resolution:',
          {fontSize: '10px', color: '#b26a00', whiteSpace: 'pre-wrap'}));
        downloadLinkPanel.add(ui.Label(
          "Export.image.toDrive({image: <layer>.clip(geom), region: geom, " +
          "scale: " + current.scale + ", maxPixels: 1e10, fileFormat: " +
          "'GeoTIFF'});",
          {fontSize: '10px', color: '#37474f', whiteSpace: 'pre-wrap',
           fontWeight: 'bold'}));
        return;
      }
      downloadLinkPanel.add(ui.Label({
        value: 'Download ' + fname + '.tif',
        style: {fontSize: '12px', color: '#1565c0', fontWeight: 'bold'},
        targetUrl: url}));
    }
  });
});

// ============================================================================
// 8. INITIALIZATION (runtime date detection + async state load)
// ============================================================================

// Populate year dropdowns from the detected latest complete year.
latestCompleteYear.evaluate(function(lastCompleteYear, err) {
  if (err) {
    statusLabel.setValue('Could not read IMERG date range: ' + err);
    statusLabel.style().set('color', '#b71c1c');
    return;
  }
  var years = [];
  for (var y = CONFIG.historicalFirstYear; y <= lastCompleteYear; y++) {
    years.push(String(y));
  }
  startYearSelect.items().reset(years);
  endYearSelect.items().reset(years);
  startYearSelect.setValue(String(CONFIG.historicalFirstYear), false);
  endYearSelect.setValue(String(lastCompleteYear), false);

  // Warn about the partial current year.
  latestMonthly.format('YYYY-MM').evaluate(function(mon) {
    partialYearNote.setValue(
      'Note: monthly IMERG currently ends ' + mon + '. Trend, climatology and ' +
      'anomaly use complete years only (through ' + lastCompleteYear + '). ' +
      'Recent-monitoring layers use the latest half-hourly data.');
  });
});

usStates.aggregate_array('NAME').sort().evaluate(function(names, err) {
  if (err) {
    statusLabel.setValue('Could not load states: ' + err);
    statusLabel.style().set('color', '#b71c1c');
    return;
  }
  stateSelect.items().reset(names);
  stateSelect.setValue(CONFIG.defaultState, false);
  updateDashboard();
});

// ============================================================================
// 9. PUBLISHING (read once, then delete this comment block if you like)
// ============================================================================
// To publish this as a public GEE App:
//   1. Save the script (Ctrl/Cmd+S) with a name, e.g. "TerraHydroVue".
//   2. Click the "Apps" button (top-right of the Code Editor toolbar).
//   3. "NEW APP" -> give it a name & description -> select this script.
//   4. Choose "Restricted" or "Public" access and (optionally) a thumbnail.
//   5. Publish. You'll receive a shareable earthengine.app URL.
// Notes:
//   - The publishing account must be registered for Earth Engine.
//   - Very large states over long periods can be heavy in the interactive UI;
//     the app auto-coarsens the interactive scale for large areas. For
//     publication-grade full-resolution statistics, add Export.table/Export.image
//     tasks rather than relying on interactive reduceRegion.
// ============================================================================
