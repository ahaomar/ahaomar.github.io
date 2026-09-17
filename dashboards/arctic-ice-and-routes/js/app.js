"use strict";

var series = {};
var years = [];
var chart = null;
var currentYear = 1979;
var playing = false;
var playTimer = null;
var NSR_THRESHOLD = 7.0;
var NWP_THRESHOLD = 8.0;

function setStatus(txt) {
  var el = document.getElementById("status");
  if (el) el.textContent = txt;
}

function fmt(v, digits) {
  if (v === null || v === undefined || !isFinite(v)) return "\u2014";
  return v.toFixed(digits === undefined ? 2 : digits) + "M km\u00B2";
}

function fmtPct(v) {
  if (v === null || v === undefined || !isFinite(v)) return "\u2014";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

function fmtDays(v) {
  if (v === null || v === undefined || !isFinite(v)) return "\u2014";
  return Math.round(v) + " days";
}

async function fetchFirstWorking(urls) {
  var lastErr = null;
  for (var i = 0; i < urls.length; i++) {
    try {
      var res = await fetch(urls[i]);
      if (!res.ok) throw new Error("HTTP " + res.status);
      var txt = await res.text();
      if (!txt || txt.indexOf("Entity") === -1) throw new Error("unexpected payload");
      return txt;
    } catch (e) {
      lastErr = e;
      console.warn("Fetch failed, trying next URL:", urls[i], e.message);
    }
  }
  throw lastErr || new Error("All source URLs failed");
}

function parseCSV(text) {
  var lines = text.replace(/\r/g, "").split("\n");
  var rows = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line) continue;
    var cells = [];
    var cur = "";
    var inQ = false;
    for (var j = 0; j < line.length; j++) {
      var ch = line.charAt(j);
      if (inQ) {
        if (ch === '"') {
          if (line.charAt(j + 1) === '"') { cur += '"'; j++; }
          else inQ = false;
        } else cur += ch;
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === ",") {
        cells.push(cur);
        cur = "";
      } else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

function toNum(s) {
  if (s === null || s === undefined) return null;
  var t = String(s).trim();
  if (!t) return null;
  var v = parseFloat(t);
  return isFinite(v) ? v : null;
}

function loadAll() {
  setStatus("Loading Arctic sea ice extent from Our World in Data\u2026");
  return fetchFirstWorking([
    "https://ourworldindata.org/grapher/arctic-sea-ice.csv",
    "https://ourworldindata.org/grapher/arctic-sea-ice.csv?v=1&csvType=full"
  ]).then(function (text) {
    var rows = parseCSV(text);
    var head = rows[0] || [];
    var iEntity = head.indexOf("Entity");
    var iYear = head.indexOf("Year");
    var iMin = head.indexOf("Minimum (September)");
    var iMax = head.indexOf("Maximum (March)");
    if (iEntity < 0 || iYear < 0 || iMin < 0 || iMax < 0) {
      throw new Error("Unexpected CSV header: " + head.join(" | "));
    }
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r || r.length <= iMax) continue;
      if (r[iEntity] !== "Arctic Ocean") continue;
      var y = parseInt(r[iYear], 10);
      if (!isFinite(y)) continue;
      series[y] = { min: toNum(r[iMin]), max: toNum(r[iMax]) };
    }
    years = Object.keys(series)
      .map(Number)
      .filter(function (y) { return series[y].min !== null; })
      .sort(function (a, b) { return a - b; });

    if (years.length < 10) throw new Error("Too few usable years: " + years.length);

    console.log("DATA CHECK: years", years.length, "range", years[0], "-", years[years.length - 1]);

    setStatus("");
    document.getElementById("status").style.display = "none";
    document.getElementById("app").style.display = "block";

    renderStats();
    buildChart(currentYear);
    onYearChange(years[years.length - 1]);
  });
}

function lowestYear() {
  var best = null;
  for (var i = 0; i < years.length; i++) {
    var y = years[i];
    if (best === null || series[y].min < series[best].min) best = y;
  }
  return best;
}

