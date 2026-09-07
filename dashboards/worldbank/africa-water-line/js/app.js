"use strict";

/* ============================================================
   The Water Line Is Moving: Africa's groundwater & urban collision
   Data: World Bank ER.H2O.INTR.PC, SP.URB.GROW, ER.H2O.FWTL.ZS
   Map boundaries: open world.geo.json dataset
   ============================================================ */

var countriesMeta = {};
var waterPC  = {};   /* iso3 -> {year: m3 per capita} */
var urbGrowth = {};  /* iso3 -> {year: % growth} */
var waterStress = {};/* iso3 -> {year: % of renewables withdrawn} */
var geoLayer = null;
var chart = null;
var ctxChart = null;
var selected = null;
var map = null;

/* ---------- helpers ---------- */
function setStatus(txt) {
  document.getElementById("status").textContent = txt;
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
    if (r.value === null || !r.countryiso3code) continue;
    if (!out[r.countryiso3code]) out[r.countryiso3code] = {};
    out[r.countryiso3code][parseInt(r.date, 10)] = r.value;
  }
  return out;
}

function isAfrican(regionName) {
  return regionName === "Sub-Saharan Africa" ||
         regionName === "Middle East, North Africa, Afghanistan & Pakistan";
}

/* MENA aggregate also covers Afghanistan & Pakistan; keep only African members */
var MENA_AFRICA = { DZA:1, EGY:1, LBY:1, MAR:1, TUN:1, ESH:1, DJI:1, SOM:1, SDN:1, SSD:1, MRT:1, IRN:0 };

function isAfricanCountry(iso) {
  var m = countriesMeta[iso];
  if (!m) return false;
  if (m.region === "Sub-Saharan Africa") return true;
  if (m.region === "Middle East, North Africa, Afghanistan & Pakistan") return !!MENA_AFRICA[iso];
  return false;
}

/* ---------- loading ---------- */
async function loadAll() {
  var YEARS = "2010:2022";
  var BASE = "https://api.worldbank.org/v2/country/all/indicator/";

  setStatus("Step 1/5: loading freshwater per capita");
  waterPC = reshape((await fetchJSON(
    BASE + "ER.H2O.INTR.PC?format=json&date=" + YEARS + "&per_page=20000"))[1] || []);

  setStatus("Step 2/5: loading urban population growth");
  urbGrowth = reshape((await fetchJSON(
    BASE + "SP.URB.GROW?format=json&date=" + YEARS + "&per_page=20000"))[1] || []);

  setStatus("Step 3/5: loading water stress");
  waterStress = reshape((await fetchJSON(
    BASE + "ER.H2O.FWTL.ZS?format=json&date=" + YEARS + "&per_page=20000"))[1] || []);

  setStatus("Step 4/5: loading country metadata");
  var crows = (await fetchJSON(
    "https://api.worldbank.org/v2/country?format=json&per_page=400"))[1] || [];
  for (var i = 0; i < crows.length; i++) {
    var r = crows[i];
    if (!r.id || r.region.value === "Aggregates") continue;
    countriesMeta[r.id] = { name: r.name, region: r.region.value.trim() };
  }

  setStatus("Step 5/5: loading map boundaries");
  var geo = await fetchJSON(
    "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json");

  console.log("WATER countries:", Object.keys(waterPC).length,
              "| URB countries:", Object.keys(urbGrowth).length,
              "| STRESS countries:", Object.keys(waterStress).length);

  setStatus("");
  document.getElementById("status").style.display = "none";
  document.getElementById("app").style.display = "block";

  initMap(geo);
  renderStats();
}

/* ---------- masthead stats ---------- */
function renderStats() {
  var worst = { iso: null, value: Infinity, year: null };
  var urbVals = [];
  var scarce = 0;

  for (var iso in countriesMeta) {
    if (!isAfricanCountry(iso)) continue;
    var w = latest(waterPC[iso]);
    if (w.value !== null) {
      if (w.value < worst.value) worst = { iso: iso, value: w.value, year: w.year };
      if (w.value < 1000) scarce++;
    }
    var u = latest(urbGrowth[iso]);
    if (u.value !== null) urbVals.push(u.value);
  }

  var scarceEl = document.getElementById("statScarce");
  scarceEl.innerHTML = scarce + "<small>countries &lt; 1,000 m&sup3;</small>";

  var wEl = document.getElementById("statWorst");
  if (worst.iso) {
    wEl.innerHTML = countriesMeta[worst.iso].name.split(",")[0] +
      "<small>" + Math.round(worst.value) + " m&sup3;</small>";
  }

  if (urbVals.length) {
    var avg = urbVals.reduce(function(a, b) { return a + b; }, 0) / urbVals.length;
    document.getElementById("statUrb").innerHTML =
      "+" + avg.toFixed(1) + "%/yr<small>still growing</small>";
  }
}

