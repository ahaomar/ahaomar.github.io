/* Dashboard application logic: extracted from inline script */
"use strict";

/* ---------- state ---------- */
var countriesMeta = {};
var displaced = {};        /* VC.IDP.NWDS: people newly displaced by disasters */
var climateExposure = {};  /* EN.CLC.MDAT.ZS: climate context for detail panel */
var refugeeByOrigin = {};  /* SM.POP.RHCR.EO: refugees abroad, context */
var geoLayer = null;
var chart = null;
var selected = null;
var map = null;
var latestYear = null;
var currentYear = null;
var availableYears = [];

/* ---------- helpers ---------- */
function setStatus(txt) {
  document.getElementById("status").textContent = txt;
  console.log("STATUS:", txt);
}

function latest(obj) {
  if (!obj) return { year: null, value: null };
  var ys = Object.keys(obj).map(Number).sort(function(a, b) { return b - a; });
  if (!ys.length) return { year: null, value: null };
  return { year: ys[0], value: obj[ys[0]] };
}

async function fetchJSON(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

function reshape(rows) {
  var out = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.value === null || r.value === undefined || !r.countryiso3code) continue;
    if (!out[r.countryiso3code]) out[r.countryiso3code] = {};
    out[r.countryiso3code][parseInt(r.date, 10)] = r.value;
  }
  return out;
}

function fmtNum(v) {
  if (!v && v !== 0) return "—";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return Math.round(v / 1e3) + "K";
  return Math.round(v);
}

/* ---------- sequential loading ---------- */
async function loadAll() {
  var BASE = "https://api.worldbank.org/v2/country/all/indicator/";

  setStatus("Step 1/5: loading disaster displacement");
  displaced = reshape((await fetchJSON(BASE + "VC.IDP.NWDS?format=json&date=2008:2024&per_page=20000"))[1] || []);

  setStatus("Step 2/5: loading climate context");
  climateExposure = reshape((await fetchJSON(BASE + "EN.CLC.MDAT.ZS?format=json&date=1990:2009&per_page=20000"))[1] || []);

  setStatus("Step 3/5: loading refugee context");
  refugeeByOrigin = reshape((await fetchJSON(BASE + "SM.POP.RHCR.EO?format=json&date=2024&per_page=20000"))[1] || []);

  setStatus("Step 4/5: loading country metadata");
  var crows = (await fetchJSON("https://api.worldbank.org/v2/country?format=json&per_page=400"))[1] || [];
  for (var i = 0; i < crows.length; i++) {
    var r = crows[i];
    if (!r.id || r.region.value === "Aggregates") continue;
    countriesMeta[r.id] = { name: r.name, region: r.region.value.trim() };
  }

  setStatus("Step 5/5: loading map boundaries");
  var geo = await fetchJSON("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json");

  /* latest reported year among real countries */
  latestYear = 2023;
  var best = null;
  var yearSet = {};
  var iso;
  for (iso in displaced) {
    if (!countriesMeta[iso]) continue;
    var ys = Object.keys(displaced[iso]).map(Number);
    for (var j = 0; j < ys.length; j++) {
      yearSet[ys[j]] = 1;
      if (!best || ys[j] > best) best = ys[j];
    }
  }
  latestYear = best || latestYear;
  availableYears = Object.keys(yearSet).map(Number).sort(function(a,b){return a-b;});
  currentYear = availableYears.length ? availableYears[availableYears.length-1] : latestYear;

  console.log("DATA CHECK: displaced:", Object.keys(displaced).length,
              "| exposure:", Object.keys(climateExposure).length,
              "| refugees:", Object.keys(refugeeByOrigin).length,
              "| meta:", Object.keys(countriesMeta).length,
              "| latestYear:", latestYear);

  setStatus("");
  document.getElementById("status").style.display = "none";
  document.getElementById("app").style.display = "block";
  document.getElementById("countNote").textContent =
    Object.keys(countriesMeta).length + " countries available";

  buildDropdowns();
  initMap(geo);
  renderTotals();
}

/* ---------- choropleth ---------- */
function shadeColor(v) {
  if (v === null || v === undefined) return "#d5dbe0";
  if (v > 2000000) return "#7a2d1e";
  if (v > 500000)  return "#a63d2f";
  if (v > 100000)  return "#c0543a";
  if (v > 10000)   return "#d97a49";
  if (v > 1000)    return "#e8a15f";
  return "#f5d7a4";
}

