/* Dashboard application logic — extracted from inline script */
"use strict";

/* ============================================================
   Ten Years of Flight — UNHCR Population Statistics API
   refugees by origin (map) + by asylum (detail), 2015–2024
   ============================================================ */

/* ---------- state ---------- */
var YEARS = [];
var YEAR_FROM = 2015;
var YEAR_TO = 2024;
var countriesMeta = {};   /* iso3 -> {name, region} */
var byOrigin = {};        /* iso3 -> {year: refugees} */
var byAsylum = {};        /* iso3 -> {year: refugees} */
var worldOrigin = {};     /* year: refugees (world) */
var geoLayer = null;
var map = null;
var chart = null;
var selected = null;
var currentYear = YEAR_FROM;
var playing = false;
var playTimer = null;

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
  if (v >= 1e3) return Math.round(v / 1e3) + "K";
  return String(v);
}

function fmtFull(v) {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("en-US");
}

async function fetchJSON(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

/* ---------- data loading ---------- */
function reshapeRefugees(rows) {
  var out = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.value === null || r.value === undefined) continue;
    var key = r.side === "coo" ? r.country : r.asylum;
    if (!key) continue;
    var num = Number(r.value);
    if (!out[key]) out[key] = {};
    out[key][parseInt(r.year, 10)] = num;
  }
  return out;
}

async function loadAll() {
  var chunk = [];
  for (var y = YEAR_FROM; y <= YEAR_TO; y++) YEARS.push(y);

  /* country list */
  setStatus("Step 1/4 — loading country list");
  var crows = (await fetchJSON("https://api.unhcr.org/population/v1/countries/?output_format=JSON&limit=400")).items || [];
  var isoList = [];
  for (var c = 0; c < crows.length; c++) {
    var co = crows[c];
    if (!co.iso) continue;
    countriesMeta[co.iso] = { name: co.name, region: co.majorArea };
    isoList.push(co.iso);
  }
  var allCodes = isoList.join(",");

  /* refugees by ORIGIN — batches of 120 codes to keep URLs sane */
  setStatus("Step 2/4 — loading refugees by origin (2015–2024)");
  byOrigin = {};
  for (var b = 0; b < isoList.length; b += 120) {
    var batch = isoList.slice(b, b + 120).join(",");
    var d1 = await fetchJSON("https://api.unhcr.org/population/v1/population/?yearFrom=" + YEAR_FROM + "&yearTo=" + YEAR_TO + "&limit=20000&output_format=JSON&coo=" + batch);
    var items1 = d1.items || [];
    for (var i = 0; i < items1.length; i++) {
      var it = items1[i];
      if (!it.coo || it.refugees === null || it.refugees === undefined || it.refugees === "-") continue;
      var v = Number(it.refugees);
      if (!v) continue;
      if (!byOrigin[it.coo]) byOrigin[it.coo] = {};
      byOrigin[it.coo][it.year] = v;
    }
  }

  /* refugees by ASYLUM — same batching */
  setStatus("Step 3/4 — loading refugees by host country");
  byAsylum = {};
  for (var b2 = 0; b2 < isoList.length; b2 += 120) {
    var batch2 = isoList.slice(b2, b2 + 120).join(",");
    var d2 = await fetchJSON("https://api.unhcr.org/population/v1/population/?yearFrom=" + YEAR_FROM + "&yearTo=" + YEAR_TO + "&limit=20000&output_format=JSON&coa=" + batch2);
    var items2 = d2.items || [];
    for (var j = 0; j < items2.length; j++) {
      var it2 = items2[j];
      if (!it2.coa || it2.refugees === null || it2.refugees === undefined || it2.refugees === "-") continue;
      var v2 = Number(it2.refugees);
      if (!v2) continue;
      if (!byAsylum[it2.coa]) byAsylum[it2.coa] = {};
      byAsylum[it2.coa][it2.year] = v2;
    }
  }

  /* world totals per year (from the unfiltered aggregate rows already seen: fetch directly) */
  setStatus("Step 4/4 — computing totals");
  var wd = await fetchJSON("https://api.unhcr.org/population/v1/population/?yearFrom=" + YEAR_FROM + "&yearTo=" + YEAR_TO + "&limit=100&output_format=JSON");
  var witems = wd.items || [];
  for (var w = 0; w < witems.length; w++) {
    var wi = witems[w];
    if (wi.coo === "-" && wi.refugees) worldOrigin[wi.year] = Number(wi.refugees);
  }

  console.log("DATA CHECK — origins:", Object.keys(byOrigin).length,
              "| hosts:", Object.keys(byAsylum).length,
              "| world years:", Object.keys(worldOrigin).length,
              "| meta:", Object.keys(countriesMeta).length);

  setStatus("");
  document.getElementById("status").style.display = "none";
  document.getElementById("app").style.display = "block";
  document.getElementById("countNote").textContent =
    Object.keys(byOrigin).length + " countries with refugee populations";

  buildDropdowns();
  renderTotals();
  return Promise.all([initMapReady()]).then(function() {
    onYearChange(YEAR_FROM, true);
  });
}

