"use strict";

/* ============================================================
   The AI Power Divide
   A. Who has power  — electricity access, 2000-2024 (World Bank)
   B. What AI feeds on — data-centre share of electricity, 2020-2025 (OWID / IEA)
   ============================================================ */

var YEAR_FROM = 2000;
var YEAR_TO = 2024;
var YEARS = [];               /* index -> year, rebuilt per mode */
var YEARS_A = [];             /* 2000-2024 */
var DC_YEARS = [];           /* 2020, 2023, 2024, 2025 (years the IEA estimates) */
var currentIdx = 24;          /* slider position */

var MODE = "a";               /* a = electricity access | b = data-centre demand */

var series = {};              /* iso3 -> {year: access %} */
var pop = {};                 /* iso3 -> {year: people} */
var NAMES = {};               /* iso3 -> display name */
var worldAccess = {};         /* year -> % */
var worldPop = {};            /* year -> people */
var geoNames = {};            /* iso3 -> name from geo.json */
var dc = {};                  /* entity -> {year: share %} */

var map = null, geoLayer = null;
var chartCountry = null, chartLow = null, chartDC = null, chartTrend = null;
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

function fmtPeople(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(0) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return Math.round(n).toString();
}

async function fetchJSON(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

async function fetchText(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.text();
}

/* ============================================================
   LOAD
   ============================================================ */
async function loadAll() {
  setStatus("Loading country boundaries…");
  var geoPromise = fetchJSON("https://raw.githubusercontent.com/johan/world.geo.json/34c96bba9c07d2ceb30696c599bb51a5b939b20f/countries.geo.json");

  setStatus("Loading electricity access and population (World Bank Indicators API)…");
  var accessPromise = fetchJSON("https://api.worldbank.org/v2/country/all/indicator/EG.ELC.ACCS.ZS?format=json&date=" + YEAR_FROM + ":" + YEAR_TO + "&per_page=10000");
  var popPromise = fetchJSON("https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&date=" + YEAR_FROM + ":" + YEAR_TO + "&per_page=10000");
  var refPromise = fetchJSON("https://api.worldbank.org/v2/country?format=json&per_page=400");

  setStatus("Loading data-centre electricity demand (Our World in Data / IEA)…");
  var csvPromise = fetchText("https://ourworldindata.org/grapher/data-centers-share-electricity-demand.csv");

  var out = await Promise.all([geoPromise, accessPromise, popPromise, refPromise, csvPromise]);
  var geo = out[0], accessData = out[1], popData = out[2], refData = out[3], csv = out[4];

  /* real countries only: region.id !== "NA" marks World Bank aggregates */
  var valid = {};
  (refData[1] || []).forEach(function (c) {
    if (c.region && c.region.id !== "NA" && c.id && c.id.length === 3) valid[c.id] = c.name;
  });

  (accessData[1] || []).forEach(function (r) {
    if (r.value === null) return;
    var iso = r.countryiso3code, y = parseInt(r.date, 10);
    if (iso === "WLD") { worldAccess[y] = r.value; return; }
    if (!valid[iso]) return;
    if (!series[iso]) series[iso] = {};
    series[iso][y] = r.value;
    NAMES[iso] = r.country.value;
  });

  (popData[1] || []).forEach(function (r) {
    if (r.value === null) return;
    var iso = r.countryiso3code, y = parseInt(r.date, 10);
    if (iso === "WLD") { worldPop[y] = r.value; return; }
    if (!valid[iso]) return;
    if (!pop[iso]) pop[iso] = {};
    pop[iso][y] = r.value;
  });

  /* OWID CSV: Entity,Code,Year,Share — no quoted commas in this dataset */
  var lines = csv.split(/\r?\n/);
  var dcEntities = [], dcYears = {};
  for (var i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    var p = lines[i].split(",");
    if (p.length < 4) continue;
    var ent = p[0], yr = parseInt(p[2], 10), val = parseFloat(p[3]);
    if (isNaN(yr) || isNaN(val)) continue;
    if (!dc[ent]) { dc[ent] = {}; dcEntities.push(ent); }
    dc[ent][yr] = val;
    dcYears[yr] = true;
  }

  var dcYearsList = Object.keys(dcYears).map(Number).sort(function (a, b) { return a - b; });
  DC_YEARS = dcYearsList;

  /* year array for the access timeline */
  YEARS_A = [];
  for (var y = YEAR_FROM; y <= YEAR_TO; y++) YEARS_A.push(y);

  (geo.features || []).forEach(function (f) { if (f.id) geoNames[f.id] = f.properties && f.properties.name; });

  console.log("DATA CHECK countries:", Object.keys(series).length,
              "| world access years:", Object.keys(worldAccess).length,
              "| dc entities:", dcEntities.length,
              "| dc years:", dcYearsList.join(", "));

  setStatus("");
  document.getElementById("status").style.display = "none";
  document.getElementById("app").style.display = "block";

  initMap(geo);
  setMode("a");
  renderHeadline();
}

/* ============================================================
   MAP
   ============================================================ */
function shadeColor(v) {
  if (v === null || v === undefined) return "#d5dbe0";
  if (v >= 99) return "#0d3b66";
  if (v >= 95) return "#1a5c9e";
  if (v >= 85) return "#3187c4";
  if (v >= 70) return "#63b1e0";
  if (v >= 50) return "#a8d4f0";
  if (v >= 25) return "#d3ebfa";
  return "#eaf5fd";
}

function legendHTML() {
  return "<b>With electricity</b><br>" +
    '<span class="sw" style="background:#0d3b66"></span>99-100%<br>' +
    '<span class="sw" style="background:#1a5c9e"></span>95-99%<br>' +
    '<span class="sw" style="background:#3187c4"></span>85-95%<br>' +
    '<span class="sw" style="background:#63b1e0"></span>70-85%<br>' +
    '<span class="sw" style="background:#a8d4f0"></span>50-70%<br>' +
    '<span class="sw" style="background:#d3ebfa"></span>25-50%<br>' +
    '<span class="sw" style="background:#eaf5fd"></span>under 25%<br>' +
    '<span class="sw" style="background:#d5dbe0"></span>no data';
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
    filter: function (f) { return !!series[f.id]; },
    style: function (f) {
      return {
        color: "#ffffff", weight: 0.8,
        fillColor: shadeColor(at(series[f.id], curYear())),
        fillOpacity: 0.92
      };
    },
    onEachFeature: function (f, layer) {
      layer.bindTooltip(function () {
        var v = at(series[f.id], curYear());
        var el = document.createElement("span");
        el.textContent = (NAMES[f.id] || geoNames[f.id] || f.id) +
          (v !== null ? ": " + v.toFixed(1) + "% with electricity (" + curYear() + ")" : ": no data reported");
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
    layer.setStyle({
      fillColor: shadeColor(at(series[iso], y)),
      fillOpacity: 0.92,
      weight: (iso === selected) ? 2.2 : 0.8,
      color: (iso === selected) ? "#009edb" : "#ffffff"
    });
  });
}

function curYear() { return YEARS[currentIdx]; }

/* ============================================================
   HEADLINE STATS (always the latest year of each series)
   ============================================================ */
function renderHeadline() {
  var acc = latestAt(worldAccess, YEAR_TO);
  if (acc) {
    document.getElementById("statGrid").innerHTML = acc.value.toFixed(1) + "%<small>of population</small>";
    document.getElementById("lblGrid").textContent = acc.year;
    var p = latestAt(worldPop, acc.year);
    if (p) {
      var without = p.value * (100 - acc.value) / 100;
      document.getElementById("statDark").innerHTML = "~" + fmtPeople(without) + "<small>people, " + acc.year + "</small>";    }
  }

  var wdc = latestAt(dc["World"], 9999);
  if (wdc) document.getElementById("statDC").innerHTML = wdc.value.toFixed(2) + "%<small>global, " + wdc.year + "</small>";
  var usdc = latestAt(dc["United States"], 9999);
  if (usdc) document.getElementById("statUS").innerHTML = usdc.value.toFixed(1) + "%<small>United States, " + usdc.year + "</small>";
}

/* ============================================================
   COUNTRY DETAIL
   ============================================================ */
function selectCountry(iso) {
  if (!series[iso]) return;
  selected = iso;
  stopPlay();
  restyleMap();
  var name = NAMES[iso] || geoNames[iso] || iso;
  var y = curYear();

  document.getElementById("countryPanel").style.display = "none";
  var wrap = document.getElementById("chartWrap");
  wrap.style.display = "block";
  document.getElementById("countryName").textContent = name;
  document.getElementById("countryYear").textContent = "access to electricity · " + y;

  var v = at(series[iso], y);
  var p = at(pop[iso], y);
  if (v === null) {
    document.getElementById("ratioLine").innerHTML = "<b>&mdash;</b> no value reported for " + y;
  } else if (p !== null) {
    var without = p * (100 - v) / 100;
    document.getElementById("ratioLine").innerHTML = "<b>" + v.toFixed(1) + " per cent</b> of the population has access to electricity &mdash; approximately " + fmtPeople(without) + " people do not.";
  } else {
    document.getElementById("ratioLine").innerHTML = "<b>" + v.toFixed(1) + " per cent</b> of the population has access to electricity.";
  }

  buildCountryChart(iso);
  buildTakeaways(iso, y);
}

function buildCountryChart(iso) {
  var labels = [];
  for (var yy = YEAR_FROM; yy <= YEAR_TO; yy++) labels.push(yy);
  var data = labels.map(function (yr) { var v = at(series[iso], yr); return v === null ? null : +v.toFixed(1); });
  var world = labels.map(function (yr) { var v = at(worldAccess, yr); return v === null ? null : +v.toFixed(1); });

  if (chartCountry) {
    chartCountry.data.labels = labels;
    chartCountry.data.datasets[0].data = data;
    chartCountry.data.datasets[0].label = NAMES[iso] || iso;
    chartCountry.data.datasets[1].data = world;
    chartCountry.update();
    return;
  }

  chartCountry = new Chart(document.getElementById("countryChart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        { label: NAMES[iso] || iso, data: data, borderColor: "#3a6eff", backgroundColor: "rgba(58,110,255,0.12)", tension: 0.25, pointRadius: 2, fill: true },
        { label: "World", data: world, borderColor: "#b91c1c", borderDash: [5, 4], tension: 0.25, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { font: { family: "Inter", size: 11 }, color: "#334155" } } },
      scales: {
        y: { title: { display: true, text: "% with electricity", font: { family: "JetBrains Mono", size: 10 } },
             ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
        x: { ticks: { font: { family: "JetBrains Mono", size: 10 }, maxTicksLimit: 8 }, grid: { display: false } }
      }
    }
  });
}

function buildTakeaways(iso, y) {
  var name = NAMES[iso] || iso;
  var v = at(series[iso], y);
  var v0 = at(series[iso], YEAR_FROM);
  var w = at(worldAccess, y);
  var p = at(pop[iso], y);
  var list = document.getElementById("takeaways");
  list.innerHTML = "";

  function add(txt) { var li = document.createElement("li"); li.textContent = txt; list.appendChild(li); }

  if (v !== null && v0 !== null) {
    var d = v - v0;
    add("Access to electricity rose from " + v0.toFixed(1) + " per cent in " + YEAR_FROM + " to " + v.toFixed(1) + " per cent in " + y +
        (d >= 0 ? ", an increase of " + d.toFixed(1) + " points." : ", a decrease of " + Math.abs(d).toFixed(1) + " points."));
  }
  if (v !== null && w !== null) {
    var gap = v - w;
    add("The global average in " + y + " was " + w.toFixed(1) + " per cent. " + name + " is " +
        (gap >= 0 ? gap.toFixed(1) + " points above" : Math.abs(gap).toFixed(1) + " points below") + " that level.");
  }
  if (v !== null && v < 100 && p !== null) {
    add("Approximately " + fmtPeople(p * (100 - v) / 100) + " people in " + name + " had no access to electricity in " + y + ".");
  }
  if (v !== null) {
    var rank = 1, total = 0;
    for (var iso2 in series) {
      var v2 = at(series[iso2], y);
      if (v2 === null) continue;
      total++;
      if (v2 < v) rank++;
    }
    add("Ranked " + rank + " of " + total + " economies with data in " + y + ", from the lowest access rate upwards.");
  }
}

/* ============================================================
   LEAST-CONNECTED BARS
   ============================================================ */
function buildLow() {
  var y = curYear();
  var rows = [];
  for (var iso in series) {
    var v = at(series[iso], y);
    if (v !== null) rows.push({ iso: iso, name: NAMES[iso], value: v });
  }
  rows.sort(function (a, b) { return a.value - b.value; });
  rows = rows.slice(0, 12);

  var labels = rows.map(function (r) { return (r.name || r.iso).replace(", Fed. Rep.", "").replace("Dem. Rep.", "DRC"); });
  var vals = rows.map(function (r) { return +r.value.toFixed(1); });
  document.getElementById("chartNote").textContent = rows.length + " economies shown · select a country on the map for detail";

  if (chartLow) {
    chartLow.data.labels = labels;
    chartLow.data.datasets[0].data = vals;
    chartLow.update();
    return;
  }

  chartLow = new Chart(document.getElementById("lowChart"), {
    type: "bar",
    data: { labels: labels, datasets: [{ label: "% with electricity", data: vals, backgroundColor: "rgba(194,65,12,0.78)", borderRadius: 3 }] },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: "% of population with electricity", font: { family: "JetBrains Mono", size: 10 } },
             ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
        y: { ticks: { font: { size: 11 } }, grid: { display: false } }
      }
    }
  });
}

