"use strict";

/* ============================================================
   The Hunger Ledger: undernourishment 2015-2023
   Data: World Bank SN.ITK.DEFC.ZS (% population undernourished)
   ============================================================ */

var YEAR_FROM = 2015;
var YEAR_TO = 2023;
var currentYear = YEAR_TO;
var series = {};     /* iso3 -> {year: value} */
var NAMES = {};      /* iso3 -> name */
var AGGREGATES = {}; /* aggregate name -> {year: value} */
var chartBar = null;
var chartIncome = null;
var playTimer = null;

function setStatus(txt) { document.getElementById("status").textContent = txt; }

function at(obj, year) {
  return (obj && obj[year] !== undefined) ? obj[year] : null;
}

async function fetchJSON(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

async function loadAll() {
  setStatus("Loading undernourishment data (World Bank Indicators API)");
  var data = await fetchJSON("https://api.worldbank.org/v2/country/all/indicator/SN.ITK.DEFC.ZS?format=json&date=" + YEAR_FROM + ":" + YEAR_TO + "&per_page=5000");

  var AGG_NAMES = ["Low income", "Lower middle income", "Upper middle income", "High income"];
  (data[1] || []).forEach(function (r) {
    if (r.value === null) return;
    var y = parseInt(r.date, 10);
    var name = r.country.value;
    if (AGG_NAMES.indexOf(name) !== -1) {
      if (!AGGREGATES[name]) AGGREGATES[name] = {};
      AGGREGATES[name][y] = r.value;
    } else if (r.countryiso3code && r.countryiso3code.length === 3) {
      if (!series[r.countryiso3code]) series[r.countryiso3code] = {};
      series[r.countryiso3code][y] = r.value;
      NAMES[r.countryiso3code] = name;
    }
  });

  console.log("DATA CHECK countries:", Object.keys(series).length,
              "| aggregates:", Object.keys(AGGREGATES).length);

  setStatus("");
  document.getElementById("status").style.display = "none";
  document.getElementById("app").style.display = "block";

  buildIncomeChart();
  renderHeadline();
  onYearChange(currentYear);
}

function renderHeadline() {
  var count = 0;
  for (var iso in series) { if (at(series[iso], currentYear) !== null) count++; }
  document.getElementById("statCountries").innerHTML = count + "<small>with data</small>";

  document.getElementById("yrLabel1").textContent = currentYear;
  document.getElementById("yrLabel2").textContent = currentYear;

  var worst = topWorst(currentYear, 1)[0];
  document.getElementById("statWorst").innerHTML = worst
    ? worst.name.split(",")[0] + "<small>" + worst.value.toFixed(1) + "%</small>"
    : "—";

  var low = at(AGGREGATES["Low income"], currentYear);
  document.getElementById("statLow").innerHTML = low !== null ? low.toFixed(1) + "%<small>of population</small>" : "—";

  var worse = 0, total = 0;
  for (var iso2 in series) {
    var v1 = at(series[iso2], YEAR_FROM), v2 = at(series[iso2], currentYear);
    if (v1 === null || v2 === null) continue;
    total++;
    if (v2 > v1) worse++;
  }
  document.getElementById("statWorse").innerHTML = worse + "<small>of " + total + " countries</small>";
}

function topWorst(year, n) {
  var rows = [];
  for (var iso in series) {
    var v = at(series[iso], year);
    if (v !== null) rows.push({ iso: iso, name: NAMES[iso], value: v });
  }
  rows.sort(function (a, b) { return b.value - a.value; });
  return rows.slice(0, n || 12);
}

function buildBar(year) {
  var rows = topWorst(year, 12);
  var labels = rows.map(function (r) { return r.name.replace(", Fed. Rep.", "").replace("Dem. Rep.", "DRC"); });
  var vals = rows.map(function (r) { return +r.value.toFixed(1); });

  var note = document.getElementById("chartNote");
  note.textContent = rows.length + " entries shown · hover for exact values";

  if (chartBar) { chartBar.data.labels = labels; chartBar.data.datasets[0].data = vals; chartBar.update(); return; }

  chartBar = new Chart(document.getElementById("barChart"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "% population undernourished",
        data: vals,
        backgroundColor: "rgba(194,65,12,0.78)",
        borderRadius: 3
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: "% of population", font: { family: "JetBrains Mono", size: 10 } },
             ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
        y: { ticks: { font: { size: 11 } }, grid: { display: false } }
      }
    }
  });
}

function buildIncomeChart() {
  var colors = {
    "Low income": "#b91c1c",
    "Lower middle income": "#ea7317",
    "Upper middle income": "#3a6eff",
    "High income": "#0d9488"
  };
  var years = [];
  for (var y = YEAR_FROM; y <= YEAR_TO; y++) years.push(y);

  var ds = Object.keys(AGGREGATES).map(function (name) {
    return {
      label: name,
      data: years.map(function (y2) {
        var v = at(AGGREGATES[name], y2);
        return v === null ? null : +v.toFixed(1);
      }),
      borderColor: colors[name] || "#334155",
      backgroundColor: colors[name] || "#334155",
      tension: 0.25,
      pointRadius: 3
    };
  });

  chartIncome = new Chart(document.getElementById("incomeChart"), {
    type: "line",
    data: { labels: years, datasets: ds },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { font: { family: "Inter", size: 11 }, color: "#334155" } } },
      scales: {
        y: { title: { display: true, text: "% undernourished", font: { family: "JetBrains Mono", size: 10 } },
             ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
        x: { ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { display: false } }
      }
    }
  });

  var taken = document.getElementById("takeaways");
  var low15 = at(AGGREGATES["Low income"], YEAR_FROM);
  var low23 = at(AGGREGATES["Low income"], YEAR_TO);
  if (low15 !== null && low23 !== null) {
    var li = document.createElement("li");
    li.textContent = "Low-income economies ended " + YEAR_TO + " at " + low23.toFixed(1) +
      "% undernourished, up from " + low15.toFixed(1) + "% in " + YEAR_FROM + ". The gap between income groups is the story.";
    taken.appendChild(li);
  }
  var lm15 = at(AGGREGATES["Lower middle income"], YEAR_FROM);
  var lm23 = at(AGGREGATES["Lower middle income"], YEAR_TO);
  if (lm15 !== null && lm23 !== null) {
    var li2 = document.createElement("li");
    li2.textContent = "Lower-middle-income countries rose from " + lm15.toFixed(1) + "% to " + lm23.toFixed(1) +
      "%, while high-income economies stayed under " + (at(AGGREGATES["High income"], YEAR_TO) || 3).toFixed(1) + "% throughout.";
    taken.appendChild(li2);
  }
}

/* ---------- timeline controls ---------- */
function onSlide(v) { jumpYear(parseInt(v, 10)); }
function jumpYear(y) {
  currentYear = y;
  document.getElementById("yearDisplay").textContent = y;
  document.getElementById("yearSlider").value = y;
  var fill = ((y - YEAR_FROM) / (YEAR_TO - YEAR_FROM)) * 100;
  document.getElementById("yearSlider").style.setProperty("--fill", fill + "%");
  buildBar(y);
  renderHeadline();
  if (playTimer) { stopPlay(); }
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
  }, 1700);
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