/* ---------- world totals ---------- */
function renderTotals() {
  var y = currentYear;
  var wr = worldOrigin[y];

  var topO = null, topOv = 0;
  for (var iso in byOrigin) {
    var v = at(byOrigin[iso], y);
    if (v && v > topOv) { topOv = v; topO = iso; }
  }
  var topH = null, topHv = 0;
  for (var iso2 in byAsylum) {
    var v2 = at(byAsylum[iso2], y);
    if (v2 && v2 > topHv) { topHv = v2; topH = iso2; }
  }

  document.getElementById("totalRef").innerHTML =
    fmtNum(wr) + "<small>" + y + "</small>";
  document.getElementById("topOrigin").innerHTML =
    topO ? countriesMeta[topO].name.split(" (")[0] : "—";
  document.getElementById("topHost").innerHTML =
    topH ? countriesMeta[topH].name.split(" (")[0] : "—";
}

/* ============================================================
   MAP — choropleth of refugees by origin
   ============================================================ */
function shadeColor(n) {
  if (n === null || n === undefined) return "#d5dbe0";
  if (n > 2000000) return "#0d3b66";
  if (n > 1000000) return "#1a5c9e";
  if (n > 500000)  return "#3187c4";
  if (n > 100000)  return "#63b1e0";
  if (n > 25000)   return "#a8d4f0";
  if (n > 1000)    return "#d3ebfa";
  return "#eaf5fd";
}

var mapInitPromise = null;
function initMapReady() {
  if (mapInitPromise) return mapInitPromise;
  mapInitPromise = (async function() {
    map = L.map("map", { zoomSnap: 0.5 }).setView([26, 18], 2);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_2bxi_1_cf4676c92201d853bfc6bafb", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 19
    }).addTo(map);

    var legend = L.control({ position: "bottomright" });
    legend.onAdd = function() {
      var div = L.DomUtil.create("div", "legend");
      function row(lbl, c) {
        return '<span class="sw" style="background:' + c + '"></span>' + lbl + '<br>';
      }
      div.innerHTML =
        "<b>Refugees from</b><br>" +
        row("over 2M", "#0d3b66") +
        row("1–2M", "#1a5c9e") +
        row("500K–1M", "#3187c4") +
        row("100–500K", "#63b1e0") +
        row("25–100K", "#a8d4f0") +
        row("1–25K", "#d3ebfa") +
        row("none reported", "#eaf5fd") +
        row("no data", "#d5dbe0");
      return div;
    };
    legend.addTo(map);

    var geo = await fetchJSON("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json");

    geoLayer = L.geoJSON(geo, {
      filter: function(f) { return !!countriesMeta[f.id]; },
      style: function(f) {
        return {
          color: "#ffffff",
          weight: 0.8,
          fillColor: shadeColor(at(byOrigin[f.id], currentYear)),
          fillOpacity: 0.92
        };
      },
      onEachFeature: function(f, layer) {
        var m = countriesMeta[f.id];
        if (!m) return;
        layer.bindTooltip(function(ev) {
          var n = at(byOrigin[f.id], currentYear);
          return m.name + (n ? " — " + fmtFull(n) + " refugees" : " — no data");
        }, { sticky: true });
        layer.on("click", function() { selectCountry(f.id); });
      }
    }).addTo(map);
  })();
  return mapInitPromise;
}

/* ============================================================
   YEAR ENGINE — slider + play
   ============================================================ */
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
  }, 1600);
}

function stopPlay() {
  playing = false;
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  var btn = document.getElementById("playBtn");
  btn.classList.add("active");
  btn.innerHTML = "&#9654; Play decade";
}

function onYearChange(y, first) {
  currentYear = y;
  document.getElementById("yearSlider").value = y;
  document.getElementById("yearDisplay").textContent = y;
  document.getElementById("mapYearLabel").textContent = y;

  /* slider fill */
  var slider = document.getElementById("yearSlider");
  var pct = ((y - YEAR_FROM) / (YEAR_TO - YEAR_FROM)) * 100;
  slider.style.setProperty("--fill", pct + "%");

  /* caption: what changed this year */
  var note = "";
  var cur = worldOrigin[y];
  var prev = worldOrigin[y - 1];
  if (cur && prev) {
    var delta = ((cur - prev) / prev) * 100;
    note = delta >= 0
      ? "Global refugees " + fmtNum(cur) + " — up " + Math.abs(delta).toFixed(0) + "% on " + (y - 1)
      : "Global refugees " + fmtNum(cur) + " — down " + Math.abs(delta).toFixed(0) + "% on " + (y - 1);
  } else if (cur) {
    note = "Global refugees " + fmtNum(cur);
  }
  document.getElementById("yearCaption").textContent = note;
  document.getElementById("worldNote").textContent = note;

  renderTotals();
  restyleMap();
  renderTopList();
  if (selected) refreshDetail();
}