/* ---------- choropleth ---------- */
function waterColor(v) {
  if (v === null || v === undefined) return "#d5dbe0";
  if (v < 500)   return "#b91c1c";   /* absolute scarcity */
  if (v < 1000)  return "#dc2626";   /* scarcity */
  if (v < 1700)  return "#ea9a3e";   /* stress */
  if (v < 4000)  return "#7cb3d6";   /* adequate */
  return "#1d4ed8";                  /* abundant */
}

function initMap(geo) {
  map = L.map("map", { zoomSnap: 0.5 }).setView([2, 20], 3);

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
      "<b>Freshwater per person (m&sup3;/yr)</b><br>" +
      row("under 500: absolute scarcity", "#b91c1c") +
      row("500\u20131,000: scarcity", "#dc2626") +
      row("1,000\u20131,700: stress", "#ea9a3e") +
      row("1,700\u20134,000: adequate", "#7cb3d6") +
      row("over 4,000: abundant", "#1d4ed8") +
      row("no data", "#d5dbe0");
    return div;
  };
  legend.addTo(map);

  geoLayer = L.geoJSON(geo, {
    filter: function(f) {
      return isAfricanCountry(f.id);
    },
    style: function(f) {
      return {
        color: "#1a202c",
        weight: 0.8,
        fillColor: waterColor(latest(waterPC[f.id]).value),
        fillOpacity: 0.9
      };
    },
    onEachFeature: function(f, layer) {
      var m = countriesMeta[f.id];
      if (!m) return;
      var w = latest(waterPC[f.id]);
      var s = latest(waterStress[f.id]);
      var tip = "<b>" + m.name + "</b><br>";
      if (w.value !== null) tip += Math.round(w.value) + " m&sup3; water/person/yr";
      if (s.value !== null) tip += "<br>Water stress: " + s.value.toFixed(0) + "% of renewables";
      layer.bindTooltip(tip, { sticky: true });
      layer.on("click", function() { selectCountry(f.id); });
    }
  }).addTo(map);
}

/* ---------- selection ---------- */
function selectCountry(iso) {
  if (!iso || !countriesMeta[iso]) return;
  selected = iso;

  document.getElementById("countryPanel").style.display = "none";
  document.getElementById("chartWrap").style.display = "block";

  var w = latest(waterPC[iso]);
  var u = latest(urbGrowth[iso]);
  var s = latest(waterStress[iso]);

  document.getElementById("countryName").textContent = countriesMeta[iso].name;
  document.getElementById("countryYear").textContent =
    "Latest reported year: " + (w.year || u.year || "\u2014") + " \u00b7 World Bank / FAO";

  var callout = document.getElementById("countryCallout");
  callout.className = "callout";
  if (w.value !== null) {
    if (w.value < 500) {
      callout.className = "callout danger";
      callout.innerHTML = "<b>" + Math.round(w.value) + " m&sup3;</b> per person per year: " +
        "absolute water scarcity, with cities still growing.";
    } else if (w.value < 1000) {
      callout.className = "callout danger";
      callout.innerHTML = "<b>" + Math.round(w.value) + " m&sup3;</b> per person per year: " +
        "below the international scarcity threshold.";
    } else {
      callout.innerHTML = "<b>" + Math.round(w.value) + " m&sup3;</b> per person per year " +
        "of renewable freshwater.";
    }
  } else {
    callout.innerHTML = "No recent freshwater data for this country.";
  }

  renderCharts(iso);
  highlightSelected();
}

function highlightSelected() {
  if (!geoLayer) return;
  geoLayer.eachLayer(function(layer) {
    var isSel = (layer.feature.id === selected);
    layer.setStyle({
      weight: isSel ? 2.2 : 0.8,
      color: isSel ? "#ffd166" : "#1a202c",
      fillOpacity: isSel ? 1 : 0.9
    });
    if (isSel) {
      map.flyToBounds(layer.getBounds(), { padding: [50, 50], duration: 0.8 });
    }
  });
}

