"use strict";

/* ============================================================
   The Aid Retreat: ODA vs displaced population
   Data: World Bank DT.ODA.ODAT.CD (World aggregate)
         UNHCR population/v1 global aggregate per year
   ============================================================ */

var YEAR_FROM = 2015;
var YEAR_TO = 2024;
var odaByYear = {};        /* year -> US$ */
var fleeingByYear = {};    /* year -> people of concern */
var chartDual = null;
var chartPerHead = null;

function setStatus(txt) {
  document.getElementById("status").textContent = txt;
}

function fmtUsd(v) {
  if (v === null || v === undefined) return "—";
  return "$" + (v / 1e9).toFixed(0) + "B";
}

function fmtNum(v) {
  if (v === null || v === undefined) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  return String(Math.round(v));
}

async function fetchJSON(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

async function loadAll() {
  setStatus("Step 1/2: loading global ODA from the World Bank Indicators API");
  var odaData = await fetchJSON("https://api.worldbank.org/v2/country/WLD/indicator/DT.ODA.ODAT.CD?format=json&date=2000:2023&per_page=30");
  (odaData[1] || []).forEach(function (r) {
    if (r.value === null) return;
    odaByYear[parseInt(r.date, 10)] = r.value;
  });

  setStatus("Step 2/2: loading displaced population from the UNHCR Population Statistics API");
  var unhcr = await fetchJSON("https://api.unhcr.org/population/v1/population/?yearFrom=" + YEAR_FROM + "&yearTo=" + YEAR_TO);
  (unhcr.items || []).forEach(function (i) {
    function n(k) { var v = i[k]; return (typeof v === "number") ? v : (parseInt(v, 10) || 0); }
    fleeingByYear[i.year] = n("refugees") + n("asylum_seekers") + n("idps") + n("oip");
  });

  console.log("DATA CHECK: oda years:", Object.keys(odaByYear).length,
              "| unhcr years:", Object.keys(fleeingByYear).length);

  setStatus("");
  document.getElementById("status").style.display = "none";
  document.getElementById("app").style.display = "block";

  renderHeadline();
  buildDualChart();
  buildPerHeadChart();
}

function perHead(year) {
  var o = odaByYear[year];
  var p = fleeingByYear[year];
  if (!o || !p) return null;
  return o / p;
}

function renderHeadline() {
  var latestOda = null, latestOdaYear = null;
  for (var y = 2023; y >= 2000; y--) { if (odaByYear[y]) { latestOda = odaByYear[y]; latestOdaYear = y; break; } }
  var latestFlee = null, latestFleeYear = null;
  for (var y2 = YEAR_TO; y2 >= YEAR_FROM; y2--) { if (fleeingByYear[y2]) { latestFlee = fleeingByYear[y2]; latestFleeYear = y2; break; } }

  document.getElementById("statOda").innerHTML = fmtUsd(latestOda) + "<small>" + latestOdaYear + "</small>";
  document.getElementById("statDisplaced").innerHTML = fmtNum(latestFlee) + "<small>" + latestFleeYear + "</small>";

  var ph = perHead(latestOdaYear >= latestFleeYear ? latestFleeYear : latestOdaYear);
  var phBase = perHead(2015);
  document.getElementById("statPerHead").innerHTML = "$" + (ph ? ph.toFixed(0) : "—") + "<small>per year</small>";
  if (ph && phBase) {
    var pct = ((ph / phBase) - 1) * 100;
    var el = document.getElementById("statDelta");
    el.innerHTML = (pct >= 0 ? "+" : "") + pct.toFixed(0) + "%<small>real terms, per head</small>";
    el.style.color = pct < 0 ? "var(--coral)" : "var(--un-blue-dark)";
  }
}

function buildDualChart() {
  var years = [];
  for (var y = 2015; y <= 2023; y++) { if (odaByYear[y] && fleeingByYear[y]) years.push(y); }

  chartDual = new Chart(document.getElementById("dualChart"), {
    type: "bar",
    data: {
      labels: years,
      datasets: [
        {
          label: "ODA received, world ($B)",
          data: years.map(function (y) { return +(odaByYear[y] / 1e9).toFixed(1); }),
          backgroundColor: "rgba(58,110,255,0.75)",
          yAxisID: "yOda",
          order: 2
        },
        {
          label: "People displaced (millions)",
          data: years.map(function (y) { return +(fleeingByYear[y] / 1e6).toFixed(1); }),
          type: "line",
          borderColor: "#c2410c",
          backgroundColor: "#c2410c",
          tension: 0.25,
          pointRadius: 4,
          yAxisID: "yPop",
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { font: { family: "Inter" }, color: "#334155" } },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              if (ctx.datasetIndex === 0) return " ODA: $" + ctx.parsed.y + "B";
              return " Displaced: " + ctx.parsed.y + "M";
            }
          }
        }
      },
      scales: {
        yOda: {
          position: "left",
          title: { display: true, text: "ODA ($ billions)", font: { family: "JetBrains Mono", size: 10 } },
          grid: { color: "rgba(148,163,184,0.15)" },
          ticks: { font: { family: "JetBrains Mono", size: 10 } }
        },
        yPop: {
          position: "right",
          title: { display: true, text: "People displaced (millions)", font: { family: "JetBrains Mono", size: 10 } },
          grid: { drawOnChartArea: false },
          ticks: { font: { family: "JetBrains Mono", size: 10 } }
        },
        x: { ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { display: false } }
      }
    }
  });
}

function buildPerHeadChart() {
  var years = [];
  for (var y = 2015; y <= 2023; y++) { if (perHead(y)) years.push(y); }
  var base = perHead(2015);
  var vals = years.map(function (y) { return +(perHead(y) / base * 100).toFixed(1); });

  var taken = document.getElementById("takeaways");
  var latest = vals[vals.length - 1];
  var latestYear = years[years.length - 1];
  var li1 = document.createElement("li");
  li1.textContent = "In " + latestYear + " the world received $" +
    (perHead(latestYear) / base * 100 >= 100 ? "more" : "less") + " per displaced person than in 2015: index " +
    latest + " versus the 2015 baseline of 100.";
  taken.appendChild(li1);

  var first = vals[0], peak = Math.max.apply(null, vals), trough = Math.min.apply(null, vals);
  var li2 = document.createElement("li");
  li2.textContent = "The series peaked at index " + peak + " and bottomed at " + trough +
    "; total ODA in the same window moved in the opposite direction, from $" + (odaByYear[years[0]] / 1e9).toFixed(0) +
    "B to $" + (odaByYear[latestYear] / 1e9).toFixed(0) + "B.";
  taken.appendChild(li2);

  var li3 = document.createElement("li");
  li3.textContent = "Read together: the aid budget grew while the population it serves grew faster. Per head, help is retreating.";
  taken.appendChild(li3);

  chartPerHead = new Chart(document.getElementById("perHeadChart"), {
    type: "line",
    data: {
      labels: years,
      datasets: [{
        label: "Aid per displaced person (2015 = 100)",
        data: vals,
        borderColor: "#3a6eff",
        backgroundColor: "rgba(58,110,255,0.08)",
        fill: true,
        tension: 0.3,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function (ctx) { return " Index: " + ctx.parsed.y; } } }
      },
      scales: {
        y: { ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(148,163,184,0.15)" } },
        x: { ticks: { font: { family: "JetBrains Mono", size: 10 } }, grid: { display: false } }
      }
    }
  });
}

loadAll().catch(function (e) {
  setStatus("Could not load live data: " + e.message);
  console.error(e);
});