function restyleMap() {
  if (!geoLayer) return;
  geoLayer.eachLayer(function(layer) {
    var iso = layer.feature.id;
    layer.setStyle({
      fillColor: shadeColor(at(byOrigin[iso], currentYear)),
      fillOpacity: 0.92,
      weight: (iso === selected) ? 2.2 : 0.8,
      color: (iso === selected) ? "#009edb" : "#ffffff"
    });
  });
}

/* ============================================================
   TOP ORIGINS LIST
   ============================================================ */
function renderTopList() {
  var rows = [];
  for (var iso in byOrigin) {
    var v = at(byOrigin[iso], currentYear);
    if (v) rows.push({ iso: iso, v: v });
  }
  rows.sort(function(a, b) { return b.v - a.v; });
  rows = rows.slice(0, 8);

  document.getElementById("topListTitle").textContent =
    "Top origins in " + currentYear;

  var host = document.getElementById("topList");
  host.innerHTML = "";
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var div = document.createElement("div");
    div.className = "top-row" + (r.iso === selected ? " is-selected" : "");
    div.innerHTML =
      '<span class="r-name">' + countriesMeta[r.iso].name.split(" (")[0] + '</span>' +
      '<span class="r-val">' + fmtFull(r.v) + '</span>';
    div.setAttribute("data-iso", r.iso);
    div.addEventListener("click", function() {
      selectCountry(this.getAttribute("data-iso"));
    });
    host.appendChild(div);
  }
}

/* ============================================================
   DROPDOWNS
   ============================================================ */
function buildDropdowns() {
  var regions = {};
  var iso;
  for (iso in countriesMeta) regions[countriesMeta[iso].region] = true;

  var sel = document.getElementById("regionSelect");
  Object.keys(regions).sort().forEach(function(rn) {
    if (!rn) return;
    var o = document.createElement("option");
    o.value = rn; o.textContent = rn;
    sel.appendChild(o);
  });

  sel.addEventListener("change", onRegionChange);
  document.getElementById("countrySelect").addEventListener("change", function() {
    if (this.value) selectCountry(this.value);
  });
}

function onRegionChange() {
  var region = document.getElementById("regionSelect").value;
  var cs = document.getElementById("countrySelect");
  cs.innerHTML = '<option value="">Select a country</option>';
  cs.disabled = !region;
  if (!region) return;

  var list = [];
  var iso;
  for (iso in countriesMeta)
    if (countriesMeta[iso].region === region) list.push(iso);
  list.sort(function(a, b) {
    return countriesMeta[a].name.localeCompare(countriesMeta[b].name);
  });
  list.forEach(function(i2) {
    var o = document.createElement("option");
    o.value = i2; o.textContent = countriesMeta[i2].name;
    cs.appendChild(o);
  });
}

/* ============================================================
   COUNTRY DETAIL
   ============================================================ */
function selectCountry(iso) {
  if (!iso || !countriesMeta[iso]) return;
  selected = iso;

  var region = countriesMeta[iso].region || "";
  if (region) {
    document.getElementById("regionSelect").value = region;
    onRegionChange();
  }
  document.getElementById("countrySelect").value = iso;

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

  document.getElementById("countryName").textContent = countriesMeta[iso].name;
  document.getElementById("countryYear").textContent =
    "Selected year: " + currentYear + " · UNHCR Population Statistics";

  var oVal = at(byOrigin[iso], currentYear);   /* refugees FROM this country */
  var hVal = at(byAsylum[iso], currentYear);   /* refugees HOSTED by this country */

  var ratioEl = document.getElementById("ratioLine");
  if (oVal && hVal) {
    ratioEl.innerHTML =
      '<b>' + fmtFull(oVal) + '</b> refugees from ' + countriesMeta[iso].name.split(" (")[0] +
      ' · hosting <b>' + fmtFull(hVal) + '</b> (' + (oVal >= hVal ? 'mainly an origin country' : 'mainly a host country') + ')';
  } else if (oVal) {
    ratioEl.innerHTML = '<b>' + fmtFull(oVal) + '</b> refugees from ' + countriesMeta[iso].name.split(" (")[0] + ' in ' + currentYear + '.';
  } else if (hVal) {
    ratioEl.innerHTML = 'Hosts <b>' + fmtFull(hVal) + '</b> refugees in ' + currentYear + ' · no significant outflow reported.';
  } else {
    ratioEl.innerHTML = 'No refugee flows reported for ' + currentYear + '.';
  }

  renderChart(iso);
  renderTakeaways(iso, oVal, hVal);
}

