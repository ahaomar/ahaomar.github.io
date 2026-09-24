"use strict";

/* ============================================================
   Beyond the Breaking Point
   Four long-run gender indicators, 1990-2025 + ODA backdrop
   Data: World Bank Indicators API
   ============================================================ */

var YEAR_FROM = 1990;
var YEAR_TO = 2025;
var YEARS = [];
for (var _y = YEAR_FROM; _y <= YEAR_TO; _y++) YEARS.push(_y);

var MODE = "work";
var currentIdx = YEARS.length - 1;   /* 2025 */

var IND = {
  work: {
    code: "SL.TLF.CACT.FE.ZS",
    title: "Women's labour force",
    short: "female labour-force participation rate",
    unit: "% of women aged 15 and over",
    better: "high",
    decimals: 1,
    mapTitle: "Labour-force participation rate, women",
    rankTitle: "Lowest participation",
    rankSub: "per cent of women aged 15 and over in the labour force; 12 lowest values",
    bands: [[60, "#0d3b66"], [50, "#1a5c9e"], [40, "#3187c4"], [30, "#63b1e0"], [20, "#a8d4f0"], [-1, "#d3ebfa"]],
    legend: ["60% and over", "50-60%", "40-50%", "30-40%", "20-30%", "under 20%"],
    color: "#b91c1c",
    bar: "rgba(194,65,12,0.78)"
  },
  health: {
    code: "SH.STA.MMRT",
    title: "Maternal mortality",
    short: "maternal mortality ratio",
    unit: "maternal deaths per 100,000 live births",
    better: "low",
    decimals: 0,
    mapTitle: "Maternal mortality ratio, per 100,000 live births",
    rankTitle: "Highest maternal mortality",
    rankSub: "maternal deaths per 100,000 live births; 12 highest values",
    bands: [[1000, "#991b1b"], [500, "#dc2626"], [200, "#f87171"], [100, "#fca5a5"], [50, "#fecaca"], [-1, "#fee2e2"]],
    legend: ["1000 and over", "500-1000", "200-500", "100-200", "50-100", "under 50"],
    color: "#b91c1c",
    bar: "rgba(185,28,28,0.8)"
  },
  school: {
    code: "SE.SEC.CMPT.LO.FE.ZS",
    title: "Girls' schooling",
    short: "lower-secondary completion rate, girls",
    unit: "% of girls of official secondary-school leaving age",
    better: "high",
    decimals: 1,
    mapTitle: "Lower-secondary completion rate, girls",
    rankTitle: "Lowest completion",
    rankSub: "per cent of girls completing lower secondary; 12 lowest values",
    bands: [[90, "#0d3b66"], [75, "#1a5c9e"], [60, "#3187c4"], [45, "#63b1e0"], [30, "#a8d4f0"], [-1, "#d3ebfa"]],
    legend: ["90% and over", "75-90%", "60-75%", "45-60%", "30-45%", "under 30%"],
    color: "#0d9488",
    bar: "rgba(194,65,12,0.78)"
  },
  seats: {
    code: "SG.GEN.PARL.ZS",
    title: "Women in parliament",
    short: "share of parliamentary seats held by women",
    unit: "% of seats",
    better: "high",
    decimals: 1,
    mapTitle: "Share of parliamentary seats held by women",
    rankTitle: "Lowest representation",
    rankSub: "per cent of seats held by women; 12 lowest values",
    bands: [[40, "#0d3b66"], [30, "#1a5c9e"], [20, "#3187c4"], [15, "#63b1e0"], [10, "#a8d4f0"], [-1, "#d3ebfa"]],
    legend: ["40% and over", "30-40%", "20-30%", "15-20%", "10-15%", "under 10%"],
    color: "#3a6eff",
    bar: "rgba(194,65,12,0.78)"
  }
};

var DATA = {};        /* mode -> iso3 -> {year: value} */
var WORLD = {};       /* mode -> {year: value} */
var MALE = {};        /* iso3 -> {year: value} */
var MALE_WORLD = {};  /* {year: value} */
var ODA = {};         /* {year: US$ } */
var NAMES = {};       /* iso3 -> name */
var geoNames = {};