/* ============================================================
   VIEW B — DATA-CENTRE DEMAND
   ============================================================ */
function cleanEntity(e) {
  return e.replace(" (IEA)", "").replace("World excl. United States and China", "World excl. US & China");
}

/* article-aware label for use inside a sentence */
function proseName(e) {
  var n = cleanEntity(e);
  if (n === "United States" || n === "China") return "the " + n;
  return n;
}

function buildDC(year) {
  var rows = [];
  for (var e in dc) {
    var v = at(dc[e], year);
    if (v !== null) rows.push({ e: e, value: v });
  }
  rows.sort(function (a, b) { return b.value - a.value; });

  var labels = rows.map(function (r) { return cleanEntity(r.e); });
  var vals = rows.map(function (r) { return +r.value.toFixed(2); });

  if (chartDC) {
    chartDC.data.labels = labels;
    chartDC.data.datasets[0].data = vals;
    chartDC.update();
  } else {
    chartDC = new Chart(document.getElementById("dcBars"), {
      type: "bar",
      data: { labels: labels, datasets: [{ label: "% of electricity demand", data: vals, backgroundColor: "rgba(58,110,255,0.78)", borderRadius: 3 }] },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: "% of electricity demand", font: { family: "JetBrains Mono", size: 10 } },
               ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
          y: { ticks: { font: { size: 11 } }, grid: { display: false } }
        }
      }
    });
  }

  renderDCInsight(year);
}

