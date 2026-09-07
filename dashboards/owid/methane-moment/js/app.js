"use strict";

/* ============================================================
   The Methane Moment: CH4 vs CO2, 1850–2024
   Data: Our World in Data (Global Carbon Project)
   ============================================================ */

/* ---------- state ---------- */
var YEAR_FROM = 1850;
var YEAR_TO = 2024;
var currentYear = YEAR_FROM;
var playing = false;
var playTimer = null;
var selected = null;

var CH4 = {};        /* iso3 -> {year: tonnes} */
var CO2 = {};        /* iso3 -> {year: tonnes} */
var NAMES = {};
var WORLD_CH4 = {};  /* year: tonnes */
var WORLD_CO2 = {};  /* year: tonnes */

var worldChart = null;
var compareChart = null;
var countryChart = null;

/* ---------- helpers ---------- */
function setStatus(txt) {
  document.getElementById("status").textContent = txt;
  console.log("STATUS:", txt);
}

function at(obj, year) {
  if (!obj) return null;
  return (obj[year] !== undefined) ? obj[year] : null;
}

function fmtMt(v) {
  if (v === null || v === undefined) return "—";
  return Math.round(v / 1e6) + "Mt";
}

function fmtFull(v) {
  if (v === null || v === undefined) return "—";
  return Number(Math.round(v)).toLocaleString("en-US");
}

async function fetchFirstWorking(urls) {
  var lastErr = null;
  for (var i = 0; i < urls.length; i++) {
    try {
      var res = await fetch(urls[i]);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } catch (e) {
      lastErr = e;
      console.warn("Fetch failed, trying next URL:", urls[i], e.message);
    }
  }
  throw lastErr || new Error("All source URLs failed");
}

/* parse OWID CSV: value is last column; keep countries + World */
function parseOWID(txt, out, worldOut) {
  var lines = txt.trim().split(/\r?\n/);
  if (lines.length < 2) return;
  var vcol = lines[0].split(",").length - 1;
  for (var i = 1; i < lines.length; i++) {
    var cols = lines[i].split(",");
    if (cols.length <= vcol) continue;
    var code = (cols[1] || "").trim();
    var year = parseInt(cols[2], 10);
    var val = parseFloat(cols[vcol]);
    if (!code || !year || isNaN(val)) continue;
    if (code === "OWID_WRL") {
      if (worldOut) worldOut[year] = val;
      continue;
    }
    if (code.length !== 3) continue;
    NAMES[code] = cols[0].trim();
    if (!out[code]) out[code] = {};
    out[code][year] = val;
  }
}

/* ---------- data loading ---------- */
async function loadAll() {
  setStatus("Step 1/2: loading methane emissions (1850–2024)");
  var ch4Csv = await fetchFirstWorking([
    "https://ourworldindata.org/grapher/methane-emissions.csv"
  ]);
  parseOWID(ch4Csv, CH4, WORLD_CH4);

  setStatus("Step 2/2: loading CO2 emissions for comparison");
  var co2Csv = await fetchFirstWorking([
    "https://ourworldindata.org/grapher/annual-co2-emissions-per-country.csv",
    "https://ourworldindata.org/grapher/annual-co-emissions-per-country.csv"
  ]);
  parseOWID(co2Csv, CO2, WORLD_CO2);

  console.log("DATA CHECK: CH4 countries:", Object.keys(CH4).length,
              "| CO2 countries:", Object.keys(CO2).length,
              "| world CH4 years:", Object.keys(WORLD_CH4).length);

  if (!Object.keys(WORLD_CH4).length) throw new Error("No world methane data parsed");

  setStatus("");
  document.getElementById("status").style.display = "none";
  document.getElementById("app").style.display = "block";

  renderHeadline();
  buildWorldChart();
  buildCompareChart();
  buildCountrySelect();
  renderTopEmitters();
  onYearChange(YEAR_FROM);
}

/* ---------- headline ---------- */
function renderHeadline() {
  var latestY = null;
  for (var y = YEAR_TO; y >= 2015; y--) {
    if (WORLD_CH4[y] !== undefined) { latestY = y; break; }
  }
  document.getElementById("stat1850").innerHTML = fmtMt(WORLD_CH4[1850]);
  document.getElementById("stat1950").innerHTML = fmtMt(WORLD_CH4[1950]);
  document.getElementById("statLatest").innerHTML = fmtMt(WORLD_CH4[latestY]) + "<small>" + latestY + "</small>";
}

/* ============================================================
   CHARTS
   ============================================================ */
function buildWorldChart() {
  if (worldChart) worldChart.destroy();

  var labels = [], data = [];
  for (var y = YEAR_FROM; y <= YEAR_TO; y++) {
    if (WORLD_CH4[y] !== undefined) {
      labels.push(y);
      data.push(+(WORLD_CH4[y] / 1e6).toFixed(1));
    }
  }

  worldChart = new Chart(document.getElementById("worldChart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "World CH₄ (Mt)",
        data: data,
        borderColor: "#0d6b63",
        backgroundColor: "rgba(13,107,99,.12)",
        fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 0
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#8895a4", maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: {
          title: { display: true, text: "Mt CH₄ / year", color: "#8895a4", font: { size: 11 } },
          ticks: { color: "#8895a4" }, grid: { color: "#eef1f4" }, beginAtZero: true
        }
      }
    }
  });
}