/* ---------- charts ---------- */
function renderCharts(iso) {
  if (chart) chart.destroy();
  if (ctxChart) ctxChart.destroy();

  var years = [];
  for (var y = 2010; y <= 2022; y++) years.push(y);

  var waterSeries = years.map(function(y) {
    return (waterPC[iso] && waterPC[iso][y] !== undefined)
      ? Math.round(waterPC[iso][y]) : null;
  });
  var urbSeries = years.map(function(y) {
    return (urbGrowth[iso] && urbGrowth[iso][y] !== undefined)
      ? +urbGrowth[iso][y].toFixed(2) : null;
  });

  chart = new Chart(document.getElementById("countryChart"), {
    type: "bar",
    data: {
      labels: years,
      datasets: [
        {
          type: "line",
          label: "Freshwater per person (m\u00b3)",
          data: waterSeries,
          borderColor: "#0369a1",
          backgroundColor: "rgba(3,105,161,.12)",
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 2,
          pointBackgroundColor: "#0369a1",
          yAxisID: "y"
        },
        {
          type: "bar",
          label: "Urban growth (%/yr)",
          data: urbSeries,
          backgroundColor: "rgba(185,28,28,.55)",
          borderColor: "#b91c1c",
          borderWidth: 1,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#4a5568", boxWidth: 14 } } },
      scales: {
        x: { ticks: { color: "#8895a4", maxTicksLimit: 7 }, grid: { display: false } },
        y: {
          beginAtZero: true,
          position: "left",
          title: { display: true, text: "m\u00b3 per person", color: "#0369a1", font: { size: 11 } },
          ticks: { color: "#0369a1" },
          grid: { color: "#eef1f4" }
        },
        y1: {
          beginAtZero: true,
          position: "right",
          title: { display: true, text: "urban %/yr", color: "#b91c1c", font: { size: 11 } },
          ticks: { color: "#b91c1c" },
          grid: { display: false }
        }
      }
    }
  });

  /* context bars: urban growth vs water stress for peer countries */
  var peers = ["EGY", "NGA", "ETH", "KEN", "ZAF", "MAR", "NER", "SDN"];
  var peerNames = [];
  var peerGrow = [];
  var peerStress = [];
  peers.forEach(function(p) {
    if (!countriesMeta[p]) return;
    var u = latest(urbGrowth[p]);
    var s = latest(waterStress[p]);
    peerNames.push(countriesMeta[p].name.split(",")[0]);
    peerGrow.push(u.value !== null ? +u.value.toFixed(2) : null);
    peerStress.push(s.value !== null ? +s.value.toFixed(1) : null);
  });

  ctxChart = new Chart(document.getElementById("contextChart"), {
    type: "bar",
    data: {
      labels: peerNames,
      datasets: [
        {
          label: "Urban growth %/yr",
          data: peerGrow,
          backgroundColor: "rgba(185,28,28,.55)",
          borderColor: "#b91c1c",
          borderWidth: 1
        },
        {
          label: "Water stress % of renewables",
          data: peerStress,
          backgroundColor: "rgba(3,105,161,.55)",
          borderColor: "#0369a1",
          borderWidth: 1
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#4a5568", boxWidth: 14 } } },
      scales: {
        x: { beginAtZero: true, ticks: { color: "#8895a4" }, grid: { color: "#eef1f4" } },
        y: { ticks: { color: "#4a5568", font: { size: 11 } }, grid: { display: false } }
      }
    }
  });

  /* takeaways computed live */
  var items = [];
  var w = latest(waterPC[iso]);
  var u = latest(urbGrowth[iso]);
  var s = latest(waterStress[iso]);

  if (w.value !== null && w.value < 1000) {
    items.push("Water availability is <b>below the 1,000 m\u00b3 scarcity line</b>: every new resident deepens the deficit.");
  }
  if (u.value !== null && u.value > 3) {
    items.push("Cities are growing at <b>" + u.value.toFixed(1) + "% per year</b>: roughly doubling demand pressure in a generation.");
  }
  if (s.value !== null) {
    if (s.value > 70) {
      items.push("Water stress is <b>" + s.value.toFixed(0) + "%</b>, beyond the critical threshold. There is no spare water.");
    } else if (s.value > 25) {
      items.push("Water stress is <b>" + s.value.toFixed(0) + "%</b> of renewable supply, in the internationally recognised high zone.");
    }
  }
  items.push("Blue is how much water is left. Red is how fast the people are arriving. The lines cross.");

  var ul = document.getElementById("takeaways");
  ul.innerHTML = "";
  items.forEach(function(txt) {
    var li = document.createElement("li");
    li.innerHTML = txt;
    ul.appendChild(li);
  });
}

/* ---------- go ---------- */
loadAll().catch(function(err) {
  console.error(err);
  document.getElementById("status").textContent =
    "ERROR: " + err.message + " \u2014 see Console (F12)";
});
