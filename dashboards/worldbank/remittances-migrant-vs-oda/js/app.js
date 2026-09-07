/* Dashboard application logic: extracted from inline script */
"use strict";

/* ---------- state ---------- */
var countriesMeta = {};
var remitUSD = {};
var remitPct = {};
var odaUSD = {};
var geoLayer = null;
var chart = null;
var selected = null;
var map = null;

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

/* ---------- sequential loading ---------- */
async function loadAll() {
  var YEARS = "2018:2023";
  var BASE = "https://api.worldbank.org/v2/country/all/indicator/";

  setStatus("Step 1/5: loading remittances ($)");
  remitUSD = reshape((await fetchJSON(BASE + "BX.TRF.PWKR.CD?format=json&date=" + YEARS + "&per_page=20000"))[1] || []);

  setStatus("Step 2/5: loading remittances (% of GDP)");
  remitPct = reshape((await fetchJSON(BASE + "BX.TRF.PWKR.DT.GD.ZS?format=json&date=" + YEARS + "&per_page=20000"))[1] || []);

  setStatus("Step 3/5: loading ODA");
  odaUSD = reshape((await fetchJSON(BASE + "DT.ODA.ODAT.CD?format=json&date=" + YEARS + "&per_page=20000"))[1] || []);

  setStatus("Step 4/5: loading country metadata");
  var crows = (await fetchJSON("https://api.worldbank.org/v2/country?format=json&per_page=400"))[1] || [];
  for (var i = 0; i < crows.length; i++) {
    var r = crows[i];
    if (!r.id || r.region.value === "Aggregates") continue;
    countriesMeta[r.id] = { name: r.name, region: r.region.value.trim() };
  }

  setStatus("Step 5/5: loading map boundaries");
  var geo = await fetchJSON("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json");

  console.log("DATA CHECK: remitUSD:", Object.keys(remitUSD).length,
              "| remitPct:", Object.keys(remitPct).length,
              "| odaUSD:", Object.keys(odaUSD).length,
              "| meta:", Object.keys(countriesMeta).length);

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
function shadeColor(pct) {
  if (pct === null || pct === undefined) return "#d5dbe0";
  if (pct > 25) return "#05543e";
  if (pct > 15) return "#0d6b63";
  if (pct > 10) return "#149584";
  if (pct > 5)  return "#3cb8a5";
  if (pct > 2)  return "#7fd4c6";
  return "#c8ece4";
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
      "<b>Share of GDP</b><br>" +
      row("over 25%", "#05543e") +
      row("15–25%", "#0d6b63") +
      row("10–15%", "#149584") +
      row("5–10%", "#3cb8a5") +
      row("2–5%", "#7fd4c6") +
      row("under 2%", "#c8ece4") +
      row("no data", "#d5dbe0");
    return div;
  };
  legend.addTo(map);

  geoLayer = L.geoJSON(geo, {
    filter: function(f) {
      return !!countriesMeta[f.id];
    },
    style: function(f) {
      return {
        color: "#ffffff",
        weight: 0.8,
        fillColor: shadeColor(latest(remitPct[f.id]).value),
        fillOpacity: 0.92
      };
    },
    onEachFeature: function(f, layer) {
      var m = countriesMeta[f.id];
      if (!m) return;
      layer.bindTooltip(m.name, { sticky: true });
      layer.on("click", function() { selectCountry(f.id); });
    }
  }).addTo(map);
}