function renderDCInsight(year) {
  var box = document.getElementById("dcInsight");
  var order = ["World", "United States", "North America (IEA)", "Europe (IEA)", "China",
               "Asia Pacific (IEA)", "Africa (IEA)", "Middle East (IEA)",
               "Central and South America (IEA)", "World excl. United States and China"];
  var w = at(dc["World"], year), us = at(dc["United States"], year), af = at(dc["Africa (IEA)"], year);

  if (w === null) {
    box.innerHTML = '<div class="empty-note">No estimate is available for ' + year + ".</div>";
    return;
  }

  var rows = [];
  order.forEach(function (e) {
    var v = at(dc[e], year);
    if (v !== null) rows.push({ e: e, value: v });
  });
  var lowest = null;
  rows.forEach(function (r) { if (!lowest || r.value < lowest.value) lowest = r; });
  var ratio = (us !== null && af) ? (us / af).toFixed(0) : null;

  var html = "";
  html += '<div class="country-name">Data-centre electricity demand</div>';
  html += '<div class="country-year">' + year + " estimate</div>";
  if (us !== null) {
    html += '<div class="ratio-callout"><b>' + us.toFixed(1) + "%</b> of electricity demand in the United States was consumed by data centres" +
            (ratio ? " &mdash; <b>" + ratio + "&times;</b> the share reported for Africa" : "") + ".</div>";
  } else {
    html += '<div class="ratio-callout"><b>' + w.toFixed(2) + "%</b> of global electricity demand was consumed by data centres.</div>";
  }
  html += '<ul class="takeaways">';
  rows.forEach(function (r) {
    if (r.e === "World excl. United States and China") return;
    html += "<li>" + cleanEntity(r.e) + ": " + r.value.toFixed(2) + " per cent.</li>";
  });
  if (lowest && us !== null && lowest.e !== "United States") {
    html += "<li>The United States share is " + (us / lowest.value).toFixed(0) + " times the lowest share in the series, " +
            proseName(lowest.e) + " at " + lowest.value.toFixed(3) + " per cent.</li>";
  }
  html += "</ul>";
  box.innerHTML = html;
}

