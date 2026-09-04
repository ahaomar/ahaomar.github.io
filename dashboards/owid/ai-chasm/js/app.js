"use strict";

/* ============================================================
   The AI Chasm: concentration of AI capability
   Data: OWID grapher CSVs (open CORS):
     private-investment-in-artificial-intelligence
     cumulative-number-of-large-scale-ai-systems-by-country
     share-artificial-intelligence-job-postings
   ============================================================ */

var invest = {};      /* entity -> {year: US$} */
var systems = {};     /* entity -> {year: count} */
var jobs = {};        /* entity -> {year: share %} */
var chartInvest = null;
var chartSystems = null;
var chartJobs = null;

function setStatus(txt) { document.getElementById("status").textContent = txt; }

function fmtB(v) {
  if (v === null || v === undefined) return "—";
  return "$" + (v / 1e9).toFixed(0) + "B";
}

async function fetchText(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.text();
}

function parseCSV(text) {
  var lines = text.split(/\r?\n/);
  var header = lines[0].split(",");
  var valueCol = header.length - 1;
  var out = [];
  for (var i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    var cols = lines[i].split(",");
    if (cols.length < 3) continue;
    out.push({ entity: cols[0], year: parseInt(cols[2], 10), value: parseFloat(cols[valueCol]) });
  }
  return out;
}

async function loadAll() {
  setStatus("Step 1/3: loading private AI investment (OWID)");
  var t1 = await fetchText("https://ourworldindata.org/grapher/private-investment-in-artificial-intelligence.csv");
  parseCSV(t1).forEach(function (r) {
    if (isNaN(r.value)) return;
    if (!invest[r.entity]) invest[r.entity] = {};
    invest[r.entity][r.year] = r.value;
  });

  setStatus("Step 2/3: loading large-scale AI systems (OWID)");
  var t2 = await fetchText("https://ourworldindata.org/grapher/cumulative-number-of-large-scale-ai-systems-by-country.csv");
  parseCSV(t2).forEach(function (r) {
    if (isNaN(r.value) || !r.entity) return;
    if (!systems[r.entity]) systems[r.entity] = {};
    systems[r.entity][r.year] = r.value;
  });

  setStatus("Step 3/3: loading AI job postings (OWID)");
  var t3 = await fetchText("https://ourworldindata.org/grapher/share-artificial-intelligence-job-postings.csv");
  parseCSV(t3).forEach(function (r) {
    if (isNaN(r.value) || !r.entity) return;
    if (!jobs[r.entity]) jobs[r.entity] = {};
    jobs[r.entity][r.year] = r.value;
  });

  console.log("DATA CHECK invest:", Object.keys(invest).length,
              "| systems:", Object.keys(systems).length,
              "| jobs:", Object.keys(jobs).length);

  setStatus("");
  document.getElementById("status").style.display = "none";
  document.getElementById("app").style.display = "block";

  renderHeadline();
  buildInvestChart();
  buildSystemsChart();
  buildJobsChart();
}

function latestYear(store, entity) {
  var e = store[entity];
  if (!e) return null;
  var max = null;
  for (var y in e) { if (max === null || +y > +max) max = +y; }
  return max;
}

function renderHeadline() {
  var wY = latestYear(invest, "World");
  var world = wY ? invest["World"][wY] : null;
  document.getElementById("statInvest").innerHTML = fmtB(world) + "<small>" + (wY || "") + "</small>";

  var sY = latestYear(systems, "United States");
  var us = sY ? systems["United States"][sY] : null;
  var cn = sY ? (systems["China"] ? (systems["China"][sY] || 0) : 0) : null;
  var total = 0, rest = 0, countRest = 0;
  if (sY) {
    for (var e in systems) {
      if (e === "All large-scale AI systems") continue;
      var v = systems[e][sY];
      if (v === undefined) continue;
      total += v;
      if (e !== "United States" && e !== "China") { rest += v; countRest++; }
    }
  }
  document.getElementById("statUs").innerHTML = (total && us !== null) ? Math.round(us / total * 100) + "%<small>of all systems</small>" : "—";
  document.getElementById("statCn").innerHTML = cn !== null ? cn + "<small>cumulative</small>" : "—";
  document.getElementById("statRow").innerHTML = rest + "<small>across " + countRest + " countries</small>";
}