var map = null, geoLayer = null;
var chartCountry = null, chartRank = null, chartTrend = null;
var selected = null;
var playTimer = null;
var playing = false;

/* ---------- helpers ---------- */
function setStatus(txt) { document.getElementById("status").textContent = txt; }

function at(obj, year) {
  return (obj && obj[year] !== undefined && obj[year] !== null) ? obj[year] : null;
}

function latestAt(obj, year) {
  if (!obj) return null;
  var best = null;
  for (var k in obj) {
    var y = parseInt(k, 10);
    if (y <= year && obj[k] !== null) { if (best === null || y > best.year) best = { year: y, value: obj[k] }; }
  }
  return best;
}

/* percent-unit indicators read better with the sign attached; ratio indicators keep their unit suffix */
function fmtVal(v, cfg) {
  var s = v.toFixed(cfg.decimals);
  return cfg.unit.charAt(0) === "%" ? s + "%" : s;
}
function unitSuffix(cfg) { return cfg.unit.charAt(0) === "%" ? "" : " " + cfg.unit; }
/* UN editorial style: "per cent" spelled out inside running text */
function pct(v, cfg) {
  return cfg.unit.charAt(0) === "%" ? v.toFixed(cfg.decimals) + " per cent" : v.toFixed(cfg.decimals) + " " + cfg.unit;
}

