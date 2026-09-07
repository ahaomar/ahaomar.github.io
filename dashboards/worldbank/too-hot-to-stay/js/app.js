"use strict";

/* ============================================================
   Too Hot to Stay: climate exposure x disaster displacement
   Data: World Bank Indicators API (EN.CLC.MDAT.ZS, VC.IDP.NWDS)
   ============================================================ */

/* ---------- state ---------- */
var YEAR_FROM = 2015;
var YEAR_TO = 2023;
var currentYear = YEAR_TO;
var exposure = {};      /* iso3 -> % pop (1990-2009 avg) */
var displaced = {};     /* iso3 -> {year: people} */
var pop = {};           /* iso3 -> people (latest) */
var NAMES = {};         /* iso3 -> name */
var chart = null;

var EXPOSURE_SPLIT = 3;      /* % of population */
var DISPLACED_SPLIT = 0.5;   /* % of population */

/* ---------- helpers ---------- */
function setStatus(txt) {
  document.getElementById("status").textContent = txt;
  console.log("STATUS:", txt);
}

function at(obj, year) {
  if (!obj) return null;
  return (obj[year] !== undefined) ? obj[year] : null;
}

function fmtNum(v) {
  if (v === null || v === undefined) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
  return String(Math.round(v));
}

function fmtFull(v) {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("en-US");
}

function fmtPct(v) {
  if (v === null || v === undefined) return "—";
  return v.toFixed(2) + "%";
}