var TREND_ENTITIES = [
  { e: "World", color: "#0d3b66" },
  { e: "United States", color: "#b91c1c" },
  { e: "China", color: "#ea7317" },
  { e: "Europe (IEA)", color: "#3a6eff" },
  { e: "North America (IEA)", color: "#0d9488" },
  { e: "Africa (IEA)", color: "#7c3aed" }
];

function buildTrend() {
  var years = [];
  for (var k in dc["World"]) years.push(parseInt(k, 10));
  years.sort(function (a, b) { return a - b; });

  var ds = TREND_ENTITIES.map(function (t) {
    return {
      label: cleanEntity(t.e),
      data: years.map(function (y) { var v = at(dc[t.e], y); return v === null ? null : +v.toFixed(2); }),
      borderColor: t.color,
      backgroundColor: t.color,
      tension: 0.25,
      pointRadius: 3
    };
  });

  chartTrend = new Chart(document.getElementById("dcTrend"), {
    type: "line",
    data: { labels: years, datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { font: { family: "Inter", size: 11 }, color: "#334155" } } },
      scales: {
        y: { title: { display: true, text: "% of electricity demand", font: { family: "JetBrains Mono", size: 10 } },
             ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
        x: { ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { display: false } }
      }
    }
  });

  /* period takeaways, computed from the CSV response */
  var list = document.getElementById("dcTakeaways");
  list.innerHTML = "";
  function add(txt) { var li = document.createElement("li"); li.textContent = txt; list.appendChild(li); }

  var first = years[0], last = years[years.length - 1];
  var wF = at(dc["World"], first), wL = at(dc["World"], last);
  if (wF !== null && wL !== null) {
    add("The global share of electricity demand consumed by data centres rose from " + wF.toFixed(2) + " per cent in " + first +
        " to " + wL.toFixed(2) + " per cent in " + last + ", an increase of " + Math.round((wL / wF - 1) * 100) + " per cent.");
  }

  /* largest absolute change over the period, computed from the same rows */
  var biggest = null;
  for (var e in dc) {
    var f0 = at(dc[e], first), f1 = at(dc[e], last);
    if (f0 === null || f1 === null) continue;
    var d = f1 - f0;
    if (!biggest || Math.abs(d) > Math.abs(biggest.delta)) biggest = { e: e, delta: d, from: f0, to: f1 };
  }
  if (biggest) {
    add("The largest absolute change was in " + proseName(biggest.e) + ", from " + biggest.from.toFixed(2) +
        " to " + biggest.to.toFixed(2) + " per cent (" + (biggest.delta >= 0 ? "+" : "") + biggest.delta.toFixed(2) + " points).");
  }

  var cF = at(dc["China"], first), cL = at(dc["China"], last);
  if (cF !== null && cL !== null && wL !== null) {
    add("China rose from " + cF.toFixed(2) + " to " + cL.toFixed(2) + " per cent, " +
        (cL < wL ? "below" : "above") + " the global average of " + wL.toFixed(2) + " per cent.");
  }

  var lowest = null;
  for (var e2 in dc) {
    var vLast = at(dc[e2], last);
    if (vLast === null) continue;
    if (!lowest || vLast < lowest.value) lowest = { e: e2, value: vLast, first: at(dc[e2], first) };
  }
  if (lowest) {
    var dir = (lowest.first === null) ? ""
      : ", compared with " + lowest.first.toFixed(3) + " per cent in " + first;
    add("The lowest share in " + last + " was " + proseName(lowest.e) + ", at " + lowest.value.toFixed(3) + " per cent" + dir + ".");
  }

  var missing = [];
  for (var y2 = first + 1; y2 < last; y2++) { if (at(dc["World"], y2) === null) missing.push(y2); }
  if (missing.length) {
    add("The source provides estimates for " + years.join(", ") + " only. The years " + missing.join(" and ") +
        " are not estimated, so the line connects " + (missing.length > 1 ? "them" : "it") + " without an intermediate point.");
  }
}