async function fetchJSON(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

/* paged fetch — 36 years x ~295 entities exceeds one page */
async function fetchIndicator(code) {
  var base = "https://api.worldbank.org/v2/country/all/indicator/" + code +
             "?format=json&date=" + YEAR_FROM + ":" + YEAR_TO + "&per_page=10000&page=";
  var first = await fetchJSON(base + "1");
  var rows = (first[1] || []).slice();
  var pages = (first[0] && first[0].pages) ? first[0].pages : 1;
  for (var p = 2; p <= pages; p++) {
    var more = await fetchJSON(base + p);
    if (more[1]) rows = rows.concat(more[1]);
  }
  return rows;
}

function parseRows(rows, valid, target, worldTarget) {
  rows.forEach(function (r) {
    if (r.value === null) return;
    var iso = r.countryiso3code, y = parseInt(r.date, 10);
    if (iso === "WLD") { if (worldTarget) worldTarget[y] = r.value; return; }
    if (!valid[iso]) return;
    if (!target[iso]) target[iso] = {};
    target[iso][y] = r.value;
    NAMES[iso] = r.country.value;
  });
}

/* ============================================================
   LOAD
   ============================================================ */
async function loadAll() {
  setStatus("Loading country boundaries…");
  var geoP = fetchJSON("https://raw.githubusercontent.com/johan/world.geo.json/34c96bba9c07d2ceb30696c599bb51a5b939b20f/countries.geo.json");

  setStatus("Loading five indicator series (World Bank Indicators API)…");
  var refP = fetchJSON("https://api.worldbank.org/v2/country?format=json&per_page=400");
  var feP = fetchIndicator(IND.work.code);
  var maP = fetchIndicator("SL.TLF.CACT.MA.ZS");
  var mmrP = fetchIndicator(IND.health.code);
  var schP = fetchIndicator(IND.school.code);
  var parlP = fetchIndicator(IND.seats.code);

  setStatus("Loading aid flows (World Bank DT.ODA.ODAT.CD)…");
  var odaP = fetchJSON("https://api.worldbank.org/v2/country/WLD/indicator/DT.ODA.ODAT.CD?format=json&date=" + YEAR_FROM + ":" + YEAR_TO + "&per_page=100");

  var out = await Promise.all([geoP, refP, feP, maP, mmrP, schP, parlP, odaP]);
  var geo = out[0], refData = out[1];

  var valid = {};
  (refData[1] || []).forEach(function (c) {
    if (c.region && c.region.id !== "NA" && c.id && c.id.length === 3) valid[c.id] = c.name;
  });

  DATA.work = {}; WORLD.work = {};
  DATA.health = {}; WORLD.health = {};
  DATA.school = {}; WORLD.school = {};
  DATA.seats = {}; WORLD.seats = {};

  parseRows(out[2], valid, DATA.work, WORLD.work);
  parseRows(out[3], valid, MALE, MALE_WORLD);
  parseRows(out[4], valid, DATA.health, WORLD.health);
  parseRows(out[5], valid, DATA.school, WORLD.school);
  parseRows(out[6], valid, DATA.seats, WORLD.seats);

  (out[7][1] || []).forEach(function (r) {
    if (r.value === null) return;
    ODA[parseInt(r.date, 10)] = r.value;
  });

  (geo.features || []).forEach(function (f) { if (f.id) geoNames[f.id] = f.properties && f.properties.name; });

  console.log("DATA CHECK work:", Object.keys(DATA.work).length,
              "| health:", Object.keys(DATA.health).length,
              "| school:", Object.keys(DATA.school).length,
              "| seats:", Object.keys(DATA.seats).length,
              "| oda years:", Object.keys(ODA).length);

  setStatus("");
  document.getElementById("status").style.display = "none";
  document.getElementById("app").style.display = "block";

  initMap(geo);
  renderJumpButtons();
  buildTrend();
  renderHeadline();
  onYearChange(currentIdx);
}

/* ============================================================
   MAP
   ============================================================ */
function shadeColor(v) {
  if (v === null || v === undefined) return "#d5dbe0";
  var bands = IND[MODE].bands;
  for (var i = 0; i < bands.length; i++) { if (v >= bands[i][0]) return bands[i][1]; }
  return bands[bands.length - 1][1];
}

function legendHTML() {
  var h = "<b>" + IND[MODE].unit + "</b><br>";
  IND[MODE].legend.forEach(function (lbl, i) {
    h += '<span class="sw" style="background:' + IND[MODE].bands[i][1] + '"></span>' + lbl + "<br>";
  });
  h += '<span class="sw" style="background:#d5dbe0"></span>no data';
  return h;
}

function initMap(geo) {
  map = L.map("map", { zoomSnap: 0.5 }).setView([26, 18], 2);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_2bxi_1_cf4676c92201d853bfc6bafb", {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    subdomains: "abcd",
    maxZoom: 19
  }).addTo(map);

  var legend = L.control({ position: "bottomright" });
  legend.onAdd = function () {
    var div = L.DomUtil.create("div", "legend");
    div.innerHTML = legendHTML();
    return div;
  };
  legend.addTo(map);

  geoLayer = L.geoJSON(geo, {
    filter: function (f) { return !!DATA.work[f.id] || !!DATA.health[f.id] || !!DATA.school[f.id] || !!DATA.seats[f.id]; },
    style: function (f) {
      var lv = latestAt(DATA[MODE][f.id], curYear());
      return {
        color: "#ffffff", weight: 0.8,
        fillColor: shadeColor(lv ? lv.value : null),
        fillOpacity: 0.92
      };
    },
    onEachFeature: function (f, layer) {
      layer.bindTooltip(function () {
        var lv = latestAt(DATA[MODE][f.id], curYear());
        var nm = NAMES[f.id] || geoNames[f.id] || f.id;
        var el = document.createElement("span");
        if (!lv) {
          el.textContent = nm + ": no value reported on or before " + curYear();
        } else {
          el.textContent = nm + ": " + fmtVal(lv.value, IND[MODE]) + unitSuffix(IND[MODE]) + " (" + lv.year + ")";
        }
        return el;
      }, { sticky: true });
      layer.on("click", function () { selectCountry(f.id); });
    }
  }).addTo(map);
}

function restyleMap() {
  if (!geoLayer) return;
  var y = curYear();
  geoLayer.eachLayer(function (layer) {
    var iso = layer.feature.id;
    var lv = latestAt(DATA[MODE][iso], y);
    layer.setStyle({
      fillColor: shadeColor(lv ? lv.value : null),
      fillOpacity: 0.92,
      weight: (iso === selected) ? 2.2 : 0.8,
      color: (iso === selected) ? "#009edb" : "#ffffff"
    });
  });
  var leg = document.querySelector(".legend");
  if (leg) leg.innerHTML = legendHTML();
}

function curYear() { return YEARS[currentIdx]; }

/* ============================================================
   HEADLINE
   ============================================================ */