async function fetchJSON(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

/* ---------- data loading ---------- */
async function loadAll() {
  setStatus("Step 1/3: loading climate exposure (droughts, floods, extreme temps)");
  var eData = await fetchJSON("https://api.worldbank.org/v2/country/all/indicator/EN.CLC.MDAT.ZS?format=json&per_page=20000");
  (eData[1] || []).forEach(function(r) {
    if (r.value === null || !r.countryiso3code) return;
    if (exposure[r.countryiso3code] === undefined) {
      exposure[r.countryiso3code] = r.value;   /* single benchmark year */
      NAMES[r.countryiso3code] = r.country.value;
    }
  });

  setStatus("Step 2/3: loading disaster displacement (2015–2023)");
  var dData = await fetchJSON("https://api.worldbank.org/v2/country/all/indicator/VC.IDP.NWDS?format=json&date=" + YEAR_FROM + ":" + YEAR_TO + "&per_page=20000");
  (dData[1] || []).forEach(function(r) {
    if (r.value === null || !r.countryiso3code) return;
    if (!displaced[r.countryiso3code]) displaced[r.countryiso3code] = {};
    displaced[r.countryiso3code][parseInt(r.date, 10)] = r.value;
    NAMES[r.countryiso3code] = r.country.value;
  });

  setStatus("Step 3/3: loading populations");
  var pData = await fetchJSON("https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&date=" + (YEAR_TO - 1) + ":" + YEAR_TO + "&per_page=20000");
  (pData[1] || []).forEach(function(r) {
    if (r.value === null || !r.countryiso3code) return;
    pop[r.countryiso3code] = r.value;
    if (!NAMES[r.countryiso3code]) NAMES[r.countryiso3code] = r.country.value;
  });

  console.log("DATA CHECK: exposure:", Object.keys(exposure).length,
              "| displaced:", Object.keys(displaced).length,
              "| pop:", Object.keys(pop).length);

  setStatus("");
  document.getElementById("status").style.display = "none";
  document.getElementById("app").style.display = "block";

  buildChart();
  renderHeadline();
  onYearChange(currentYear);
}

/* ---------- headline stats ---------- */
function renderHeadline() {
  var assessed = 0, watch = 0, totalDisplaced = 0;
  for (var iso in displaced) {
    var d = at(displaced[iso], currentYear);
    if (d === null || exposure[iso] === undefined || !pop[iso]) continue;
    assessed++;
    totalDisplaced += d;
    var dpct = (d / pop[iso]) * 100;
    if (exposure[iso] > EXPOSURE_SPLIT && dpct > DISPLACED_SPLIT) watch++;
  }
  document.getElementById("statCountries").innerHTML = assessed + "<small>both series</small>";
  document.getElementById("statDisplaced").innerHTML = fmtNum(totalDisplaced) + "<small>" + currentYear + "</small>";
  document.getElementById("statWatch").innerHTML = watch + "<small>countries</small>";
}

/* ============================================================
   QUADRANT LOGIC
   ============================================================ */
function quadrantOf(iso, year) {
  var d = at(displaced[iso], year);
  var p = pop[iso];
  if (d === null || !p || exposure[iso] === undefined) return null;
  var dpct = (d / p) * 100;
  var hiExp = exposure[iso] > EXPOSURE_SPLIT;
  var hiDis = dpct > DISPLACED_SPLIT;
  if (hiExp && hiDis) return { q: "q1", label: "Watchlist", detail: "High exposure &times; high displacement" };
  if (!hiExp && hiDis) return { q: "q2", label: "Disaster-driven", detail: "Displacement above threshold despite lower exposure" };
  if (hiExp && !hiDis) return { q: "q3", label: "Exposed, not yet moving", detail: "High exposure, displacement still below threshold" };
  return { q: "q4", label: "Lower risk", detail: "Lower exposure and displacement" };
}

/* ============================================================
   SCATTER CHART
   ============================================================ */
function buildChart() {
  if (chart) chart.destroy();

  var pts = [];
  for (var iso in displaced) {
    var d = at(displaced[iso], currentYear);
    if (d === null || exposure[iso] === undefined || !pop[iso]) continue;
    pts.push({
      x: exposure[iso],
      y: +((d / pop[iso]) * 100).toFixed(3),
      iso: iso,
      name: NAMES[iso],
      displaced: d
    });
  }

  chart = new Chart(document.getElementById("scatterChart"), {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Countries",
          data: pts,
          backgroundColor: function(ctx) {
            var p = ctx.raw;
            if (!p) return "rgba(99,177,224,.55)";
            var q = quadrantOf(p.iso, currentYear);
            if (!q) return "rgba(99,177,224,.55)";
            if (q.q === "q1") return "rgba(220,107,90,.78)";   /* watchlist - coral */
            if (q.q === "q2") return "rgba(243,193,95,.75)";    /* disaster-driven - amber */
            if (q.q === "q3") return "rgba(26,92,158,.55)";      /* exposed - cobalt */
            return "rgba(60,184,165,.5)";                        /* lower risk - teal */
          },
          borderColor: "#fff",
          borderWidth: 1,
          pointRadius: function(ctx) {
            var p = ctx.raw;
            if (!p) return 5;
            var base = 4 + Math.sqrt(p.displaced / 1e6) * 3;
            return Math.max(4, Math.min(22, base));
          },
          pointHoverRadius: 10
        },
        /* quadrant reference lines */
        {
          type: "scatter",
          data: [],
          label: "refs"
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
              var p = ctx.raw;
              return [p.name,
                      "Exposure: " + p.x.toFixed(1) + "% of pop",
                      "Displaced: " + fmtFull(p.displaced) + " (" + p.y.toFixed(2) + "% of pop)"];
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: "Population exposed to climate extremes (%)", color: "#8895a4", font: { size: 11 } },
          ticks: { color: "#8895a4", callback: function(v) { return v + "%" } },
          grid: { color: "#eef1f4" }
        },
        y: {
          title: { display: true, text: "Displaced by disasters (% of population)", color: "#8895a4", font: { size: 11 } },
          ticks: { color: "#8895a4", callback: function(v) { return v + "%" } },
          grid: { color: "#eef1f4" }
        }
      }
    }
  });

  /* quadrant guide lines drawn as annotations via afterDraw */
  var ctx2 = chart.ctx;
  (chart.options.plugins.annotation = {});
  chart.options.animation = { duration: 400 };
  window.__scatterChart = chart;
}

/* ============================================================
   YEAR ENGINE: slider + autoplay
   ============================================================ */
var playing = false;
var playTimer = null;

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
  }, 1800);
}

function stopPlay() {
  playing = false;
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  var btn = document.getElementById("playBtn");
  btn.classList.add("active");
  btn.innerHTML = "&#9654; Play years";
}

function onYearChange(y) {
  currentYear = y;
  document.getElementById("yearSlider").value = y;
  document.getElementById("yearDisplay").textContent = y;
  var slider = document.getElementById("yearSlider");
  var pct = ((y - YEAR_FROM) / (YEAR_TO - YEAR_FROM)) * 100;
  slider.style.setProperty("--fill", pct + "%");

  var captions = {
    2015: "Cyclone Pam, Nepal earthquake year.",
    2016: "",
    2017: "Atlantic hurricane season: Harvey, Irma, Maria.",
    2018: "",
    2019: "Cyclones Idai and Fani.",
    2020: "Displacement compounded by pandemic year.",
    2021: "",
    2022: "Pakistan floods displace millions in a single monsoon.",
    2023: "Latest available year."
  };
  document.getElementById("yearCaption").textContent =
    captions[y] || "Drag to see how the risk map shifts year by year.";

  renderHeadline();
  buildChart();
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
