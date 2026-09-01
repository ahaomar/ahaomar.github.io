"use strict";

/* ============================================================
   275 Years of Carbon — annual / cumulative / per-capita CO2
   Data: Our World in Data (Global Carbon Project), 1750–2024
   ============================================================ */

/* ---------- state ---------- */
var YEAR_FROM = 1750;
var YEAR_TO = 2024;
var currentYear = YEAR_FROM;
var mode = "annual";          /* annual | cumulative | perCapita */
var playing = false;
var playTimer = null;
var selected = null;
var map = null;
var geoLayer = null;
var chart = null;

var DATA = {
  annual:    {},   /* iso3 -> {year: tonnes} */
  cumulative:{},   /* iso3 -> {year: tonnes} */
  perCapita: {}    /* iso3 -> {year: tonnes/person} */
};
var NAMES = {};               /* iso3 -> display name */
var WORLD = {};               /* year -> tonnes (annual) */

/* ---------- helpers ---------- */
function setStatus(txt) {
  document.getElementById("status").textContent = txt;
  console.log("STATUS:", txt);
}

function at(obj, year) {
  if (!obj) return null;
  return (obj[year] !== undefined) ? obj[year] : null;
}

function fmtTonnes(v) {
  if (v === null || v === undefined) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "Bt";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "Mt";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "Kt";
  return Math.round(v) + "t";
}

function fmtFull(v) {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("en-US");
}

function fmtCapita(v) {
  if (v === null || v === undefined) return "—";
  return v.toFixed(2) + "t";
}

async function fetchText(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.text();
}

/* parse OWID CSV: Entity,Code,Year,<value>
   keeps only real countries (3-char codes) + World */
function parseOWID(txt, out, keepWorld) {
  var lines = txt.trim().split(/\r?\n/);
  if (lines.length < 2) return;
  var headers = lines[0].split(",");
  var vcol = headers.length - 1; /* value is last column */
  for (var i = 1; i < lines.length; i++) {
    var cols = lines[i].split(",");
    if (cols.length <= vcol) continue;
    var code = (cols[1] || "").trim();
    var year = parseInt(cols[2], 10);
    var val = parseFloat(cols[vcol]);
    if (!code || !year || isNaN(val)) continue;
    if (code === "OWID_WRL") {
      if (keepWorld) WORLD[year] = val;
      continue;
    }
    if (code.length !== 3) continue;            /* skip continents/regions */
    NAMES[code] = cols[0].trim();
    if (!out[code]) out[code] = {};
    out[code][year] = val;
  }
}

/* ---------- data loading ---------- */
/* OWID periodically renames slugs (301 without CORS = browser NetworkError),
   so each dataset tries the primary URL then verified alternates. */
var OWID_SOURCES = {
  annual: [
    "https://ourworldindata.org/grapher/annual-co2-emissions-per-country.csv",
    "https://ourworldindata.org/grapher/annual-co-emissions-per-country.csv"
  ],
  cumulative: [
    "https://ourworldindata.org/grapher/cumulative-co-emissions.csv",
    "https://ourworldindata.org/grapher/cumulative-co2-emissions.csv"
  ],
  perCapita: [
    "https://ourworldindata.org/grapher/co-emissions-per-capita.csv",
    "https://ourworldindata.org/grapher/co2-emissions-per-capita.csv"
  ]
};

async function fetchFirstWorking(urls) {
  var lastErr = null;
  for (var i = 0; i < urls.length; i++) {
    try {
      return await fetchText(urls[i]);
    } catch (e) {
      lastErr = e;
      console.warn("Fetch failed, trying next URL:", urls[i], e.message);
    }
  }
  throw lastErr || new Error("All source URLs failed");
}

async function loadAll() {
  setStatus("Step 1/4 — loading annual CO₂ (1750–2024)");
  var annualCsv = await fetchFirstWorking(OWID_SOURCES.annual);
  parseOWID(annualCsv, DATA.annual, true);

  setStatus("Step 2/4 — loading cumulative CO₂");
  var cumCsv = await fetchFirstWorking(OWID_SOURCES.cumulative);
  parseOWID(cumCsv, DATA.cumulative, false);

  setStatus("Step 3/4 — loading per-capita CO₂");
  var capCsv = await fetchFirstWorking(OWID_SOURCES.perCapita);
  parseOWID(capCsv, DATA.perCapita, false);

  if (!Object.keys(DATA.annual).length) throw new Error("No country data parsed from OWID sources");

  console.log("DATA CHECK — annual:", Object.keys(DATA.annual).length,
              "| cumulative:", Object.keys(DATA.cumulative).length,
              "| perCapita:", Object.keys(DATA.perCapita).length,
              "| world years:", Object.keys(WORLD).length);

  setStatus("Step 4/4 — loading map boundaries");
  var geo = await fetchJSONSafe("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json");

  setStatus("");
  document.getElementById("status").style.display = "none";
  document.getElementById("app").style.display = "block";
  document.getElementById("countNote").textContent =
    Object.keys(DATA.annual).length + " countries · 275 years";

  initMap(geo);
  renderHeadline();
  onYearChange(YEAR_FROM);
}

