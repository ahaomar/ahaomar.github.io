"use strict";

/* ============================================================
   The Water Line: renewable freshwater per capita, 2000-2022
   Data: World Bank ER.H2O.INTR.PC
   ============================================================ */

var YEAR_FROM = 2000;
var YEAR_TO = 2022;
var currentYear = YEAR_TO;
var water = {};    /* iso3 -> {year: m3 per capita} */
var NAMES = {};
var chartDecline = null;
var chartScarce = null;
var playTimer = null;
var SCARCITY = 1000;

function setStatus(txt) { document.getElementById("status").textContent = txt; }

function at(obj, year) { return (obj && obj[year] !== undefined) ? obj[year] : null; }

function fmtM3(v) {
  if (v === null || v === undefined) return "—";
  return v >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1);
}

async function fetchJSON(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

async function loadAll() {
  setStatus("Loading renewable freshwater per capita (World Bank Indicators API)");
  var data = await fetchJSON("https://api.worldbank.org/v2/country/all/indicator/ER.H2O.INTR.PC?format=json&date=" + YEAR_FROM + ":" + YEAR_TO + "&per_page=5000");
  (data[1] || []).forEach(function (r) {
    if (r.value === null || !r.countryiso3code || r.countryiso3code.length !== 3) return;
    if (!water[r.countryiso3code]) water[r.countryiso3code] = {};
    water[r.countryiso3code][parseInt(r.date, 10)] = r.value;
    NAMES[r.countryiso3code] = r.country.value;
  });

  console.log("DATA CHECK countries:", Object.keys(water).length);

  setStatus("");
  document.getElementById("status").style.display = "none";
  document.getElementById("app").style.display = "block";

  renderHeadline();
  buildDeclineChart();
  onYearChange(currentYear);
  buildTakeaways();
}

function decliners() {
  var rows = [];
  for (var iso in water) {
    var a = at(water[iso], YEAR_FROM), b = at(water[iso], YEAR_TO);
    if (a === null || b === null) continue;
    rows.push({ iso: iso, name: NAMES[iso], from: a, to: b, drop: (b / a - 1) * 100 });
  }
  rows.sort(function (x, y) { return x.drop - y.drop; });
  return rows;
}

function renderHeadline() {
  var count = 0;
  for (var iso in water) { if (at(water[iso], currentYear) !== null) count++; }
  document.getElementById("statCountries").innerHTML = count + "<small>with data</small>";

  var d = decliners()[0];
  document.getElementById("statWorst").innerHTML = d
    ? Math.round(d.drop) + "%<small>" + d.name.split(",")[0] + "</small>"
    : "—";

  var scarce = 0;
  for (var iso2 in water) {
    var v = at(water[iso2], currentYear);
    if (v !== null && v < SCARCITY) scarce++;
  }
  document.getElementById("statScarce").innerHTML = scarce + "<small>countries &lt; 1,000 m³</small>";
  document.getElementById("statRange").innerHTML = YEAR_FROM + "&ndash;" + YEAR_TO + "<small>24 years</small>";
}

function buildDeclineChart() {
  var rows = decliners().slice(0, 10);
  var labels = rows.map(function (r) { return r.name.replace(", Arab Rep.", "").replace("Dem. Rep.", "DRC"); });
  var fromVals = rows.map(function (r) { return +r.from.toFixed(0); });
  var toVals = rows.map(function (r) { return +r.to.toFixed(0); });

  chartDecline = new Chart(document.getElementById("declineChart"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        { label: YEAR_FROM + " (m³ per person)", data: fromVals, backgroundColor: "rgba(58,110,255,0.75)", borderRadius: 3 },
        { label: YEAR_TO + " (m³ per person)", data: toVals, backgroundColor: "rgba(194,65,12,0.78)", borderRadius: 3 }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { font: { family: "Inter", size: 11 }, color: "#334155" } },
        tooltip: { callbacks: { label: function (ctx) { return " " + ctx.dataset.label + ": " + fmtM3(ctx.parsed.x) + " m³"; } } }
      },
      scales: {
        x: { type: "logarithmic",
             title: { display: true, text: "m³ per capita (log scale)", font: { family: "JetBrains Mono", size: 10 } },
             ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
        y: { ticks: { font: { size: 11 } }, grid: { display: false } }
      }
    }
  });
}

function buildScarceChart(year) {
  var rows = [];
  for (var iso in water) {
    var v = at(water[iso], year);
    if (v !== null && v < SCARCITY) rows.push({ name: NAMES[iso], value: v });
  }
  rows.sort(function (a, b) { return a.value - b.value; });
  rows = rows.slice(0, 12);
  var labels = rows.map(function (r) { return r.name.replace(", Arab Rep.", ""); });
  var vals = rows.map(function (r) { return +r.value.toFixed(0); });

  document.getElementById("yrInline").textContent = year;

  if (chartScarce) {
    chartScarce.data.labels = labels;
    chartScarce.data.datasets[0].data = vals;
    chartScarce.update();
    return;
  }

  chartScarce = new Chart(document.getElementById("scarceChart"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "m³ renewable freshwater per person",
        data: vals,
        backgroundColor: "rgba(13,148,136,0.78)",
        borderRadius: 3
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: "m³ per capita (threshold: 1,000)", font: { family: "JetBrains Mono", size: 10 } },
             ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
        y: { ticks: { font: { size: 11 } }, grid: { display: false } }
      }
    }
  });
}

function buildTakeaways() {
  var taken = document.getElementById("takeaways");
  var rows = decliners();
  var mid = rows.filter(function (r) { return r.from > 500; }).slice(0, 3);
  mid.forEach(function (r) {
    var li = document.createElement("li");
    li.textContent = r.name.split(",")[0] + " fell from " + fmtM3(r.from) + " m³ per person in " + YEAR_FROM +
      " to " + fmtM3(r.to) + " m³ in " + YEAR_TO + " (" + Math.abs(Math.round(r.drop)) + "% decline), driven by population growth against a fixed water supply.";
    taken.appendChild(li);
  });
  var liEnd = document.createElement("li");
  liEnd.textContent = "The falls are structural, not cyclical: renewable freshwater is a stock, population is a flow that compounds. The water line only moves one way.";
  taken.appendChild(liEnd);
}

/* ---------- timeline controls ---------- */
function onSlide(v) { jumpYear(parseInt(v, 10)); }
function jumpYear(y) {
  currentYear = y;
  document.getElementById("yearDisplay").textContent = y;
  document.getElementById("yearSlider").value = y;
  var fill = ((y - YEAR_FROM) / (YEAR_TO - YEAR_FROM)) * 100;
  document.getElementById("yearSlider").style.setProperty("--fill", fill + "%");
  buildScarceChart(y);
  renderHeadline();
  if (playTimer) stopPlay();
}
function togglePlay() {
  if (playTimer) { stopPlay(); return; }
  document.getElementById("playBtn").classList.add("active");
  var y = YEAR_FROM;
  jumpYear(y);
  playTimer = setInterval(function () {
    y += 1;
    if (y > YEAR_TO) { stopPlay(); return; }
    jumpYear(y);
  }, 1500);
}
function stopPlay() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  var btn = document.getElementById("playBtn");
  if (btn) btn.classList.remove("active");
}

loadAll().catch(function (e) {
  setStatus("Could not load live data: " + e.message);
  console.error(e);
});