function renderHeadline() {
  var fe = latestAt(WORLD.work, YEAR_TO);
  if (fe) {
    document.getElementById("statWork").innerHTML = fe.value.toFixed(1) + "%<small>of women aged 15+</small>";
    document.getElementById("lblWork").textContent = fe.year;
    var ma = latestAt(MALE_WORLD, fe.year);
    if (ma) {
      document.getElementById("statGap").innerHTML = (ma.value - fe.value).toFixed(1) + "<small>points, compared with men</small>";
    }
  }
  var mmr = latestAt(WORLD.health, YEAR_TO);
  if (mmr) document.getElementById("statMMR").innerHTML = mmr.value.toFixed(0) + "<small>per 100,000 births, " + mmr.year + "</small>";
  var seats = latestAt(WORLD.seats, YEAR_TO);
  if (seats) {
    document.getElementById("statParl").innerHTML = seats.value.toFixed(1) + "%<small>of seats</small>";
    document.getElementById("lblParl").textContent = seats.year;
  }
}

/* ============================================================
   COUNTRY DETAIL
   ============================================================ */
function selectCountry(iso) {
  if (!NAMES[iso] && !geoNames[iso]) return;
  selected = iso;
  stopPlay();
  restyleMap();
  var cfg = IND[MODE];
  var y = curYear();
  var lv = DATA[MODE][iso] ? latestAt(DATA[MODE][iso], y) : null;

  document.getElementById("countryPanel").style.display = "none";
  document.getElementById("chartWrap").style.display = "block";
  document.getElementById("countryName").textContent = NAMES[iso] || geoNames[iso] || iso;
  document.getElementById("countryYear").textContent = cfg.short + " · " + (lv ? lv.year : y);

  if (!lv) {
    document.getElementById("ratioLine").innerHTML = "<b>&mdash;</b> no value reported on or before " + y + ".";
  } else if (MODE === "work") {
    /* compare like-for-like: male and world values are taken at the country's own reporting year */
    var m = latestAt(MALE[iso], lv.year);
    var wv = latestAt(WORLD.work, lv.year);
    var html = "<b>" + fmtVal(lv.value, cfg) + "</b> of women are in the labour force (" + lv.year + ")";
    if (m) html += "; the figure for men is <b>" + fmtVal(m.value, cfg) + "</b> (" + m.year + "), a gap of " + (m.value - lv.value).toFixed(1) + " points";
    if (wv) html += ". Global figure: " + fmtVal(wv.value, cfg) + " (" + wv.year + ").";
    document.getElementById("ratioLine").innerHTML = html;
  } else {
    var w = latestAt(WORLD[MODE], lv.year);
    document.getElementById("ratioLine").innerHTML =
      "<b>" + fmtVal(lv.value, cfg) + "</b>" + unitSuffix(cfg) + (lv.year < y ? ", the latest value reported (for " + lv.year + ")" : "") +
      (w ? ". Global figure: " + fmtVal(w.value, cfg) + unitSuffix(cfg) + " (" + w.year + ")." : "");
  }

  buildCountryChart(iso);
  buildTakeaways(iso, y, lv);
}