/* ---------- dropdowns ---------- */
function buildDropdowns() {
  var regions = {};
  var iso;
  for (iso in countriesMeta) regions[countriesMeta[iso].region] = true;

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

  var r = latest(remitUSD[iso]);
  var o = latest(odaUSD[iso]);
  var p = latest(remitPct[iso]);

  document.getElementById("countryName").textContent = countriesMeta[iso].name;
  document.getElementById("countryYear").textContent =
    "Latest reported year: " + (r.year || "—") + " · World Bank";

  var ratioEl = document.getElementById("ratioLine");
  var ratio = (r.value && o.value) ? r.value / o.value : null;
  if (ratio !== null) {
    ratioEl.innerHTML =
      'Migrant workers send home <b>' + ratio.toFixed(1) + '&times;</b> ' +
      'what the country receives in official development assistance.';
  } else if (r.value && p.value) {
    ratioEl.innerHTML =
      'Remittances equal about <b>' + p.value.toFixed(1) + '% of GDP</b>; ' +
      'no comparable ODA figure available.';
  } else {
    ratioEl.innerHTML = 'Insufficient recent data for this country.';
  }

  renderChart(iso, r.year);
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
function renderChart(iso, latestYear) {
  if (chart) chart.destroy();

  var years = [2018, 2019, 2020, 2021, 2022, 2023];
  var rs = [], os = [];
  years.forEach(function(y) {
    rs.push(remitUSD[iso] && remitUSD[iso][y] ? +(remitUSD[iso][y] / 1e9).toFixed(2) : null);
    os.push(odaUSD[iso] && odaUSD[iso][y] ? +(odaUSD[iso][y] / 1e9).toFixed(2) : null);
  });

  chart = new Chart(document.getElementById("countryChart"), {
    type: "bar",
    data: {
      labels: years,
      datasets: [
        {
          type: "line",
          label: "Remittances ($B)",
          data: rs,
          borderColor: "#009edb",
          backgroundColor: "rgba(0,158,219,.12)",
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: "#009edb"
        },
        {
          type: "line",
          label: "ODA ($B)",
          data: os,
          borderColor: "#dc6b5a",
          backgroundColor: "rgba(220,107,90,.10)",
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: "#dc6b5a"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#4a5568", boxWidth: 14 } }
      },
      scales: {
        x: { ticks: { color: "#8895a4" }, grid: { display: false } },
        y: {
          beginAtZero: true,
          title: { display: true, text: "US$ billion", color: "#8895a4", font: { size: 11 } },
          ticks: { color: "#8895a4" },
          grid: { color: "#eef1f4" }
        }
      }
    }
  });

  /* takeaways computed from the actual data */
  var items = [];

  var knownYears = [];
  for (var i = 0; i < rs.length; i++) {
    if (rs[i] !== null) knownYears.push(years[i]);
  }

  if (knownYears.length >= 2 && remitUSD[iso][knownYears[0]] > 0) {
    var yA = knownYears[0];
    var yB = knownYears[knownYears.length - 1];
    var vA = remitUSD[iso][yA];
    var vB = remitUSD[iso][yB];
    var pctChange = ((vB - vA) / vA) * 100;

    if (pctChange >= 0) {
      items.push("Remittances <b>grew about " + pctChange.toFixed(0) +
        "%</b> between " + yA + " and " + yB +
        ", rising from " + (vA / 1e9).toFixed(1) + "B to " + (vB / 1e9).toFixed(1) + "B.");
    } else {
      items.push("Remittances <b>fell about " + Math.abs(pctChange).toFixed(0) +
        "%</b> between " + yA + " and " + yB + ".");
    }
  } else {
    items.push("Not enough recent years of remittance data to describe a trend.");
  }

  var pctVal = latest(remitPct[iso]).value;
  if (pctVal !== null) {
    items.push("In " + latestYear + ", remittances equalled about <b>" +
      pctVal.toFixed(1) + "% of GDP</b>.");
  }

  if (knownYears.length >= 2) {
    var overCount = 0;
    var comparedYears = 0;
    for (var j = 0; j < rs.length; j++) {
      if (rs[j] !== null && os[j] !== null) {
        comparedYears++;
        if (rs[j] > os[j]) overCount++;
      }
    }
    if (comparedYears > 0 && overCount === comparedYears) {
      items.push("Remittances exceeded ODA in <b>every year shown</b>.");
    } else if (overCount > 0) {
      items.push("Remittances exceeded ODA in <b>" + overCount + " of " +
        comparedYears + "</b> years shown.");
    }
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
function fmtMoney(v) {
  if (!v) return "—";
  return v >= 1e12
    ? "$" + (v / 1e12).toFixed(2) + "T"
    : "$" + Math.round(v / 1e9) + "B";
}

function worldTotal(dataObj) {
  /* Preferred: WB's own "World" aggregate */
  if (dataObj["WLD"] && Object.keys(dataObj["WLD"]).length) {
    return latest(dataObj["WLD"]);
  }
  /* Fallback: sum member countries per year */
  var sums = {};
  for (var y = 2018; y <= 2023; y++) {
    var s = 0, n = 0;
    for (var iso in countriesMeta) {
      if (dataObj[iso] && dataObj[iso][y]) { s += dataObj[iso][y]; n++; }
    }
    if (n >= 100) sums[y] = s;
  }
  return latest(sums);
}

function renderTotals() {
  var wr = worldTotal(remitUSD);
  var wo = worldTotal(odaUSD);

  document.getElementById("totalRemit").innerHTML =
    fmtMoney(wr.value) + "<small>" + (wr.year || "") + "</small>";
  document.getElementById("totalODA").innerHTML =
    fmtMoney(wo.value) + "<small>" + (wo.year || "") + "</small>";

  var rr = document.getElementById("totalRatio");
  if (wr.value && wo.value) {
    rr.innerHTML =
      "&#8776; " + (wr.value / wo.value).toFixed(1) + "&times;<small>more than aid</small>";
  }
}

/* ---------- go ---------- */
document.addEventListener("DOMContentLoaded", function() {
  loadAll().catch(function(err) {
    console.error(err);
    document.getElementById("status").textContent =
      "ERROR: " + err.message + ": see Console (F12)";
  });
    });