function rankOf(y) {
  var v = series[y].min;
  var below = 0;
  for (var i = 0; i < years.length; i++) {
    if (series[years[i]].min < v) below++;
  }
  return below + 1;
}

function linearSlope() {
  var n = years.length;
  var mx = 0, my = 0, i, y;
  for (i = 0; i < n; i++) { mx += years[i]; my += series[years[i]].min; }
  mx /= n; my /= n;
  var num = 0, den = 0;
  for (i = 0; i < n; i++) {
    y = years[i];
    num += (y - mx) * (series[y].min - my);
    den += (y - mx) * (y - mx);
  }
  return den === 0 ? 0 : num / den;
}

function iceFreeDays(min, max, threshold) {
  if (min === null || max === null) return null;
  var mid = (min + max) / 2;
  var amp = (max - min) / 2;
  if (amp <= 0) return null;
  var c = (threshold - mid) / amp;
  if (c <= -1) return 0;
  if (c >= 1) return 365;
  var days = 365 * (2 * Math.PI - 2 * Math.acos(c)) / (2 * Math.PI);
  return Math.round(days);
}

function routeStatus(min, route) {
  if (min === null) return { label: "No data", cls: "" };
  if (route === "nsr") {
    if (min <= 4.0) return { label: "Extended season", cls: "is-open" };
    if (min <= 5.0) return { label: "Open", cls: "is-open" };
    if (min <= 6.0) return { label: "Marginal", cls: "is-marg" };
    return { label: "Closed", cls: "is-closed" };
  }
  if (min <= 4.0) return { label: "Open", cls: "is-open" };
  if (min <= 4.8) return { label: "Marginal", cls: "is-marg" };
  return { label: "Closed", cls: "is-closed" };
}

function renderStats() {
  var first = years[0];
  var last = years[years.length - 1];
  var low = lowestYear();
  var slope = linearSlope();

  document.getElementById("stat1979").innerHTML =
    fmt(series[first].min) + "<small>" + first + "</small>";
  document.getElementById("statLow").innerHTML =
    fmt(series[low].min) + "<small>" + low + "</small>";
  document.getElementById("stat2025").innerHTML =
    fmt(series[last].min) + "<small>" + last + "</small>";
  document.getElementById("statDecade").innerHTML =
    slope.toFixed(2) + "<small>M km\u00B2 / yr</small>";

  document.getElementById("worldNote").textContent =
    years.length + " years of satellite data \u00B7 " + first + "\u2013" + last;
}

function buildChart(highlightYear) {
  var labels = years;
  var mins = years.map(function (y) { return series[y].min; });
  var maxs = years.map(function (y) { return series[y].max; });
  var idx = labels.indexOf(highlightYear);

  var thresholdLine = labels.map(function () { return NSR_THRESHOLD; });

  var datasets = [
    {
      label: "September minimum",
      data: mins,
      borderColor: "#009edb",
      backgroundColor: "rgba(0,158,219,.12)",
      fill: true,
      tension: 0.3,
      borderWidth: 2.5,
      pointRadius: function (ctx) { return ctx.dataIndex === idx ? 5 : 0; },
      pointBackgroundColor: "#009edb",
      pointBorderColor: "#ffffff",
      pointBorderWidth: 2
    },
    {
      label: "March maximum",
      data: maxs,
      borderColor: "#dc6b5a",
      backgroundColor: "rgba(220,107,90,.08)",
      fill: true,
      tension: 0.3,
      borderWidth: 2,
      pointRadius: function (ctx) { return ctx.dataIndex === idx ? 5 : 0; },
      pointBackgroundColor: "#dc6b5a",
      pointBorderColor: "#ffffff",
      pointBorderWidth: 2
    },
    {
      label: "7.0M km\u00B2 navigability threshold",
      data: thresholdLine,
      borderColor: "rgba(64,110,140,.85)",
      borderDash: [5, 5],
      borderWidth: 1.4,
      pointRadius: 0,
      fill: false,
      tension: 0
    }
  ];

  if (chart) chart.destroy();

  chart = new Chart(document.getElementById("mainChart"), {
    type: "line",
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      onClick: function (evt, els) {
        if (!els || !els.length) return;
        stopPlay();
        onYearChange(years[els[0].index]);
      },
      plugins: {
        legend: { labels: { color: "#4a5568", boxWidth: 14, filter: function (i) { return i.text.indexOf("threshold") === -1; } } },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              if (ctx.dataset.label.indexOf("threshold") !== -1) {
                return "Navigability threshold: " + NSR_THRESHOLD.toFixed(1) + "M km\u00B2";
              }
              var v = ctx.parsed.y;
              return ctx.dataset.label + ": " + (v === null ? "\u2014" : v.toFixed(2) + "M km\u00B2");
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#8895a4", maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: "Million km\u00B2", color: "#8895a4", font: { size: 11 } },
          ticks: { color: "#8895a4" },
          grid: { color: "#eef1f4" }
        }
      }
    }
  });
}