/* ============================================================
   TIMELINE ENGINE
   ============================================================ */
function onSlide(v) {
  stopPlay();
  onYearChange(Number(v));
}

function setMode(m) {
  stopPlay();
  var yearsArr = (m === "a") ? YEARS_A : DC_YEARS;
  if (!yearsArr.length) return;
  MODE = m;
  YEARS = yearsArr;
  currentIdx = yearsArr.length - 1;
  document.getElementById("modeA").classList.toggle("active", m === "a");
  document.getElementById("modeB").classList.toggle("active", m === "b");
  document.getElementById("viewA").style.display = m === "a" ? "block" : "none";
  document.getElementById("viewB").style.display = m === "b" ? "block" : "none";

  var slider = document.getElementById("yearSlider");
  slider.min = 0;
  slider.max = yearsArr.length - 1;
  slider.value = currentIdx;

  renderJumpButtons();
  onYearChange(currentIdx);
  if (m === "a" && map) setTimeout(function () { map.invalidateSize(); }, 30);
}

function renderJumpButtons() {
  var wrap = document.getElementById("jumpWrap");
  if (MODE === "a") {
    wrap.innerHTML =
      '<button type="button" class="tl-btn" onclick="jumpToYear(2022)">&#8593; 2022</button>' +
      '<button type="button" class="tl-btn" onclick="jumpToYear(2000)">&#8634; 2000</button>';
  } else {
    wrap.innerHTML =
      '<button type="button" class="tl-btn" onclick="jumpToYear(2020)">&#8593; 2020</button>' +
      '<button type="button" class="tl-btn" onclick="jumpToYear(2025)">&#8634; 2025</button>';
  }
}

