"use strict";

/* ============================================================
   Is Your City Hotter Than It Used to Be?
   Data: Open-Meteo (Copernicus ERA5), 1940–present
   ============================================================ */

/* ---------- state ---------- */
var currentCity = null;
var distChart = null;
var monthChart = null;
var annualChart = null;
var debounceTimer = null;

var THEN_FROM = 2010, THEN_TO = 2015;
var NOW_FROM = 2016, NOW_TO = 2024;

/* ---------- helpers ---------- */
function setStatus(txt) {
  document.getElementById("status").textContent = txt;
  console.log("STATUS:", txt);
}

async function fetchJSON(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

function mean(arr) {
  var v = arr.filter(function(x) { return x !== null && x !== undefined; });
  if (!v.length) return null;
  return v.reduce(function(a, b) { return a + b; }, 0) / v.length;
}

/* ---------- geocoding search ---------- */
async function searchCity(query) {
  var d = await fetchJSON("https://geocoding-api.open-meteo.com/v1/search?name=" +
                          encodeURIComponent(query) + "&count=8&language=en&format=json");
  return d.results || [];
}

function renderSuggestions(results) {
  var box = document.getElementById("suggestions");
  box.innerHTML = "";
  if (!results.length) { box.style.display = "none"; return; }
  results.forEach(function(r) {
    var div = document.createElement("div");
    div.className = "suggestion-item";
    div.innerHTML =
      "<b>" + r.name + "</b><small>" +
      (r.admin1 ? r.admin1 + ", " : "") + r.country + "</small>";
    div.addEventListener("click", function() {
      selectCity(r);
    });
    box.appendChild(div);
  });
  box.style.display = "block";
}

function onCityInput() {
  var q = document.getElementById("cityInput").value.trim();
  clearTimeout(debounceTimer);
  if (q.length < 2) {
    document.getElementById("suggestions").style.display = "none";
    return;
  }
  debounceTimer = setTimeout(async function() {
    try {
      var results = await searchCity(q);
      renderSuggestions(results);
    } catch (e) { console.warn(e); }
  }, 350);
}

document.getElementById("cityInput").addEventListener("input", onCityInput);
document.getElementById("cityInput").addEventListener("keydown", function(e) {
  if (e.key === "Escape") document.getElementById("suggestions").style.display = "none";
});
document.addEventListener("click", function(e) {
  if (!e.target.closest(".suggestion-box")) {
    document.getElementById("suggestions").style.display = "none";
  }
});

async function loadPreset(name) {
  setStatus("Locating " + name + "…");
  try {
    var results = await searchCity(name);
    if (results.length) selectCity(results[0]);
  } catch (e) {
    document.getElementById("status").textContent = "ERROR: " + e.message;
  }
}

function selectCity(r) {
  document.getElementById("suggestions").style.display = "none";
  document.getElementById("cityInput").value = r.name;
  document.getElementById("cityDisplay").textContent = r.name;
  document.getElementById("cityCaption").textContent =
    (r.admin1 ? r.admin1 + ", " : "") + r.country + " — loading 14 years of daily data…";
  loadCity(r);
}

/* ============================================================
   DATA LOADING — ERA5 archive in 2 decade fetches
   ============================================================ */
async function fetchDecade(lat, lon, fromY, toY) {
  var url = "https://archive-api.open-meteo.com/v1/archive" +
            "?latitude=" + lat + "&longitude=" + lon +
            "&start_date=" + fromY + "-01-01&end_date=" + toY + "-12-31" +
            "&daily=temperature_2m_mean&timezone=GMT";
  var d = await fetchJSON(url);
  return d.daily || {};
}

async function loadCity(r) {
  try {
    setStatus("Loading 1940s baseline…");
    document.getElementById("status").style.display = "block";
    var thenData = await fetchDecade(r.latitude, r.longitude, THEN_FROM, THEN_TO);

    setStatus("Loading recent decade…");
    var nowData = await fetchDecade(r.latitude, r.longitude, NOW_FROM, NOW_TO);

    /* full annual series for the year-by-year chart: fetch 1940–2024 in 9 chunks */
    setStatus("Loading full 14-year series…");
    var annualTemps = {};   /* year: mean */
    var chunks = [];
    for (var start = 1940; start <= 2024; start += 10) {
      var end = Math.min(start + 9, 2024);
      chunks.push([start, end]);
    }
    for (var c = 0; c < chunks.length; c++) {
      var seg = await fetchDecade(r.latitude, r.longitude, chunks[c][0], chunks[c][1]);
      /* group days by year */
      var times = seg.time || [];
      var temps = seg.temperature_2m_mean || [];
      var byYear = {};
      for (var i = 0; i < times.length; i++) {
        if (temps[i] === null || temps[i] === undefined) continue;
        var y = parseInt(times[i].slice(0, 4), 10);
        if (!byYear[y]) byYear[y] = [];
        byYear[y].push(temps[i]);
      }
      for (var yy in byYear) {
        annualTemps[yy] = mean(byYear[yy]);
      }
    }

    currentCity = {
      name: r.name, country: r.country,
      thenTemps: thenData.temperature_2m_mean || [],
      thenTimes: thenData.time || [],
      nowTemps: nowData.temperature_2m_mean || [],
      nowTimes: nowData.time || [],
      annual: annualTemps
    };

    setStatus("");
    document.getElementById("status").style.display = "none";
    document.getElementById("resultArea").style.display = "block";
    document.getElementById("cityCaption").textContent =
      (r.admin1 ? r.admin1 + ", " : "") + r.country +
      " — " + (r.population ? Number(r.population).toLocaleString() + " people · " : "") +
      "14 years of daily data, live from Copernicus ERA5.";

    renderAll();
  } catch (e) {
    console.error(e);
    document.getElementById("status").style.display = "block";
    document.getElementById("status").textContent = "ERROR: " + e.message + " — see Console (F12)";
  }
}

/* ============================================================
   RENDERING
   ============================================================ */
function monthlyMeans(times, temps) {
  var byMonth = {};
  for (var i = 0; i < times.length; i++) {
    if (temps[i] === null || temps[i] === undefined) continue;
    var m = parseInt(times[i].slice(5, 7), 10);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(temps[i]);
  }
  var out = [];
  for (var mm = 1; mm <= 12; mm++) out.push(mean(byMonth[mm] || []));
  return out;
}

function renderAll() {
  if (!currentCity) return;
  var thenMean = mean(currentCity.thenTemps);
  var nowMean = mean(currentCity.nowTemps);
  var delta = nowMean - thenMean;

  /* hero delta */
  document.getElementById("tempTitle").textContent =
    currentCity.name + " — temperature distribution, then vs now";
  document.getElementById("deltaNum").innerHTML =
    (delta >= 0 ? "+" : "") + delta.toFixed(2) + "&deg;C";
  document.getElementById("deltaLabel").innerHTML =
    "warming in " + currentCity.name + " — 2010&ndash;2015 vs 2016&ndash;2024 average";

  buildDistChart();
  buildMonthChart(thenMean, nowMean);
  buildAnnualChart();
  renderDecades();
  renderTakeaways(thenMean, nowMean, delta);
}

/* distribution histogram */
function buildDistChart() {
  if (distChart) distChart.destroy();

  function hist(temps) {
    var bins = new Array(30).fill(0);   /* -30C to +50C in ~2.7C bins */
    var min = -30, max = 50;
    temps.forEach(function(t) {
      if (t === null || t === undefined) return;
      var idx = Math.min(29, Math.max(0, Math.floor((t - min) / ((max - min) / 30))));
      bins[idx]++;
    });
    return bins;
  }

  var labels = [];
  for (var i = 0; i < 30; i++) labels.push(Math.round(-30 + i * (80 / 30)) + "°");

  distChart = new Chart(document.getElementById("distChart"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "2010–2015 (days)",
          data: hist(currentCity.thenTemps),
          backgroundColor: "rgba(99,177,224,.6)",
          borderRadius: 3
        },
        {
          label: "2016–2024 (days)",
          data: hist(currentCity.nowTemps),
          backgroundColor: "rgba(220,107,90,.7)",
          borderRadius: 3
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#4a5568", boxWidth: 14 } } },
      scales: {
        x: { title: { display: true, text: "Daily mean temperature", color: "#8895a4", font: { size: 11 } },
             ticks: { color: "#8895a4", maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: { title: { display: true, text: "Days per bin", color: "#8895a4", font: { size: 11 } },
             ticks: { color: "#8895a4" }, grid: { color: "#eef1f4" }, beginAtZero: true }
      }
    }
  });
}

function buildMonthChart(thenMean, nowMean) {
  if (monthChart) monthChart.destroy();

  var thenM = monthlyMeans(currentCity.thenTimes, currentCity.thenTemps);
  var nowM = monthlyMeans(currentCity.nowTimes, currentCity.nowTemps);
  var labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  monthChart = new Chart(document.getElementById("monthChart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        { label: "1941–1950", data: thenM.map(function(v){ return +v.toFixed(1); }),
          borderColor: "#63b1e0", backgroundColor: "rgba(99,177,224,.10)",
          fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 3 },
        { label: "2015–2024", data: nowM.map(function(v){ return +v.toFixed(1); }),
          borderColor: "#dc6b5a", backgroundColor: "rgba(220,107,90,.10)",
          fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#4a5568", boxWidth: 14 } } },
      scales: {
        x: { ticks: { color: "#8895a4" }, grid: { display: false } },
        y: { title: { display: true, text: "°C", color: "#8895a4", font: { size: 11 } },
             ticks: { color: "#8895a4", callback: function(v){ return v + "°"; } },
             grid: { color: "#eef1f4" } }
      }
    }
  });
}

function buildAnnualChart() {
  if (annualChart) annualChart.destroy();

  var years = Object.keys(currentCity.annual).map(Number).sort(function(a, b){ return a - b; });
  var labels = years;
  var data = years.map(function(y) {
    var v = currentCity.annual[y];
    return v === null ? null : +v.toFixed(2);
  });

  /* linear trend line */
  var sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, n = 0;
  years.forEach(function(y, i) {
    if (data[i] === null) return;
    sumX += y; sumY += data[i]; sumXY += y * data[i]; sumXX += y * y; n++;
  });
  var slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  var intercept = (sumY - slope * sumX) / n;
  var trend = years.map(function(y) { return +(slope * y + intercept).toFixed(2); });

  annualChart = new Chart(document.getElementById("annualChart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Annual mean °C",
          data: data,
          borderColor: "#1a5c9e",
          backgroundColor: "rgba(26,92,158,.08)",
          fill: true, tension: 0.25, borderWidth: 2, pointRadius: 0
        },
        {
          label: "Trend",
          data: trend,
          borderColor: "#b3541e",
          borderDash: [6, 4], borderWidth: 2, pointRadius: 0, fill: false
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#4a5568", boxWidth: 14 } } },
      scales: {
        x: { ticks: { color: "#8895a4", maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: { ticks: { color: "#8895a4", callback: function(v){ return v + "°"; } },
             grid: { color: "#eef1f4" } }
      }
    }
  });
}

function renderDecades() {
  var grid = document.getElementById("decadeGrid");
  grid.innerHTML = "";
  var decades = [];
  for (var dStart = 1940; dStart <= 2020; dStart += 10) {
    var dEnd = Math.min(dStart + 9, 2024);
    var temps = [];
    for (var y = dStart; y <= dEnd; y++) {
      if (currentCity.annual[y] !== null && currentCity.annual[y] !== undefined) {
        temps.push(currentCity.annual[y]);
      }
    }
    if (temps.length >= 5) {
      decades.push({
        label: dStart + "s",
        mean: mean(temps),
        years: temps.length
      });
    }
  }
  decades.forEach(function(d) {
    var cell = document.createElement("div");
    cell.className = "decade-cell";
    cell.innerHTML =
      "<span>" + d.label + "</span>" +
      "<b>" + d.mean.toFixed(1) + "&deg;C</b>" +
      "<small>" + d.years + " yrs of data</small>";
    grid.appendChild(cell);
  });
}

function renderTakeaways(thenMean, nowMean, delta) {
  var items = [];
  var name = currentCity.name;

  items.push("In the 1940s, " + name + "'s average daily temperature was <b>" + thenMean.toFixed(1) + "&deg;C</b>. " +
    "In the most recent decade it is <b>" + nowMean.toFixed(1) + "&deg;C</b> — a shift of <b>" +
    (delta >= 0 ? "+" : "") + delta.toFixed(2) + "&deg;C</b>.");

  /* hottest decade */
  var bestDecade = null, bestMean = -Infinity;
  for (var dStart = 1940; dStart <= 2010; dStart += 10) {
    var temps = [];
    for (var y = dStart; y <= dStart + 9; y++) {
      if (currentCity.annual[y] !== null && currentCity.annual[y] !== undefined) temps.push(currentCity.annual[y]);
    }
    if (temps.length >= 5) {
      var m = mean(temps);
      if (m > bestMean) { bestMean = m; bestDecade = dStart + "s"; }
    }
  }
  if (bestDecade) {
    items.push("The hottest decade on record for " + name + ": <b>" + bestDecade + "</b>.");
  }

  /* summer shift */
  var thenSummer = mean(currentCity.thenTemps.filter(function(t, i) {
    var m = parseInt(currentCity.thenTimes[i].slice(5, 7), 10);
    return t !== null && (m >= 6 && m <= 8);
  }));
  var nowSummer = mean(currentCity.nowTemps.filter(function(t, i) {
    var m = parseInt(currentCity.nowTimes[i].slice(5, 7), 10);
    return t !== null && (m >= 6 && m <= 8);
  }));
  if (thenSummer !== null && nowSummer !== null) {
    items.push("Summer (Jun&ndash;Aug) has warmed by <b>" + (nowSummer - thenSummer).toFixed(2) + "&deg;C</b> " +
      "— from " + thenSummer.toFixed(1) + "&deg;C to " + nowSummer.toFixed(1) + "&deg;C on average.");
  }

  /* context vs global average */
  items.push("For context: the global average warming since pre-industrial times is about <b>+1.3&ndash;1.5&deg;C</b>. " +
    (delta > 1.5 ? name + " is warming <b>faster than the global average</b>." :
     delta < 0.7 ? name + " is warming <b>more slowly than the global average</b>." :
     name + " is warming <b>in line with the global average</b>."));

  var ul = document.getElementById("takeaways");
  ul.innerHTML = "";
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
  document.getElementById("status").style.display = "none";
  document.getElementById("app").style.display = "block";
});