function initMap(geo) {
  map = L.map("map", { zoomSnap: 0.5 }).setView([22, 12], 2);

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
      "<b>Newly displaced</b><br>" +
      row("over 2M", "#7a2d1e") +
      row("500K–2M", "#a63d2f") +
      row("100K–500K", "#c0543a") +
      row("10K–100K", "#d97a49") +
      row("1K–10K", "#e8a15f") +
      row("under 1K", "#f5d7a4") +
      row("no data", "#d5dbe0");
    return div;
  };
  legend.addTo(map);

  geoLayer = L.geoJSON(geo, {
    filter: function(f) {
      return !!countriesMeta[f.id];
    },
    style: function(f) {
      var dv = yearValue(f.id);
      return {
        color: "#ffffff",
        weight: 0.8,
        fillColor: shadeColor(dv),
        fillOpacity: 0.92
      };
    },
    onEachFeature: function(f, layer) {
      var m = countriesMeta[f.id];
      if (!m) return;
      layer.bindTooltip(function() {
        var dv = yearValue(f.id);
        return m.name + (dv ? " · " + fmtNum(dv) + " displaced (" + currentYear + ")" : " · no data");
      }, { sticky: true });
      layer.on("click", function() { selectCountry(f.id); });
    }
  }).addTo(map);
}

function yearValue(iso) {
  if (!displaced[iso] || currentYear === null) return null;
  var v = displaced[iso][currentYear];
  return (v === undefined || v === null) ? null : v;
}

function restyleMap() {
  if (!geoLayer) return;
  geoLayer.setStyle(function(f) {
    var dv = yearValue(f.id);
    return {
      color: "#ffffff",
      weight: 0.8,
      fillColor: shadeColor(dv),
      fillOpacity: 0.92
    };
  });
}

/* ---------- dropdowns ---------- */
function buildDropdowns() {
  var regions = {};
  var iso;
  for (iso in countriesMeta) regions[countriesMeta[iso].region] = true;

  var yearSel = document.getElementById("yearSelect");
  yearSel.innerHTML = "";
  availableYears.slice().sort(function(a, b) { return b - a; }).forEach(function(y) {
    var o = document.createElement("option");
    o.value = y;
    o.textContent = y;
    yearSel.appendChild(o);
  });
  if (currentYear !== null) yearSel.value = currentYear;
  yearSel.addEventListener("change", function() {
    currentYear = parseInt(this.value, 10);
    onYearChange();
  });

  var sel = document.getElementById("regionSelect");
  Object.keys(regions).sort().forEach(function(rn) {
    var o = document.createElement("option");
    o.value = rn;
    o.textContent = rn;
    sel.appendChild(o);
  });

  sel.addEventListener("change", onRegionChange);
  document.getElementById("countrySelect").addEventListener("change", function() {
    selectCountry(this.value);
  });
}

function onYearChange() {
  document.getElementById("mapTitle").textContent =
    "People newly displaced by disasters (" + currentYear + ")";
  restyleMap();
  renderTotals();
  if (selected) selectCountry(selected);
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
    o.value = i2;
    o.textContent = countriesMeta[i2].name;
    cs.appendChild(o);
  });
}

/* ---------- selection ---------- */
function selectCountry(iso) {
  if (!iso || !countriesMeta[iso]) return;
  selected = iso;
  document.getElementById("regionSelect").value = countriesMeta[iso].region;
  onRegionChange();
  document.getElementById("countrySelect").value = iso;

  document.getElementById("countryPanel").style.display = "none";
  document.getElementById("chartWrap").style.display = "block";

  var dv = yearValue(iso);
  var exp = latest(climateExposure[iso]);
  var ref = latest(refugeeByOrigin[iso]);

  document.getElementById("countryName").textContent = countriesMeta[iso].name;
  document.getElementById("countryYear").textContent =
    "Selected year: " + currentYear + " · World Bank";

  var ratioEl = document.getElementById("ratioLine");
  if (dv !== null && dv !== undefined) {
    ratioEl.innerHTML =
      'In <b>' + currentYear + '</b>, disasters forced about <b>' +
      fmtNum(dv) + ' people</b> to leave their homes in ' +
      countriesMeta[iso].name + '.';
  } else {
    ratioEl.innerHTML = 'No disaster-displacement figure for ' + currentYear + ' is reported for ' + countriesMeta[iso].name + '.';
  }

  renderChart(iso);
  renderTakeaways(iso, dv, exp, ref);
  highlightSelected();
}

function highlightSelected() {
  if (!geoLayer) return;
  geoLayer.eachLayer(function(layer) {
    var isSel = (layer.feature.id === selected);
    layer.setStyle({
      weight: isSel ? 2.2 : 0.8,
      color: isSel ? "#009edb" : "#ffffff",
      fillOpacity: isSel ? 1 : 0.92
    });
    if (isSel) {
      map.flyToBounds(layer.getBounds(), { padding: [50, 50], duration: 0.8 });
    }
  });
}