function buildCountryChart(iso) {
  var w = WORLD[MODE];
  var data = YEARS.map(function (y) { var v = at(DATA[MODE][iso], y); return v === null ? null : +v.toFixed(IND[MODE].decimals); });
  var world = YEARS.map(function (y) { var v = at(w, y); return v === null ? null : +v.toFixed(IND[MODE].decimals); });

  if (chartCountry) {
    chartCountry.data.datasets[0].data = data;
    chartCountry.data.datasets[0].label = NAMES[iso] || iso;
    chartCountry.data.datasets[0].borderColor = IND[MODE].color;
    chartCountry.data.datasets[1].data = world;
    chartCountry.options.scales.y.title.text = IND[MODE].unit;
    chartCountry.update();
    return;
  }

  chartCountry = new Chart(document.getElementById("countryChart"), {
    type: "line",
    data: {
      labels: YEARS,
      datasets: [
        { label: NAMES[iso] || iso, data: data, borderColor: IND[MODE].color, backgroundColor: "rgba(58,110,255,0.10)", tension: 0.25, pointRadius: 0, borderWidth: 2, fill: false },
        { label: "World", data: world, borderColor: "#64748b", borderDash: [5, 4], tension: 0.25, pointRadius: 0, borderWidth: 1.5 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { font: { family: "Inter", size: 11 }, color: "#334155" } } },
      scales: {
        y: { title: { display: true, text: IND[MODE].unit, font: { family: "JetBrains Mono", size: 10 } },
             ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
        x: { ticks: { font: { family: "JetBrains Mono", size: 10 }, maxTicksLimit: 8 }, grid: { display: false } }
      }
    }
  });
}

function buildTakeaways(iso, y, lv) {
  var cfg = IND[MODE];
  var name = NAMES[iso] || iso;
  var list = document.getElementById("takeaways");
  list.innerHTML = "";
  function add(txt) { var li = document.createElement("li"); li.textContent = txt; list.appendChild(li); }

  if (!lv) { add("No " + cfg.short + " reported on or before " + y + " in this dataset."); return; }

  var first = null;
  for (var yr = YEAR_FROM; yr <= lv.year; yr++) { if (at(DATA[MODE][iso], yr) !== null) { first = { year: yr, value: at(DATA[MODE][iso], yr) }; break; } }
  if (first && first.year !== lv.year) {
    var d = lv.value - first.value;
    add(cfg.short.charAt(0).toUpperCase() + cfg.short.slice(1) + " moved from " + pct(first.value, cfg) +
        " in " + first.year + " to " + pct(lv.value, cfg) + " in " + lv.year +
        (d >= 0 ? ", an increase of " + d.toFixed(cfg.decimals) + " points." : ", a decrease of " + Math.abs(d).toFixed(cfg.decimals) + " points."));
  }

  var w = latestAt(WORLD[MODE], lv.year);
  if (w) {
    var gap = lv.value - w.value;
    add("The global figure in " + w.year + " was " + pct(w.value, cfg) + ". " + name + " is " +
        (gap >= 0 ? gap.toFixed(cfg.decimals) + " points above" : Math.abs(gap).toFixed(cfg.decimals) + " points below") + " that level.");
  }

  if (MODE === "work") {
    var m = latestAt(MALE[iso], lv.year);
    if (m) add("Gender gap: " + (m.value - lv.value).toFixed(1) + " points (men " + m.value.toFixed(1) + " per cent, women " + lv.value.toFixed(1) + " per cent, " + lv.year + ").");
  }

  var rank = 0, total = 0;
  for (var iso2 in DATA[MODE]) {
    var v = latestAt(DATA[MODE][iso2], y);
    if (!v) continue;
    total++;
    if (cfg.better === "low" ? v.value > lv.value : v.value < lv.value) rank++;
  }
  if (total > 1) {
    add(cfg.better === "low"
      ? rank + " of " + total + " economies with a value reported on or before " + y + " recorded a higher rate."
      : rank + " of " + total + " economies with a value reported on or before " + y + " recorded a lower rate.");
  }
}

/* ============================================================
   RANKING PANEL
   ============================================================ */
function buildRank() {
  var cfg = IND[MODE];
  var y = curYear();
  var rows = [];
  for (var iso in DATA[MODE]) {
    var lv = latestAt(DATA[MODE][iso], y);
    if (!lv) continue;
    rows.push({ iso: iso, name: NAMES[iso] || geoNames[iso] || iso, value: lv.value, year: lv.year });
  }
  rows.sort(function (a, b) { return cfg.better === "low" ? b.value - a.value : a.value - b.value; });
  rows = rows.slice(0, 12);

  var labels = rows.map(function (r) { return r.name.replace(", Fed. Rep.", "").replace("Dem. Rep.", "DRC"); });
  var vals = rows.map(function (r) { return +r.value.toFixed(cfg.decimals); });
  document.getElementById("chartNote").textContent = rows.length + " economies shown · values carried forward to " + y;
  if (chartRank) {
    chartRank.data.labels = labels;
    chartRank.data.datasets[0].data = vals;
    chartRank.data.datasets[0].backgroundColor = cfg.bar;
    chartRank.options.scales.x.title.text = cfg.unit;
    chartRank.update();
    return;
  }

  chartRank = new Chart(document.getElementById("rankChart"), {
    type: "bar",
    data: { labels: labels, datasets: [{ label: cfg.short, data: vals, backgroundColor: cfg.bar, borderRadius: 3 }] },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: cfg.unit, font: { family: "JetBrains Mono", size: 10 } },
             ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
        y: { ticks: { font: { size: 11 } }, grid: { display: false } }
      }
    }
  });
}