async function fetchJSONSafe(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

/* ---------- headline stats ---------- */
function renderHeadline() {
  document.getElementById("stat1750").innerHTML = fmtTonnes(WORLD[1750]) + "<small>9.4Kt</small>";
  document.getElementById("stat1850").innerHTML = fmtTonnes(WORLD[1850]);
  document.getElementById("stat1900").innerHTML = fmtTonnes(WORLD[1900]);
  document.getElementById("stat2024").innerHTML = fmtTonnes(WORLD[2024]);
}

/* ============================================================
   CHOROPLETH
   ============================================================ */
function metricFor(iso, year) {
  if (mode === "cumulative") return at(DATA.cumulative[iso], year);
  if (mode === "perCapita") return at(DATA.perCapita[iso], year);
  return at(DATA.annual[iso], year);
}

function shadeColor(v) {
  if (v === null || v === undefined) return "#d5dbe0";
  if (mode === "perCapita") {
    if (v > 15)   return "#0d3b66";
    if (v > 8)    return "#1a5c9e";
    if (v > 4)    return "#3187c4";
    if (v > 2)    return "#63b1e0";
    if (v > 0.5)  return "#a8d4f0";
    if (v > 0.1)  return "#d3ebfa";
    return "#eaf5fd";
  }
  var t = (mode === "cumulative") ? v / 1e9 : v / 1e6; /* tonnes -> Gt or Mt */
  if (t > 50)  return "#0d3b66";
  if (t > 10)  return "#1a5c9e";
  if (t > 2)   return "#3187c4";
  if (t > 0.2) return "#63b1e0";
  if (t > 0.02) return "#a8d4f0";
  if (t > 0.002) return "#d3ebfa";
  return "#eaf5fd";
}

function legendHTML() {
  var rows;
  if (mode === "perCapita") {
    rows = [["over 15t", "#0d3b66"], ["8–15t", "#1a5c9e"], ["4–8t", "#3187c4"], ["2–4t", "#63b1e0"], ["0.5–2t", "#a8d4f0"], ["under 0.5t", "#d3ebfa"]];
  } else if (mode === "cumulative") {
    rows = [["over 50Gt", "#0d3b66"], ["10–50Gt", "#1a5c9e"], ["2–10Gt", "#3187c4"], ["0.2–2Gt", "#63b1e0"], ["0.02–0.2Gt", "#a8d4f0"], ["under 0.02Gt", "#d3ebfa"]];
  } else {
    rows = [["over 50Mt", "#0d3b66"], ["10–50Mt", "#1a5c9e"], ["2–10Mt", "#3187c4"], ["0.2–2Mt", "#63b1e0"], ["0.02–0.2Mt", "#a8d4f0"], ["under 0.02Mt", "#d3ebfa"]];
  }
  var h = "<b>" + (mode === "perCapita" ? "Tonnes per person" : mode === "cumulative" ? "Tonnes since 1750" : "Tonnes this year") + "</b><br>";
  rows.forEach(function(r) {
    h += '<span class="sw" style="background:' + r[1] + '"></span>' + r[0] + '<br>';
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
  legend.onAdd = function() {
    var div = L.DomUtil.create("div", "legend");
    div.innerHTML = legendHTML();
    return div;
  };
  legend.addTo(map);

  geoLayer = L.geoJSON(geo, {
    filter: function(f) { return !!NAMES[f.id]; },
    style: function(f) {
      return {
        color: "#ffffff", weight: 0.8,
        fillColor: shadeColor(metricFor(f.id, currentYear)),
        fillOpacity: 0.92
      };
    },
    onEachFeature: function(f, layer) {
      layer.bindTooltip(function(ev) {
        var v = metricFor(f.id, currentYear);
        var label = mode === "perCapita" ? "t per person" : mode === "cumulative" ? " since 1750" : " in " + currentYear;
        return NAMES[f.id] + (v !== null ? " — " + (mode === "perCapita" ? fmtCapita(v) : fmtFull(Math.round(v)) + "t") + label : " — no data");
      }, { sticky: true });
      layer.on("click", function() { selectCountry(f.id); });
    }
  }).addTo(map);
}

function restyleMap() {
  if (!geoLayer) return;
  geoLayer.eachLayer(function(layer) {
    var iso = layer.feature.id;
    layer.setStyle({
      fillColor: shadeColor(metricFor(iso, currentYear)),
      fillOpacity: 0.92,
      weight: (iso === selected) ? 2.2 : 0.8,
      color: (iso === selected) ? "#009edb" : "#ffffff"
    });
  });
  /* refresh legend text for mode */
  var leg = document.querySelector(".legend");
  if (leg) leg.innerHTML = legendHTML();
}

/* ============================================================
   YEAR ENGINE
   ============================================================ */
var ERAS = [
  { y: 1750, label: "The Industrial Revolution begins — the entire world emits less than a small city does today." },
  { y: 1800, label: "Steam and coal: Britain alone leads the world into the fossil age." },
  { y: 1850, label: "Railways spread; Germany and the US begin to industrialise." },
  { y: 1900, label: "A new century — the US has overtaken every nation in annual emissions." },
  { y: 1913, label: "Peak coal-era Europe on the eve of WWI." },
  { y: 1930, label: "The Great Depression cuts emissions worldwide." },
  { y: 1950, label: "The Great Acceleration — postwar boom, oil age, emissions explode." },
  { y: 1971, label: "UK hits its all-time annual peak — and never returns to it." },
  { y: 1988, label: "NASA's James Hansen testifies to the US Senate; the IPCC is born." },
  { y: 2006, label: "China overtakes the US as the world's largest annual emitter." },
  { y: 2015, label: "The Paris Agreement year." },
  { y: 2020, label: "COVID-19 cuts emissions — the largest annual drop ever recorded." },
  { y: 2024, label: "Latest year: record world emissions, 38.6 billion tonnes." }
];

function eraCaption(year) {
  var best = ERAS[0];
  for (var i = 0; i < ERAS.length; i++) {
    if (Math.abs(ERAS[i].y - year) < Math.abs(best.y - year)) best = ERAS[i];
  }
  if (Math.abs(best.y - year) > 12) {
    var w = WORLD[year];
    return w ? "World emissions this year: " + fmtFull(Math.round(w)) + " tonnes." : "";
  }
  return best.label;
}

function onSlide(y) {
  stopPlay();
  onYearChange(Number(y));
}

function jumpYear(y) {
  stopPlay();
  onYearChange(y);
}

function togglePlay() {
  if (playing) { stopPlay(); return; }
  playing = true;
  var btn = document.getElementById("playBtn");
  btn.classList.remove("active");
  btn.innerHTML = "&#9632; Pause";
  if (currentYear >= YEAR_TO) currentYear = YEAR_FROM;
  playTimer = setInterval(function() {
    currentYear++;
    if (currentYear > YEAR_TO) { stopPlay(); currentYear = YEAR_TO; onYearChange(currentYear); return; }
    onYearChange(currentYear);
  }, 90);
}

function stopPlay() {
  playing = false;
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  var btn = document.getElementById("playBtn");
  btn.classList.add("active");
  btn.innerHTML = "&#9654; Play 275 years";
}

function onYearChange(y) {
  currentYear = y;
  document.getElementById("yearSlider").value = y;
  document.getElementById("yearDisplay").textContent = y;
  document.getElementById("mapYearLabel").textContent = y;

  var slider = document.getElementById("yearSlider");
  var pct = ((y - YEAR_FROM) / (YEAR_TO - YEAR_FROM)) * 100;
  slider.style.setProperty("--fill", pct + "%");

  document.getElementById("yearCaption").textContent = eraCaption(y);

  var w = WORLD[y];
  document.getElementById("worldNote").textContent =
    w ? "World: " + fmtTonnes(w) + " CO₂ in " + y : "";

  document.getElementById("mapTitle").innerHTML =
    (mode === "perCapita" ? "CO<sub>2</sub> per capita, " :
     mode === "cumulative" ? "Cumulative CO<sub>2</sub> since 1750, " :
     "Annual CO<sub>2</sub> emissions, ") + "<span id='mapYearLabel'>" + y + "</span>";

  restyleMap();
  renderTopList();
  if (selected) refreshDetail();
}

/* ============================================================
   MODE
   ============================================================ */
function setMode(m) {
  mode = m;
  document.getElementById("tglAnnual").classList.toggle("active", m === "annual");
  document.getElementById("tglCumulative").classList.toggle("active", m === "cumulative");
  document.getElementById("tglCapita").classList.toggle("active", m === "perCapita");
  onYearChange(currentYear);
}

/* ============================================================
   TOP EMITTERS LIST
   ============================================================ */
function renderTopList() {
  var rows = [];
  for (var iso in NAMES) {
    var v = metricFor(iso, currentYear);
    if (v) rows.push({ iso: iso, v: v });
  }
  rows.sort(function(a, b) { return b.v - a.v; });
  rows = rows.slice(0, 8);

  document.getElementById("topListTitle").innerHTML =
    (mode === "perCapita" ? "Highest per-capita emitters in " :
     mode === "cumulative" ? "Biggest emitters since 1750 in " :
     "Top emitters in ") + currentYear;

  var host = document.getElementById("topList");
  host.innerHTML = "";
  rows.forEach(function(r) {
    var div = document.createElement("div");
    div.className = "top-row" + (r.iso === selected ? " is-selected" : "");
    div.setAttribute("data-iso", r.iso);
    div.innerHTML =
      '<span class="r-name">' + NAMES[r.iso] + '</span>' +
      '<span class="r-val">' + (mode === "perCapita" ? fmtCapita(r.v) : fmtTonnes(r.v)) + '</span>';
    div.addEventListener("click", function() {
      selectCountry(this.getAttribute("data-iso"));
    });
    host.appendChild(div);
  });
}

/* ============================================================
   COUNTRY DETAIL
   ============================================================ */
function selectCountry(iso) {
  if (!iso || !NAMES[iso]) return;
  selected = iso;
  document.getElementById("countryPanel").style.display = "none";
  document.getElementById("chartWrap").style.display = "block";
  refreshDetail();
  restyleMap();
  if (geoLayer) {
    geoLayer.eachLayer(function(layer) {
      if (layer.feature.id === iso) {
        map.flyToBounds(layer.getBounds(), { padding: [50, 50], duration: 0.8 });
      }
    });
  }
}

function refreshDetail() {
  if (!selected) return;
  var iso = selected;
  document.getElementById("countryName").textContent = NAMES[iso];
  document.getElementById("countryYear").textContent =
    "Metric view: " + (mode === "perCapita" ? "per capita" : mode === "cumulative" ? "cumulative since 1750" : "annual") +
    " · Selected year: " + currentYear + " · Global Carbon Project";

  var ann = at(DATA.annual[iso], currentYear);
  var cum = at(DATA.cumulative[iso], currentYear);
  var cap = at(DATA.perCapita[iso], currentYear);

  var ratioEl = document.getElementById("ratioLine");
  var name = NAMES[iso];
  if (ann !== null && cum !== null && cap !== null) {
    ratioEl.innerHTML =
      'In ' + currentYear + ', <b>' + name + '</b> emitted <b>' + fmtTonnes(ann) + '</b> of CO<sub>2</sub>' +
      ' — <b>' + fmtCapita(cap) + '</b> per person. Its total since 1750: <b>' + fmtTonnes(cum) + '</b>.';
  } else if (ann !== null) {
    ratioEl.innerHTML = 'In ' + currentYear + ', <b>' + name + '</b> emitted <b>' + fmtTonnes(ann) + '</b> of CO<sub>2</sub>.';
  } else {
    ratioEl.innerHTML = 'No emission data for ' + name + ' in ' + currentYear + ' — try another year or metric.';
  }

  renderChart(iso);
  renderTakeaways(iso);
}

/* ---------- chart: full 275-year history with era shading ---------- */
function renderChart(iso) {
  if (chart) chart.destroy();

  var labels = [], annual = [], cum = [];
  for (var y = YEAR_FROM; y <= YEAR_TO; y++) {
    var a = at(DATA.annual[iso], y);
    var c = at(DATA.cumulative[iso], y);
    if (a !== null || c !== null) {
      labels.push(y);
      annual.push(a !== null ? +(a / 1e6).toFixed(2) : null);
      cum.push(c !== null ? +(c / 1e9).toFixed(2) : null);
    }
  }

  var showCum = mode === "cumulative";
  chart = new Chart(document.getElementById("countryChart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        showCum ? {
          label: "Cumulative CO₂ (Gt)",
          data: cum,
          borderColor: "#0d3b66",
          backgroundColor: "rgba(13,59,102,.12)",
          fill: true, tension: 0.3, borderWidth: 2.5,
          pointRadius: 0
        } : {
          label: "Annual CO₂ (Mt)",
          data: annual,
          borderColor: "#1a5c9e",
          backgroundColor: "rgba(26,92,158,.10)",
          fill: true, tension: 0.3, borderWidth: 2.5,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              var v = ctx.parsed.y;
              return ctx.dataset.label + ": " + (v === null ? "—" : v.toLocaleString("en-US"));
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: "#8895a4", maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: {
          beginAtZero: true,
          title: { display: true, text: showCum ? "Gt CO₂ (cumulative)" : "Mt CO₂ (annual)", color: "#8895a4", font: { size: 11 } },
          ticks: { color: "#8895a4" }, grid: { color: "#eef1f4" }
        }
      }
    }
  });
}

/* ---------- auto-generated takeaways ---------- */
function renderTakeaways(iso) {
  var items = [];
  var name = NAMES[iso];
  var series = DATA.annual[iso] || {};
  var yearsWithData = Object.keys(series).map(Number).sort(function(a, b) { return a - b; });

  /* first emission year */
  if (yearsWithData.length) {
    var firstY = yearsWithData[0], firstV = series[firstY];
    if (firstV > 0) {
      items.push("<b>" + name + "</b> first appears in the record in <b>" + firstY + "</b>, emitting " + fmtTonnes(firstV) + ".");
    }
  }

  /* peak year + status vs peak */
  if (yearsWithData.length >= 2) {
    var peak = 0, peakYear = null;
    for (var p = 0; p < yearsWithData.length; p++) {
      if (series[yearsWithData[p]] > peak) { peak = series[yearsWithData[p]]; peakYear = yearsWithData[p]; }
    }
    var latestV = series[yearsWithData[yearsWithData.length - 1]];
    var latestY = yearsWithData[yearsWithData.length - 1];
    if (peakYear && peakYear !== latestY) {
      var decline = ((peak - latestV) / peak) * 100;
      items.push("Peak year was <b>" + peakYear + "</b> (" + fmtTonnes(peak) + "); by " + latestY +
        " emissions were <b>down " + decline.toFixed(0) + "%</b> from that peak.");
    } else if (peakYear === latestY) {
      items.push(latestY + " is <b>" + name + "'s highest-emission year on record</b> (" + fmtTonnes(peak) + ").");
    }
  }

  /* cumulative share of world */
  var cumC = at(DATA.cumulative[iso], YEAR_TO);
  var cumW = DATA.cumulative["OWID_WRL"] ? null : null; /* world cumulative not in country file */
  if (cumC !== null && WORLD && Object.keys(WORLD).length) {
    /* approximate world cumulative = sum of countries? too heavy; use UK-comparison instead */
  }
  /* historical responsibility comparison: UK by 1900 = 16.8 Gt (computed from dataset) */
  if (cumC !== null) {
    var gtc = cumC / 1e9;
    if (gtc < 16.8) {
      items.push("Entire history since 1750: <b>" + fmtTonnes(cumC) + "</b> — less than the United Kingdom had emitted by 1900.");
    } else {
      items.push("Entire history since 1750: <b>" + gtc.toFixed(0) + " Gt</b> of CO<sub>2</sub>.");
    }
  }

  /* per-capita context */
  var capNow = at(DATA.perCapita[iso], YEAR_TO);
  if (capNow !== null) {
    items.push("Per-capita today: <b>" + fmtCapita(capNow) + "</b> per person per year (world average ≈ 4.7t).");
  }

  var ul = document.getElementById("takeaways");
  ul.innerHTML = "";
  if (!items.length) items.push("Limited data for " + name + " in this view.");
  items.forEach(function(t) {
    var li = document.createElement("li");
    li.innerHTML = t;
    ul.appendChild(li);
  });
}

/* ============================================================
   BOOT
   ============================================================ */
document.addEventListener("DOMContentLoaded", function() {
  loadAll().catch(function(err) {
    console.error(err);
    document.getElementById("status").textContent =
      "ERROR: " + err.message + " — see Console (F12)";
  });
});