function buildCompareChart() {
  if (compareChart) compareChart.destroy();

  var labels = [], ch4Idx = [], co2Idx = [];
  var base1900_ch4 = WORLD_CH4[1900], base1900_co2 = WORLD_CO2[1900];

  for (var y = 1900; y <= YEAR_TO; y++) {
    if (WORLD_CH4[y] !== undefined && WORLD_CO2[y] !== undefined) {
      labels.push(y);
      ch4Idx.push(+(WORLD_CH4[y] / base1900_ch4).toFixed(2));
      co2Idx.push(+(WORLD_CO2[y] / base1900_co2).toFixed(2));
    }
  }

  compareChart = new Chart(document.getElementById("compareChart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Methane (×1900)",
          data: ch4Idx,
          borderColor: "#0d6b63",
          backgroundColor: "rgba(13,107,99,.10)",
          fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 0
        },
        {
          label: "CO₂ (×1900)",
          data: co2Idx,
          borderColor: "#dc6b5a",
          backgroundColor: "rgba(220,107,90,.08)",
          fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#4a5568", boxWidth: 14 } } },
      scales: {
        x: { ticks: { color: "#8895a4", maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: {
          title: { display: true, text: "Growth since 1900 (×)", color: "#8895a4", font: { size: 11 } },
          ticks: { color: "#8895a4" }, grid: { color: "#eef1f4" }, beginAtZero: true
        }
      }
    }
  });
}

/* ---------- top emitters bar list ---------- */
function renderTopEmitters() {
  var rows = [];
  for (var iso in CH4) {
    var v = at(CH4[iso], currentYear);
    if (v) rows.push({ iso: iso, v: v });
  }
  rows.sort(function(a, b) { return b.v - a.v; });
  rows = rows.slice(0, 10);
  var maxV = rows.length ? rows[0].v : 1;

  document.getElementById("topTitle").innerHTML =
    "Top methane emitters, " + currentYear;

  var host = document.getElementById("topEmitters");
  host.innerHTML = "";
  rows.forEach(function(r) {
    var row = document.createElement("div");
    row.className = "em-row";
    row.innerHTML =
      "<span class='em-name'>" + NAMES[r.iso] + "</span>" +
      "<div class='em-bar-track'><div class='em-bar' style='width:" + ((r.v / maxV) * 100).toFixed(1) + "%'></div></div>" +
      "<span class='em-val'>" + (r.v / 1e6).toFixed(0) + "Mt</span>";
    row.style.cursor = "pointer";
    row.addEventListener("click", function() { selectCountry(r.iso); });
    host.appendChild(row);
  });
}

/* ============================================================
   YEAR ENGINE
   ============================================================ */
var ERAS = [
  { y: 1850, label: "Agriculture and wetlands: humanity's methane story begins with rice and cattle." },
  { y: 1880, label: "Coal rises; gas streetlights leak methane across industrial cities." },
  { y: 1900, label: "A new century: the fossil era accelerates both gases." },
  { y: 1945, label: "The Great Acceleration: mechanised farming, cheap oil, exploding herds." },
  { y: 1970, label: "Green Revolution: rice yields and cattle herds surge." },
  { y: 2000, label: "China's industrial boom reshapes the methane map." },
  { y: 2015, label: "The Paris Agreement year: methane barely features in it." },
  { y: 2021, label: "COP26 Glasgow: over 100 countries sign the Global Methane Pledge." },
  { y: 2024, label: "Latest year: methane concentrations still rising at record pace." }
];

function eraCaption(y) {
  var best = ERAS[0];
  for (var i = 0; i < ERAS.length; i++) {
    if (Math.abs(ERAS[i].y - y) < Math.abs(best.y - y)) best = ERAS[i];
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
    if (currentYear > YEAR_TO) { stopPlay(); onYearChange(YEAR_TO); return; }
    onYearChange(currentYear);
  }, 140);
}

function stopPlay() {
  playing = false;
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  var btn = document.getElementById("playBtn");
  btn.classList.add("active");
  btn.innerHTML = "&#9654; Play 175 years";
}

function onYearChange(y) {
  currentYear = y;
  document.getElementById("yearSlider").value = y;
  document.getElementById("yearDisplay").textContent = y;

  var slider = document.getElementById("yearSlider");
  var pct = ((y - YEAR_FROM) / (YEAR_TO - YEAR_FROM)) * 100;
  slider.style.setProperty("--fill", pct + "%");

  document.getElementById("yearCaption").textContent = eraCaption(y);

  var w = WORLD_CH4[y];
  document.getElementById("worldNote").textContent =
    w ? "World: " + (w / 1e6).toFixed(0) + "Mt CH₄ in " + y : "";

  renderTopEmitters();
  if (selected) refreshDetail();
}