function buildInvestChart() {
  var entities = ["World", "United States", "China", "Europe"];
  var colors = { "World": "#0f172a", "United States": "#3a6eff", "China": "#ea7317", "Europe": "#0d9488" };

  var yearSet = {};
  entities.forEach(function (e) { for (var y in invest[e] || {}) yearSet[y] = true; });
  var years = Object.keys(yearSet).map(Number).sort();

  var ds = entities.filter(function (e) { return invest[e]; }).map(function (e) {
    return {
      label: e,
      data: years.map(function (y) {
        var v = invest[e][y];
        return v === undefined ? null : +(v / 1e9).toFixed(1);
      }),
      borderColor: colors[e],
      backgroundColor: colors[e],
      tension: 0.25,
      pointRadius: 3
    };
  });

  chartInvest = new Chart(document.getElementById("investChart"), {
    type: "line",
    data: { labels: years, datasets: ds },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { font: { family: "Inter", size: 11 }, color: "#334155" } } },
      scales: {
        y: { title: { display: true, text: "US$ billions", font: { family: "JetBrains Mono", size: 10 } },
             ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
        x: { ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { display: false } }
      }
    }
  });
}

function buildSystemsChart() {
  var latestY = latestYear(systems, "United States");
  var rows = [];
  for (var e in systems) {
    if (e === "All large-scale AI systems") continue;
    var v = systems[e][latestY];
    if (v !== undefined && v > 0) rows.push({ name: e, value: v });
  }
  rows.sort(function (a, b) { return b.value - a.value; });
  rows = rows.slice(0, 10);
  var labels = rows.map(function (r) { return r.name; });
  var vals = rows.map(function (r) { return r.value; });

  var taken = document.getElementById("takeaways");
  var totalAll = vals.reduce(function (a, b) { return a + b; }, 0);
  var li = document.createElement("li");
  li.textContent = "In " + latestY + " the top two countries held " +
    Math.round((vals[0] + vals[1]) / totalAll * 100) + "% of all large-scale AI systems ever built. That is the chasm.";
  taken.appendChild(li);

  chartSystems = new Chart(document.getElementById("systemsChart"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Cumulative large-scale AI systems (" + latestY + ")",
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
        x: { title: { display: true, text: "systems, cumulative", font: { family: "JetBrains Mono", size: 10 } },
             ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
        y: { ticks: { font: { size: 11 } }, grid: { display: false } }
      }
    }
  });
}

function buildJobsChart() {
  var picks = ["Singapore", "United States", "United Kingdom", "India", "Brazil"];
  var colors = ["#3a6eff", "#0f172a", "#0d9488", "#ea7317", "#7c3aed"];

  var yearSet = {};
  picks.forEach(function (e) { for (var y in jobs[e] || {}) yearSet[y] = true; });
  var years = Object.keys(yearSet).map(Number).sort();

  var ds = picks.filter(function (e) { return jobs[e]; }).map(function (e, i) {
    return {
      label: e,
      data: years.map(function (y) {
        var v = jobs[e][y];
        return v === undefined ? null : +v.toFixed(2);
      }),
      borderColor: colors[i % colors.length],
      backgroundColor: colors[i % colors.length],
      tension: 0.25,
      pointRadius: 2
    };
  });

  if (!ds.length) return;

  chartJobs = new Chart(document.getElementById("jobsChart"), {
    type: "line",
    data: { labels: years, datasets: ds },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { font: { family: "Inter", size: 10 }, color: "#334155" } } },
      scales: {
        y: { title: { display: true, text: "% of job postings", font: { family: "JetBrains Mono", size: 10 } },
             ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
        x: { ticks: { font: { family: "JetBrains Mono", size: 9 }, maxRotation: 45 }, grid: { display: false } }
      }
    }
  });
}

loadAll().catch(function (e) {
  setStatus("Could not load live data: " + e.message);
  console.error(e);
});