/* ---------- chart + auto-generated takeaways ---------- */
function renderChart(iso) {
  if (chart) chart.destroy();

  var years = [];
  if (displaced[iso]) {
    years = Object.keys(displaced[iso]).map(Number).sort(function(a, b) { return a - b; });
  }
  if (!years.length) years = [];

  var vals = years.map(function(y) {
    return displaced[iso][y] ? Math.round(displaced[iso][y] / 1e3) / 1e3 : 0; /* in millions */
  });

  /* highlight the selected year's bar */
  var colors = years.map(function(y) {
    return (currentYear !== null && y === currentYear) ? "#dc6b5a" : "#eebfb1";
  });
  var widths = years.map(function(y) {
    return (currentYear !== null && y === currentYear) ? 2 : 0;
  });

  chart = new Chart(document.getElementById("countryChart"), {
    type: "bar",
    data: {
      labels: years,
      datasets: [
        {
          type: "bar",
          label: "Newly displaced (millions)",
          data: vals,
          backgroundColor: colors,
          borderColor: colors,
          borderWidth: widths,
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
              return " " + fmtNum(ctx.raw * 1e6) + " people displaced in " + years[ctx.dataIndex];
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: "#8895a4" }, grid: { display: false } },
        y: {
          beginAtZero: true,
          title: { display: true, text: "millions of people", color: "#8895a4", font: { size: 11 } },
          ticks: { color: "#8895a4" },
          grid: { color: "#eef1f4" }
        }
      }
    }
  });
}

function renderTakeaways(iso, dv, exp, ref) {
  var items = [];
  var name = countriesMeta[iso].name;

  if (dv !== null && dv !== undefined) {
    items.push("In " + currentYear + ", about <b>" + fmtNum(dv) + " people</b> were newly displaced by disasters in " + name + ".");

    if (displaced[iso]) {
      var ys = Object.keys(displaced[iso]).map(Number);
      if (ys.length) {
        var peakY = ys[0], peakV = displaced[iso][ys[0]];
        for (var i = 1; i < ys.length; i++) {
          if (displaced[iso][ys[i]] > peakV) { peakV = displaced[iso][ys[i]]; peakY = ys[i]; }
        }
        if (peakY !== currentYear) {
          items.push("Its worst year on record was <b>" + peakY + "</b>, with <b>" + fmtNum(peakV) + " people</b> displaced at once.");
        } else {
          items.push("This was its <b>peak year</b> in the " + availableYears[0] + "&ndash;" + latestYear + " record.");
        }
      }
    }
  } else {
    items.push("No disaster-displacement figure for " + currentYear + " is reported for " + name + ".");
  }

  if (exp.value !== null) {
    items.push("Climate context: on average, <b>" + exp.value.toFixed(1) + "% of the population</b> is exposed to droughts, floods or extreme heat &mdash; so the risk of more displacement is high.");
  }

  if (ref && ref.value !== null) {
    items.push("Beyond internal movement, about <b>" + fmtNum(ref.value) + " refugees</b> from " + name + " live abroad (UNHCR, " + ref.year + ").");
  }

  var ul = document.getElementById("takeaways");
  ul.innerHTML = "";
  for (var n = 0; n < items.length; n++) {
    var li = document.createElement("li");
    li.innerHTML = items[n];
    ul.appendChild(li);
  }
}

/* ---------- world totals for masthead ---------- */
function renderTotals() {
  var w = displaced["WLD"] || {};
  var val = currentYear !== null ? w[currentYear] : undefined;
  document.getElementById("totalDisplaced").innerHTML =
    fmtNum(val !== undefined ? val : null) + "<small>" + (currentYear || "") + "</small>";

  var cum = 0;
  for (var y = 0; y < availableYears.length; y++) {
    if (availableYears[y] <= currentYear && w[availableYears[y]]) cum += w[availableYears[y]];
  }
  document.getElementById("totalCumulative").innerHTML =
    fmtNum(cum) + "<small>2008–" + (currentYear || "") + "</small>";

  var affected = 0;
  var iso;
  for (iso in countriesMeta) {
    var v = displaced[iso] ? displaced[iso][currentYear] : undefined;
    if (v !== undefined && v !== null && v > 0) affected++;
  }
  document.getElementById("totalCountries").innerHTML =
    affected + "<small>of " + Object.keys(countriesMeta).length + "</small>";
}

/* ---------- go ---------- */
document.addEventListener("DOMContentLoaded", function() {
  loadAll().catch(function(err) {
    console.error(err);
    document.getElementById("status").textContent =
      "ERROR: " + err.message + ": see Console (F12)";
  });
    });