/* ============================================================
   TREND PANEL (world indicator + ODA backdrop)
   ============================================================ */
function buildTrend() {
  if (chartTrend) { chartTrend.destroy(); chartTrend = null; }
  var cfg = IND[MODE];

  var ds = [{
    label: "World · " + cfg.short,
    data: YEARS.map(function (y) { var v = at(WORLD[MODE], y); return v === null ? null : +v.toFixed(cfg.decimals); }),
    borderColor: cfg.color, backgroundColor: cfg.color, tension: 0.25, pointRadius: 0, borderWidth: 2, yAxisID: "y"
  }];

  if (MODE === "work") {
    ds.push({
      label: "World · men",
      data: YEARS.map(function (y) { var v = at(MALE_WORLD, y); return v === null ? null : +v.toFixed(1); }),
      borderColor: "#3a6eff", backgroundColor: "#3a6eff", tension: 0.25, pointRadius: 0, borderWidth: 2, yAxisID: "y"
    });
  }

  ds.push({
    label: "World · ODA received (US$ bn, right)",
    data: YEARS.map(function (y) { var v = at(ODA, y); return v === null ? null : +(v / 1e9).toFixed(1); }),
    borderColor: "#ea7317", backgroundColor: "#ea7317", borderDash: [6, 4], tension: 0.2, pointRadius: 0, borderWidth: 1.5, yAxisID: "y1"
  });

  chartTrend = new Chart(document.getElementById("trendChart"), {
    type: "line",
    data: { labels: YEARS, datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { font: { family: "Inter", size: 11 }, color: "#334155" } } },
      scales: {
        y: { position: "left", title: { display: true, text: cfg.unit, font: { family: "JetBrains Mono", size: 10 } },
             ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
        y1: { position: "right", title: { display: true, text: "US$ bn", font: { family: "JetBrains Mono", size: 10 } },
              ticks: { font: { family: "JetBrains Mono", size: 10 }, color: "#ea7317" }, grid: { display: false } },
        x: { ticks: { font: { family: "JetBrains Mono", size: 10 }, maxTicksLimit: 10 }, grid: { display: false } }
      }
    }
  });

  buildTrendTakeaways();
}

function buildTrendTakeaways() {
  var cfg = IND[MODE];
  var list = document.getElementById("trendTakeaways");
  list.innerHTML = "";
  function add(txt) { var li = document.createElement("li"); li.textContent = txt; list.appendChild(li); }

  var first = null, last = null;
  for (var y = YEAR_FROM; y <= YEAR_TO; y++) {
    var v = at(WORLD[MODE], y);
    if (v === null) continue;
    if (!first) first = { year: y, value: v };
    last = { year: y, value: v };
  }
  if (first && last) {
    if (MODE === "health") {
      add("The global maternal mortality ratio fell from " + first.value.toFixed(0) + " maternal deaths per 100,000 live births in " + first.year +
          " to " + last.value.toFixed(0) + " in " + last.year + ", a reduction of " +
          Math.round((1 - last.value / first.value) * 100) + " per cent.");
    } else {
      add("The global " + cfg.short + " was " + pct(first.value, cfg) + " in " + first.year +
          " and " + pct(last.value, cfg) + " in " + last.year + ".");
    }
  }
  if (MODE === "work") {
    var fe = latestAt(WORLD.work, YEAR_TO), ma = latestAt(MALE_WORLD, YEAR_TO);
    if (fe && ma) add("The global gender gap in labour-force participation is " + (ma.value - fe.value).toFixed(1) + " points: " + ma.value.toFixed(1) + " per cent for men and " + fe.value.toFixed(1) + " per cent for women in " + fe.year + ".");
  }
  if (MODE === "seats") {
    var s1997 = at(WORLD.seats, 1997);
    if (s1997 && last) add("Women held " + s1997.toFixed(1) + " per cent of the world's parliamentary seats in 1997 and " + last.value.toFixed(1) + " per cent in " + last.year + ".");  }

  var odaLast = latestAt(ODA, YEAR_TO), oda2020 = at(ODA, 2020);
  if (odaLast) {
    add("Official development assistance received worldwide was " + (odaLast.value / 1e9).toFixed(1) +
        " billion United States dollars in " + odaLast.year + (oda2020 ? ", compared with " + (oda2020 / 1e9).toFixed(1) + " billion in 2020" : "") +
        ". The series ends in " + odaLast.year + "; reductions in funding announced for 2025 and 2026 are not yet reflected in these data.");
  }
}