function renderPanel(y) {
  var d = series[y];
  if (!d) return;

  var low = lowestYear();
  var rank = rankOf(y);
  var first = years[0];
  var base = series[first].min;
  var change = base ? ((d.min - base) / base) * 100 : null;
  var window7 = iceFreeDays(d.min, d.max, NSR_THRESHOLD);
  var window8 = iceFreeDays(d.min, d.max, NWP_THRESHOLD);
  var nsr = routeStatus(d.min, "nsr");
  var nwp = routeStatus(d.min, "nwp");

  document.getElementById("panelYearTitle").textContent = String(y);
  document.getElementById("panelYearSub").textContent =
    "Arctic Ocean \u00B7 September minimum and March maximum, NSIDC record";

  document.getElementById("panelYearMin").textContent = fmt(d.min);
  document.getElementById("panelYearMax").textContent = fmt(d.max);
  document.getElementById("panelYearRank").textContent =
    rank + " of " + years.length;
  document.getElementById("panelYearChange").textContent = fmtPct(change);

  var ratio = document.getElementById("ratioLine");
  if (rank === 1) {
    ratio.innerHTML = "<b>" + y + " is the lowest September minimum on record</b> at " +
      fmt(d.min) + " \u2014 " + fmtPct(change) + " against " + first + ".";
  } else {
    ratio.innerHTML = "September minimum is <b>" + fmt(d.min) + "</b>, " +
      Math.abs(d.min - series[low].min).toFixed(2) + "M km\u00B2 above the record low of " +
      fmt(series[low].min) + " in " + low + ".";
  }

  var nsrEl = document.getElementById("nsrStatus");
  nsrEl.textContent = nsr.label;
  nsrEl.className = nsr.cls;
  document.getElementById("nsrDays").textContent = fmtDays(window7);

  var nwpEl = document.getElementById("nwpStatus");
  nwpEl.textContent = nwp.label;
  nwpEl.className = nwp.cls;
  document.getElementById("nwpDays").textContent = fmtDays(window8);

  document.getElementById("iceFreeDays").textContent = fmtDays(window7);
}