function jumpToYear(y) {
  stopPlay();
  var idx = YEARS.indexOf(y);
  if (idx === -1) idx = YEARS.length - 1;
  onYearChange(idx);
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
  }, MODE === "b" ? 1400 : 1500);
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

  document.getElementById("yearDisplay").textContent = y;
  var slider = document.getElementById("yearSlider");
  slider.value = currentIdx;
  var fill = (currentIdx / Math.max(1, YEARS.length - 1)) * 100;
  slider.style.setProperty("--fill", fill + "%");

  if (MODE === "a") {
    document.getElementById("mapYearLabel").textContent = y;
    document.getElementById("lowYearLabel").textContent = y;
    var withData = 0;
    for (var iso3 in series) { if (at(series[iso3], y) !== null) withData++; }
    document.getElementById("countNote").textContent = withData + " economies with data";
    restyleMap();
    buildLow();
    if (selected) selectCountry(selected);
    var wa = at(worldAccess, y), wp = at(worldPop, y);
    if (wa !== null) {
      var without = wp !== null ? wp * (100 - wa) / 100 : null;
      document.getElementById("yearCaption").textContent =
        wa.toFixed(1) + " per cent of the world had access to electricity in " + y +
        (without !== null ? "; approximately " + fmtPeople(without) + " people did not." : ".");
    } else {
      document.getElementById("yearCaption").textContent = "Access to electricity, " + y + ".";
    }
  } else {
    document.getElementById("dcYearLabel").textContent = y;
    if (!chartTrend) buildTrend();
    buildDC(y);
    var w = at(dc["World"], y), us = at(dc["United States"], y);
    document.getElementById("yearCaption").textContent =
      w !== null ? "Data centres accounted for " + w.toFixed(2) + " per cent of global electricity demand in " + y +
        (us !== null ? "; the share in the United States was " + us.toFixed(2) + " per cent." : ".") : "IEA estimate for " + y + ".";
    document.getElementById("chartNote").textContent =
      "IEA estimates for " + y + "; 2021 and 2022 are not estimated";
    document.getElementById("countNote").textContent = "10 regions and economies";
  }
}

/* ---------- boot ---------- */
loadAll().catch(function (e) {
  setStatus("Live data unavailable. Dashboard structure remains, but live data could not be loaded.");
  console.error(e);
  document.getElementById("status").style.display = "block";
  document.getElementById("app").style.display = "none";
});