/* ============================================================
   COUNTRY EXPLORER
   ============================================================ */
function buildCountrySelect() {
  var sel = document.getElementById("countrySelect");
  var list = Object.keys(CH4).sort(function(a, b) {
    return NAMES[a].localeCompare(NAMES[b]);
  });
  list.forEach(function(iso) {
    var o = document.createElement("option");
    o.value = iso;
    o.textContent = NAMES[iso];
    sel.appendChild(o);
  });
  sel.addEventListener("change", function() {
    if (this.value) selectCountry(this.value);
  });
}

function selectCountry(iso) {
  if (!iso || !NAMES[iso]) return;
  selected = iso;
  document.getElementById("countrySelect").value = iso;
  document.getElementById("countryDetail").style.display = "block";
  refreshDetail();
}

function refreshDetail() {
  var iso = selected;
  var ch4 = at(CH4[iso], currentYear);
  var co2 = at(CO2[iso], currentYear);

  document.getElementById("cName").textContent = NAMES[iso];
  document.getElementById("cYear").textContent =
    "Year: " + currentYear + " · Global Carbon Project via Our World in Data";

  var callout = document.getElementById("cCallout");
  if (ch4 !== null) {
    var co2e20 = ch4 * 28;  /* GWP-100 ≈ 28 (simplified IPCC AR6 value incl. feedback) */
    callout.innerHTML =
      "In " + currentYear + ", <b>" + NAMES[iso] + "</b> emitted <b>" + fmtMt(ch4) + "</b> of methane" +
      (co2 !== null ? " alongside <b>" + fmtMt(co2) + "</b> of CO<sub>2</sub>." : ".") +
      " That methane has the 100-year warming power of roughly <b>" + fmtMt(co2e20) + " of CO<sub>2</sub>.";
  } else {
    callout.innerHTML = "No methane data for " + NAMES[iso] + " in " + currentYear + ".";
  }

  renderCountryChart(iso);
  renderCountryTakeaways(iso);
}

function renderCountryChart(iso) {
  if (countryChart) countryChart.destroy();

  var labels = [], ch4 = [];
  for (var y = 1850; y <= YEAR_TO; y++) {
    var v = at(CH4[iso], y);
    if (v !== null) { labels.push(y); ch4.push(+(v / 1e6).toFixed(1)); }
  }

  countryChart = new Chart(document.getElementById("countryChart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "CH₄ (Mt)",
        data: ch4,
        borderColor: "#0d6b63",
        backgroundColor: "rgba(13,107,99,.12)",
        fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 0
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#8895a4", maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: {
          title: { display: true, text: "Mt CH₄", color: "#8895a4", font: { size: 11 } },
          ticks: { color: "#8895a4" }, grid: { color: "#eef1f4" }, beginAtZero: true
        }
      }
    }
  });
}

function renderCountryTakeaways(iso) {
  var items = [];
  var name = NAMES[iso];
  var series = CH4[iso] || {};
  var yrs = Object.keys(series).map(Number).sort(function(a, b) { return a - b; });

  if (yrs.length >= 2) {
    var peak = 0, peakY = null;
    yrs.forEach(function(y) { if (series[y] > peak) { peak = series[y]; peakY = y; } });
    var latestV = series[yrs[yrs.length - 1]];
    var latestY = yrs[yrs.length - 1];
    if (peakY !== latestY) {
      items.push("Peak methane year: <b>" + peakY + "</b> (" + fmtMt(peak) + "); by " + latestY +
        " emissions were " + (((peak - latestV) / peak) * 100).toFixed(0) + "% below that peak.");
    } else {
      items.push(latestY + " is <b>" + name + "'s highest methane year on record</b> (" + fmtMt(peak) + ").");
    }

    var first = series[yrs[0]];
    var last = series[yrs[yrs.length - 1]];
    if (first > 0) {
      var growth = ((last - first) / first) * 100;
      items.push("Across " + yrs[0] + "–" + latestY + ", methane emissions changed by <b>" +
        (growth >= 0 ? "+" : "") + growth.toFixed(0) + "%</b>.");
    }
  }

  /* rank this year */
  var rank = 0, rankList = [];
  for (var i in CH4) {
    var v = at(CH4[i], currentYear);
    if (v) rankList.push({ iso: i, v: v });
  }
  rankList.sort(function(a, b) { return b.v - a.v; });
  for (var r = 0; r < rankList.length; r++) {
    if (rankList[r].iso === iso) { rank = r + 1; break; }
  }
  if (rank) items.push("Ranked <b>#" + rank + "</b> of " + rankList.length + " methane emitters in " + currentYear + ".");

  var ul = document.getElementById("cTakeaways");
  ul.innerHTML = "";
  if (!items.length) items.push("Limited data for " + name + ".");
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
      "ERROR: " + err.message + ": see Console (F12)";
  });
});