function renderTakeaways(y) {
  var items = [];
  var first = years[0];
  var last = years[years.length - 1];
  var low = lowestYear();
  var slope = linearSlope();

  items.push("September minimum has moved from <b>" + fmt(series[first].min) + "</b> in " + first +
    " to <b>" + fmt(series[last].min) + "</b> in " + last + " \u2014 a change of <b>" +
    fmtPct(((series[last].min - series[first].min) / series[first].min) * 100) + "</b>.");

  items.push("The trend is <b>" + slope.toFixed(3) + "M km\u00B2 per year</b>, about <b>" +
    (slope * 10).toFixed(2) + "M km\u00B2 per decade</b> of summer ice lost.");

  items.push("The record low is <b>" + fmt(series[low].min) + " in " + low + "</b>. " +
    years.filter(function (v) { return series[v].min <= 4.0; }).length +
    " of " + years.length + " years have fallen to 4.0M km\u00B2 or below.");

  var d = series[y];
  var win = iceFreeDays(d.min, d.max, NSR_THRESHOLD);
  items.push("In <b>" + y + "</b> the modelled ice-free window below 7.0M km\u00B2 is <b>" +
    fmtDays(win) + "</b> (March maximum " + fmt(d.max) + ", September minimum " + fmt(d.min) + ").");

  var firstDecade = [];
  var recentDecade = [];
  years.forEach(function (v) {
    if (v >= first && v < first + 10) firstDecade.push(series[v].min);
    if (v > last - 11 && v <= last) recentDecade.push(series[v].min);
  });
  if (firstDecade.length && recentDecade.length) {
    var avgA = firstDecade.reduce(function (s, v) { return s + v; }, 0) / firstDecade.length;
    var avgB = recentDecade.reduce(function (s, v) { return s + v; }, 0) / recentDecade.length;
    items.push("Decade averages: <b>" + avgA.toFixed(2) + "</b>M km\u00B2 (" + first + "\u2013" +
      (first + firstDecade.length - 1) + ") against <b>" + avgB.toFixed(2) + "</b>M km\u00B2 (" +
      (last - recentDecade.length + 1) + "\u2013" + last + ").");
  }

  var ul = document.getElementById("takeaways");
  ul.innerHTML = "";
  for (var i = 0; i < items.length; i++) {
    var li = document.createElement("li");
    li.innerHTML = items[i];
    ul.appendChild(li);
  }
}

function onSlide(y) {
  stopPlay();
  onYearChange(Number(y));
}

function jumpYear(y) {
  stopPlay();
  onYearChange(y);
}

function onYearChange(y) {
  if (!series[y]) return;
  currentYear = y;
  document.getElementById("yearSlider").value = y;
  document.getElementById("yearDisplay").textContent = y;
  document.getElementById("mapYearLabel").textContent = y;

  var caption;
  if (y === lowestYear()) {
    caption = y + " is the record low \u2014 " + fmt(series[y].min) + " in September.";
  } else if (y === years[0]) {
    caption = "The start of the reliable satellite record: " + fmt(series[y].min) + " in September.";
  } else {
    var prev = series[y - 1] ? series[y - 1].min : null;
    caption = y + ": September minimum " + fmt(series[y].min) +
      (prev ? ", " + fmtPct(((series[y].min - prev) / prev) * 100) + " on " + (y - 1) : "") + ".";
  }
  document.getElementById("yearCaption").textContent = caption;

  renderPanel(y);
  renderTakeaways(y);
  buildChart(y);
}

function togglePlay() {
  if (playing) { stopPlay(); return; }
  playing = true;
  var btn = document.getElementById("playBtn");
  btn.classList.remove("active");
  btn.innerHTML = "&#9632; Pause";
  if (currentYear >= years[years.length - 1]) currentYear = years[0] - 1;
  playTimer = setInterval(function () {
    currentYear++;
    if (currentYear > years[years.length - 1]) {
      stopPlay();
      onYearChange(years[years.length - 1]);
      return;
    }
    onYearChange(currentYear);
  }, 1700);
}

function stopPlay() {
  playing = false;
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  var btn = document.getElementById("playBtn");
  if (btn) {
    btn.classList.add("active");
    btn.innerHTML = "&#9654; Play 47 years";
  }
}

document.addEventListener("DOMContentLoaded", function () {
  loadAll().catch(function (err) {
    console.error(err);
    var s = document.getElementById("status");
    s.style.display = "block";
    document.getElementById("app").style.display = "none";
    s.textContent = "Unable to load the Arctic sea ice record from Our World in Data. " +
      "The dashboard structure remains, but live data could not be loaded. Please try again later.";
  });
});