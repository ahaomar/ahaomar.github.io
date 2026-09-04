"use strict";

/* ============================================================
   The Graying World: ageing, dependency, fertility
   Data: World Bank SP.POP.65UP.TO.ZS, SP.POP.DPND.OL, SP.DYN.TFRT.IN
   ============================================================ */

var YEAR_FROM = 2000;
var YEAR_TO = 2023;
var currentYear = YEAR_TO;
var aging = {};      /* iso3 -> {year: % 65+} */
var depend = {};     /* iso3 -> {year: old-age dependency} */
var fert = {};       /* iso3 -> value (latest) */
var NAMES = {};
var chartAge = null;
var chartTrend = null;
var chartFert = null;
var playTimer = null;

var TRACKED = ["JPN", "ITA", "DEU", "FRA", "GBR", "USA", "CHN", "KOR", "BRA", "IND", "NGA", "PAK"];

function setStatus(txt) { document.getElementById("status").textContent = txt; }

function at(obj, year) { return (obj && obj[year] !== undefined) ? obj[year] : null; }

async function fetchJSON(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

async function loadAll() {
  setStatus("Step 1/3: loading over-65 population share");
  var d1 = await fetchJSON("https://api.worldbank.org/v2/country/all/indicator/SP.POP.65UP.TO.ZS?format=json&date=" + YEAR_FROM + ":" + YEAR_TO + "&per_page=8000");
  (d1[1] || []).forEach(function (r) {
    if (r.value === null || !r.countryiso3code || r.countryiso3code.length !== 3) return;
    if (!aging[r.countryiso3code]) aging[r.countryiso3code] = {};
    aging[r.countryiso3code][parseInt(r.date, 10)] = r.value;
    NAMES[r.countryiso3code] = r.country.value;
  });

  setStatus("Step 2/3: loading old-age dependency ratios");
  var d2 = await fetchJSON("https://api.worldbank.org/v2/country/all/indicator/SP.POP.DPND.OL?format=json&date=" + YEAR_FROM + ":" + YEAR_TO + "&per_page=8000");
  (d2[1] || []).forEach(function (r) {
    if (r.value === null || !r.countryiso3code || r.countryiso3code.length !== 3) return;
    if (!depend[r.countryiso3code]) depend[r.countryiso3code] = {};
    depend[r.countryiso3code][parseInt(r.date, 10)] = r.value;
  });

  setStatus("Step 3/3: loading fertility rates");
  var d3 = await fetchJSON("https://api.worldbank.org/v2/country/all/indicator/SP.DYN.TFRT.IN?format=json&date=2022:2023&per_page=600");
  (d3[1] || []).forEach(function (r) {
    if (r.value === null || !r.countryiso3code || r.countryiso3code.length !== 3) return;
    fert[r.countryiso3code] = r.value;
    if (!NAMES[r.countryiso3code]) NAMES[r.countryiso3code] = r.country.value;
  });

  console.log("DATA CHECK aging:", Object.keys(aging).length,
              "| depend:", Object.keys(depend).length,
              "| fert:", Object.keys(fert).length);

  setStatus("");
  document.getElementById("status").style.display = "none";
  document.getElementById("app").style.display = "block";

  buildTrendChart();
  renderHeadline();
  onYearChange(currentYear);
  buildFertilityChart();
  buildTakeaways();
}

function fastestAgers() {
  var rows = [];
  for (var iso in aging) {
    var a = at(aging[iso], YEAR_FROM), b = at(aging[iso], YEAR_TO);
    if (a === null || b === null) continue;
    rows.push({ iso: iso, name: NAMES[iso], from: a, to: b, gain: b - a });
  }
  rows.sort(function (x, y) { return y.gain - x.gain; });
  return rows;
}

function renderHeadline() {
  var count = 0;
  for (var iso in aging) { if (at(aging[iso], currentYear) !== null) count++; }
  document.getElementById("statCountries").innerHTML = count + "<small>with data</small>";

  var f = fastestAgers()[0];
  document.getElementById("statFast").innerHTML = f
    ? "+" + f.gain.toFixed(1) + "pp<small>" + f.name.split(",")[0] + "</small>"
    : "—";

  document.getElementById("yrLabel1").textContent = currentYear;
  document.getElementById("yrLabel2").textContent = currentYear;

  var oldest = [], fv = [];
  for (var iso2 in aging) {
    var v = at(aging[iso2], currentYear);
    if (v !== null) oldest.push({ name: NAMES[iso2], value: v });
  }
  oldest.sort(function (a, b) { return b.value - a.value; });
  document.getElementById("statOldest").innerHTML = oldest[0]
    ? oldest[0].name.split(",")[0] + "<small>" + oldest[0].value.toFixed(1) + "%</small>"
    : "—";

  for (var iso3 in fert) { fv.push({ name: NAMES[iso3], value: fert[iso3] }); }
  fv.sort(function (a, b) { return a.value - b.value; });
  document.getElementById("statFert").innerHTML = fv[0]
    ? fv[0].value.toFixed(2) + "<small>" + fv[0].name.split(",")[0] + "</small>"
    : "—";
}

function buildAgeChart(year) {
  var rows = [];
  for (var iso in aging) {
    var v = at(aging[iso], year);
    if (v !== null) rows.push({ name: NAMES[iso], value: v });
  }
  rows.sort(function (a, b) { return b.value - a.value; });
  rows = rows.slice(0, 12);
  var labels = rows.map(function (r) { return r.name.replace(", SAR, China", "").replace(", Fed. Rep.", ""); });
  var vals = rows.map(function (r) { return +r.value.toFixed(1); });

  document.getElementById("yrInline").textContent = year;

  if (chartAge) {
    chartAge.data.labels = labels;
    chartAge.data.datasets[0].data = vals;
    chartAge.update();
    return;
  }

  chartAge = new Chart(document.getElementById("ageChart"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "% of population aged 65+",
        data: vals,
        backgroundColor: "rgba(58,110,255,0.78)",
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

function buildTrendChart() {
  var years = [];
  for (var y = YEAR_FROM; y <= YEAR_TO; y++) years.push(y);
  var palette = ["#3a6eff", "#0f172a", "#0d9488", "#ea7317", "#7c3aed", "#c2410c"];

  var ds = TRACKED.filter(function (iso) { return aging[iso]; }).map(function (iso, i) {
    return {
      label: NAMES[iso].split(",")[0],
      data: years.map(function (y2) {
        var v = at(aging[iso], y2);
        return v === null ? null : +v.toFixed(1);
      }),
      borderColor: palette[i % palette.length],
      backgroundColor: palette[i % palette.length],
      tension: 0.25,
      pointRadius: 2
    };
  });

  chartTrend = new Chart(document.getElementById("trendChart"), {
    type: "line",
    data: { labels: years, datasets: ds },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { font: { family: "Inter", size: 10 }, color: "#334155", boxWidth: 12 } } },
      scales: {
        y: { title: { display: true, text: "% over 65", font: { family: "JetBrains Mono", size: 10 } },
             ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
        x: { ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { display: false } }
      }
    }
  });
}

function buildFertilityChart() {
  var rows = [];
  for (var iso in fert) {
    rows.push({ name: NAMES[iso].split(",")[0], value: fert[iso] });
  }
  rows.sort(function (a, b) { return a.value - b.value; });
  var lowest = rows.slice(0, 8);
  var highest = rows.slice(-8);
  var both = lowest.concat(highest);
  var labels = both.map(function (r) { return r.name; });
  var vals = both.map(function (r) { return +r.value.toFixed(2); });
  var colors = vals.map(function (v) { return v < 2.1 ? "rgba(58,110,255,0.78)" : "rgba(234,115,23,0.78)"; });

  chartFert = new Chart(document.getElementById("fertilityChart"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Births per woman",
        data: vals,
        backgroundColor: colors,
        borderRadius: 3
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function (ctx) { return " " + ctx.parsed.x + " births per woman"; } } }
      },
      scales: {
        x: { title: { display: true, text: "births per woman (replacement: 2.1)", font: { family: "JetBrains Mono", size: 10 } },
             ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
        y: { ticks: { font: { size: 10 } }, grid: { display: false } }
      }
    }
  });
}