/* ---------- chart ---------- */
function renderChart(iso) {
  if (chart) chart.destroy();

  var os = [], hs = [];
  YEARS.forEach(function(y) {
    os.push(at(byOrigin[iso], y));
    hs.push(at(byAsylum[iso], y));
  });

  chart = new Chart(document.getElementById("countryChart"), {
    type: "bar",
    data: {
      labels: YEARS,
      datasets: [
        {
          label: "Refugees from (origin)",
          data: os,
          backgroundColor: "rgba(0,110,185,.75)",
          borderRadius: 3
        },
        {
          label: "Refugees hosted",
          data: hs,
          backgroundColor: "rgba(220,107,90,.65)",
          borderRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#4a5568", boxWidth: 14 } },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              var v = ctx.parsed.y;
              return ctx.dataset.label + ": " + (v === null ? "—" : fmtFull(v));
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: "#8895a4" }, grid: { display: false } },
        y: {
          beginAtZero: true,
          title: { display: true, text: "People", color: "#8895a4", font: { size: 11 } },
          ticks: {
            color: "#8895a4",
            callback: function(v) { return fmtNum(v); }
          },
          grid: { color: "#eef1f4" }
        }
      }
    }
  });
}

/* ---------- auto-generated takeaways ---------- */
function renderTakeaways(iso, oVal, hVal) {
  var items = [];
  var name = countriesMeta[iso].name.split(" (")[0];
  var series = byOrigin[iso] || {};

  /* trend across the decade */
  var yearsWithData = Object.keys(series).map(Number).sort(function(a, b) { return a - b; });
  if (yearsWithData.length >= 2) {
    var yA = yearsWithData[0];
    var yB = yearsWithData[yearsWithData.length - 1];
    var vA = series[yA], vB = series[yB];
    if (vA > 0) {
      var pctChange = ((vB - vA) / vA) * 100;
      if (pctChange >= 0) {
        items.push("Refugee numbers from <b>" + name + " grew about " + pctChange.toFixed(0) +
          "%</b> across the decade, from " + fmtFull(vA) + " in " + yA + " to " + fmtFull(vB) + " in " + yB + ".");
      } else {
        items.push("Refugee numbers from <b>" + name + " fell about " + Math.abs(pctChange).toFixed(0) +
          "%</b> across the decade, from " + fmtFull(vA) + " in " + yA + " to " + fmtFull(vB) + " in " + yB + ".");
      }
    }
  } else if (hVal) {
    items.push("No significant refugee outflow reported &mdash; " + name + " appears in the data as a host country.");
  }

  /* single biggest year-on-year jump */
  var maxJump = 0, jumpYear = null;
  for (var i = 1; i < yearsWithData.length; i++) {
    var pv = series[yearsWithData[i - 1]];
    var cv = series[yearsWithData[i]];
    if (pv > 0 && cv > pv) {
      var jump = cv - pv;
      if (jump > maxJump) { maxJump = jump; jumpYear = yearsWithData[i]; }
    }
  }
  if (maxJump > 10000) {
    items.push("Largest single-year increase in <b>" + jumpYear + "</b>: +" + fmtFull(maxJump) +
      " more people displaced abroad.");
  }

  /* peak year */
  var peak = 0, peakYear = null;
  for (var p = 0; p < yearsWithData.length; p++) {
    if (series[yearsWithData[p]] > peak) {
      peak = series[yearsWithData[p]];
      peakYear = yearsWithData[p];
    }
  }
  if (peak > 0 && peakYear !== yearsWithData[yearsWithData.length - 1]) {
    items.push("Peak displacement was in <b>" + peakYear + "</b> (" + fmtFull(peak) + " refugees); numbers have fallen since.");
  }

  /* role in current year */
  if (oVal && hVal) {
    var role = oVal > hVal * 2 ? "primarily an <b>origin</b> country" :
               hVal > oVal * 2 ? "primarily a <b>host</b> country" :
               "both a significant origin and host country";
    items.push("In " + currentYear + ", " + name + " is " + role + ".");
  }

  if (!items.length) {
    items.push("Limited data for " + name + " — try another year or country.");
  }

  var ul = document.getElementById("takeaways");
  ul.innerHTML = "";
  for (var n = 0; n < items.length; n++) {
    var li = document.createElement("li");
    li.innerHTML = items[n];
    ul.appendChild(li);
  }
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