/* ============================================================
   TIMELINE
   ============================================================ */
function onSlide(v) {
  stopPlay();
  onYearChange(Number(v));
}

function jumpToYear(y) {
  stopPlay();
  var idx = YEARS.indexOf(y);
  if (idx === -1) idx = YEARS.length - 1;
  onYearChange(idx);
}

function renderJumpButtons() {
  document.getElementById("jumpWrap").innerHTML =
    '<button type="button" class="tl-btn" onclick="jumpToYear(1995)">&#8593; Beijing 1995</button>' +
    '<button type="button" class="tl-btn" onclick="jumpToYear(2000)">&#8593; MDGs 2000</button>' +
    '<button type="button" class="tl-btn" onclick="jumpToYear(2020)">&#8593; COVID 2020</button>' +
    '<button type="button" class="tl-btn" onclick="jumpToYear(2025)">&#8634; Latest</button>';
}

function setMode(m) {
  if (!IND[m]) return;
  MODE = m;
  ["work", "health", "school", "seats"].forEach(function (k) {
    var btn = document.getElementById("tgl" + k.charAt(0).toUpperCase() + k.slice(1));
    if (btn) btn.classList.toggle("active", k === m);
  });
  stopPlay();
  document.getElementById("mapTitleText").textContent = IND[m].mapTitle;
  document.getElementById("rankTitle").firstChild.textContent = IND[m].rankTitle + ", ";
  document.getElementById("rankSub").textContent = IND[m].rankSub;
  buildTrend();
  if (selected) selectCountry(selected);
  onYearChange(currentIdx);
}

function togglePlay() {
  if (playing) { stopPlay(); return; }
  playing = true;
  var btn = document.getElementById("playBtn");
  btn.classList.remove("active");
  btn.innerHTML = "&#9632; Pause";
  if (currentIdx >= YEARS.length - 1) currentIdx = -1;
  playTimer = setInterval(function () {
    currentIdx++;
    if (currentIdx >= YEARS.length) { currentIdx = YEARS.length - 1; stopPlay(); onYearChange(currentIdx); return; }
    onYearChange(currentIdx);
  }, 1500);
}

function stopPlay() {
  playing = false;
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  var btn = document.getElementById("playBtn");
  btn.classList.add("active");
  btn.innerHTML = "&#9654; Play years";
}

function onYearChange(idx) {
  currentIdx = Math.max(0, Math.min(idx, YEARS.length - 1));
  var y = curYear();
  var cfg = IND[MODE];

  document.getElementById("yearDisplay").textContent = y;
  var slider = document.getElementById("yearSlider");
  slider.value = currentIdx;
  var fill = (currentIdx / (YEARS.length - 1)) * 100;
  slider.style.setProperty("--fill", fill + "%");

  document.getElementById("mapYearLabel").textContent = y;
  document.getElementById("rankYearLabel").textContent = y;

  var reporting = 0;
  for (var iso in DATA[MODE]) { if (latestAt(DATA[MODE][iso], y)) reporting++; }
  document.getElementById("countNote").textContent = reporting + " economies with a value reported on or before " + y;

  restyleMap();
  buildRank();
  if (selected) selectCountry(selected);

  var w = latestAt(WORLD[MODE], y);
  document.getElementById("yearCaption").textContent = w
    ? "Global " + cfg.short + ": " + fmtVal(w.value, cfg) + unitSuffix(cfg) + (w.year < y ? " (latest value reported for " + w.year + ")" : "") + "."
    : "No global value is reported for " + y + ".";
}

/* ---------- boot ---------- */
loadAll().catch(function (e) {
  setStatus("Live data unavailable. Dashboard structure remains, but live data could not be loaded.");
  console.error(e);
  document.getElementById("status").style.display = "block";
  document.getElementById("app").style.display = "none";
});