function buildTakeaways() {
  var taken = document.getElementById("takeaways");
  var rows = Object.keys(fert).map(function (iso) { return { name: NAMES[iso].split(",")[0], value: fert[iso] }; });
  rows.sort(function (a, b) { return a.value - b.value; });
  var below = rows.filter(function (r) { return r.value < 2.1; }).length;

  var li = document.createElement("li");
  li.textContent = rows.length + " countries report fertility: " + below + " of them sit below the 2.1 replacement line. The aging race is already decided.";
  taken.appendChild(li);

  var f = fastestAgers().slice(0, 3);
  var li2 = document.createElement("li");
  li2.textContent = f.map(function (r) {
    return r.name.split(",")[0] + " (+" + r.gain.toFixed(1) + "pp)";
  }).join(", ") + " aged fastest since " + YEAR_FROM + ", each adding more than most countries manage in half a century.";
  taken.appendChild(li2);
}

/* ---------- timeline controls ---------- */
function onSlide(v) { jumpYear(parseInt(v, 10)); }
function jumpYear(y) {
  currentYear = y;
  document.getElementById("yearDisplay").textContent = y;
  document.getElementById("yearSlider").value = y;
  var fill = ((y - YEAR_FROM) / (YEAR_TO - YEAR_FROM)) * 100;
  document.getElementById("yearSlider").style.setProperty("--fill", fill + "%");
  buildAgeChart(y);
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
  }, 1600);
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
