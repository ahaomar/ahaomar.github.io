"use strict";

var YEARS = [];
var DISASTER_YEARS = [];
var countriesMeta = {};
var byOrigin = {};
var displaced = {};
var selected = null;
var currentYear = 2015;
var playing = false;
var playTimer = null;
var globalChart = null;
var countryChart = null;

var AGGREGATES = {
  AFE: 1, AFW: 1, ARB: 1, CSS: 1, EAP: 1, EAR: 1, EAS: 1, ECA: 1, ECS: 1,
  HIC: 1, HPC: 1, IBD: 1, IBT: 1, IDA: 1, IDB: 1, IDX: 1, LAC: 1, LCN: 1,
  LIC: 1, LMC: 1, MEA: 1, MIC: 1, MNA: 1, NAC: 1, OSS: 1, PRE: 1, PST: 1,
  PSS: 1, SAS: 1, SSA: 1, SSF: 1, SST: 1, TEA: 1, TEC: 1, TLA: 1, TMN: 1,
  TSA: 1, TSS: 1, UMC: 1, WLD: 1, EAP: 1, LTE: 1, LDC: 1, FCS: 1, INX: 1
};

function setStatus(txt) {
  var el = document.getElementById("status");
  if (el) el.textContent = txt;
}

function fmtNum(v) {
  if (v === null || v === undefined || !isFinite(v)) return "\u2014";
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return Math.round(v / 1e3) + "K";
  return String(Math.round(v));
}

function fmtFull(v) {
  if (v === null || v === undefined || !isFinite(v)) return "\u2014";
  return Math.round(v).toLocaleString("en-US");
}

function fmtPct(v) {
  if (v === null || v === undefined || !isFinite(v)) return "\u2014";
  return (v >= 0 ? "+" : "") + v.toFixed(0) + "%";
}

function at(obj, year) {
  if (!obj) return null;
  return (obj[year] !== undefined && obj[year] !== null) ? obj[year] : null;
}

async function fetchJSON(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

async function fetchFirstWorking(urls) {
  var lastErr = null;
  for (var i = 0; i < urls.length; i++) {
    try {
      return await fetchJSON(urls[i]);
    } catch (e) {
      lastErr = e;
      console.warn("Fetch failed, trying next URL:", urls[i], e.message);
    }
  }
  throw lastErr || new Error("All source URLs failed");
}

function buildYearRange() {
  for (var y = 2015; y <= 2024; y++) YEARS.push(y);
  for (var d = 2015; d <= 2023; d++) DISASTER_YEARS.push(d);
}

async function loadAll() {
  buildYearRange();

  setStatus("Step 1/4: loading country list from UNHCR\u2026");
  var crows = (await fetchFirstWorking([
    "https://api.unhcr.org/population/v1/countries/?output_format=JSON&limit=400"
  ])).items || [];

  var isoList = [];
  for (var c = 0; c < crows.length; c++) {
    var co = crows[c];
    if (!co.iso || co.iso === "-") continue;
    countriesMeta[co.iso] = {
      name: co.nameShort || co.name,
      region: co.majorArea || "Other"
    };
    isoList.push(co.iso);
  }
  if (isoList.length < 100) throw new Error("Too few countries from UNHCR: " + isoList.length);

  setStatus("Step 2/4: loading refugees by country of origin\u2026");
  byOrigin = {};
  for (var b = 0; b < isoList.length; b += 120) {
    var batch = isoList.slice(b, b + 120).join(",");
    var d1 = await fetchFirstWorking([
      "https://api.unhcr.org/population/v1/population/?yearFrom=2015&yearTo=2024&limit=20000&output_format=JSON&coo=" + batch
    ]);
    var items1 = d1.items || [];
    for (var i = 0; i < items1.length; i++) {
      var it = items1[i];
      if (!it.coo) continue;
      var v = Number(it.refugees);
      if (!isFinite(v) || v <= 0) continue;
      if (!byOrigin[it.coo]) byOrigin[it.coo] = {};
      byOrigin[it.coo][parseInt(it.year, 10)] = v;
    }
  }

  setStatus("Step 3/4: loading disaster displacement from the World Bank\u2026");
  displaced = {};
  var dData = await fetchFirstWorking([
    "https://api.worldbank.org/v2/country/all/indicator/VC.IDP.NWDS?format=json&date=2015:2023&per_page=20000"
  ]);
  var rows = dData[1] || [];
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var iso = row.countryiso3code;
    if (!iso || !countriesMeta[iso] || AGGREGATES[iso]) continue;
    if (row.value === null || row.value === undefined) continue;
    if (!displaced[iso]) displaced[iso] = {};
    displaced[iso][parseInt(row.date, 10)] = Number(row.value);
  }

  setStatus("Step 4/4: rendering\u2026");

  var originCount = Object.keys(byOrigin).length;
  var displacedCount = Object.keys(displaced).length;
  if (!originCount || !displacedCount) {
    throw new Error("Empty series: origins " + originCount + ", displaced " + displacedCount);
  }
  console.log("DATA CHECK: origins", originCount, "| displaced", displacedCount, "| meta", Object.keys(countriesMeta).length);

  setStatus("");
  document.getElementById("status").style.display = "none";
  document.getElementById("app").style.display = "block";

  buildDropdowns();
  renderHeaderStats();
  renderGlobalChart(currentYear);
  onYearChange(YEARS[0]);
}

/* ---------- global aggregates ---------- */
function globalRefugees(year) {
  var total = 0;
  var iso;
  for (iso in byOrigin) total += at(byOrigin[iso], year) || 0;
  return total;
}

function globalDisplaced(year) {
  var total = 0;
  var iso;
  for (iso in displaced) total += at(displaced[iso], year) || 0;
  return total;
}

function peakDisasterYear() {
  var best = null, bestV = -1;
  for (var i = 0; i < DISASTER_YEARS.length; i++) {
    var v = globalDisplaced(DISASTER_YEARS[i]);
    if (v > bestV) { bestV = v; best = DISASTER_YEARS[i]; }
  }
  return { year: best, value: bestV };
}

function reportingCountries(year) {
  var n = 0;
  for (var iso in displaced) if (at(displaced[iso], year)) n++;
  return n;
}

function renderHeaderStats() {
  var first = YEARS[0];
  var last = YEARS[YEARS.length - 1];
  var peak = peakDisasterYear();

  document.getElementById("stat2015").innerHTML =
    fmtNum(globalRefugees(first)) + "<small>" + first + "</small>";
  document.getElementById("stat2024").innerHTML =
    fmtNum(globalRefugees(last)) + "<small>" + last + "</small>";
  document.getElementById("statDisaster").innerHTML =
    fmtNum(peak.value) + "<small>" + peak.year + "</small>";
  document.getElementById("statCountries").innerHTML =
    Object.keys(countriesMeta).length + "<small>origin countries</small>";

  document.getElementById("worldNote").textContent =
    "Refugees 2015\u20132024 \u00B7 disaster displacement 2015\u20132023";
  document.getElementById("countNote").textContent =
    Object.keys(countriesMeta).length + " countries available";
}

function renderGlobalChart(highlightYear) {
  var refs = YEARS.map(function (y) { return globalRefugees(y); });
  var dis = YEARS.map(function (y) {
    return DISASTER_YEARS.indexOf(y) === -1 ? null : globalDisplaced(y);
  });
  var idx = YEARS.indexOf(highlightYear);

  if (globalChart) globalChart.destroy();

  globalChart = new Chart(document.getElementById("globalChart"), {
    type: "line",
    data: {
      labels: YEARS,
      datasets: [
        {
          label: "New disaster displacement",
          data: dis,
          borderColor: "#dc6b5a",
          backgroundColor: "rgba(220,107,90,.12)",
          fill: true, tension: 0.3, borderWidth: 2.5, spanGaps: false,
          pointRadius: function (ctx) { return ctx.dataIndex === idx ? 5 : 2; },
          pointBackgroundColor: "#dc6b5a",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 1.5
        },
        {
          label: "Refugees by origin",
          data: refs,
          borderColor: "#009edb",
          backgroundColor: "rgba(0,158,219,.10)",
          fill: true, tension: 0.3, borderWidth: 2.5,
          pointRadius: function (ctx) { return ctx.dataIndex === idx ? 5 : 2; },
          pointBackgroundColor: "#009edb",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 1.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      onClick: function (evt, els) {
        if (!els || !els.length) return;
        stopPlay();
        onYearChange(YEARS[els[0].index]);
      },
      plugins: {
        legend: { labels: { color: "#4a5568", boxWidth: 14 } },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              var v = ctx.parsed.y;
              return ctx.dataset.label + ": " + (v === null ? "not reported" : fmtFull(v));
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: "#8895a4", maxRotation: 0 }, grid: { display: false } },
        y: {
          beginAtZero: true,
          title: { display: true, text: "People", color: "#8895a4", font: { size: 11 } },
          ticks: { color: "#8895a4", callback: function (v) { return fmtNum(v); } },
          grid: { color: "#eef1f4" }
        }
      }
    }
  });
}

/* ---------- country lists ---------- */
function topCountriesFor(metric, year, limit, regionFilter) {
  var src = metric === "displaced" ? displaced : byOrigin;
  var rows = [];
  var iso;
  for (iso in src) {
    var meta = countriesMeta[iso];
    if (!meta) continue;
    if (regionFilter && meta.region !== regionFilter) continue;
    var v = at(src[iso], year);
    if (!v) continue;
    rows.push({ iso: iso, v: v });
  }
  rows.sort(function (a, b) { return b.v - a.v; });
  return rows.slice(0, limit);
}

function renderTopList(year) {
  var region = document.getElementById("regionSelect").value || "";
  var rows = topCountriesFor("displaced", year, 8, region);
  var max = rows.length ? rows[0].v : 0;

  document.getElementById("topListTitle").textContent =
    "Most disaster displacement in " + year + (region ? " \u00B7 " + region : "");

  var host = document.getElementById("topList");
  host.innerHTML = "";

  if (!rows.length) {
    host.innerHTML = '<div class="empty-note">No disaster displacement reported for this selection.</div>';
    return;
  }

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var div = document.createElement("div");
    div.className = "top-row" + (r.iso === selected ? " is-selected" : "");
    div.setAttribute("data-iso", r.iso);
    div.innerHTML =
      '<span class="r-name">' + countriesMeta[r.iso].name + '</span>' +
      '<span class="r-bar is-coral"><i style="width:' + (max ? (r.v / max) * 100 : 0) + '%"></i></span>' +
      '<span class="r-val">' + fmtNum(r.v) + '</span>';
    div.addEventListener("click", function () {
      selectCountry(this.getAttribute("data-iso"));
    });
    host.appendChild(div);
  }
}

/* ---------- dropdowns ---------- */
function buildDropdowns() {
  var regions = {};
  var iso;
  for (iso in countriesMeta) regions[countriesMeta[iso].region] = true;

  var sel = document.getElementById("regionSelect");
  Object.keys(regions).sort().forEach(function (rn) {
    if (!rn) return;
    var o = document.createElement("option");
    o.value = rn;
    o.textContent = rn;
    sel.appendChild(o);
  });

  sel.addEventListener("change", onRegionChange);
  document.getElementById("countrySelect").addEventListener("change", function () {
    if (this.value) selectCountry(this.value);
  });
}

function onRegionChange() {
  var region = document.getElementById("regionSelect").value;
  var cs = document.getElementById("countrySelect");
  cs.innerHTML = '<option value="">Select a country</option>';
  cs.disabled = !region;

  if (region) {
    var list = [];
    var iso;
    for (iso in countriesMeta) {
      if (countriesMeta[iso].region === region) list.push(iso);
    }
    list.sort(function (a, b) {
      return countriesMeta[a].name.localeCompare(countriesMeta[b].name);
    });
    list.forEach(function (i2) {
      var o = document.createElement("option");
      o.value = i2;
      o.textContent = countriesMeta[i2].name;
      cs.appendChild(o);
    });
  }

  renderTopList(currentYear);
  if (selected) renderPeers(currentYear);
}

/* ---------- selection ---------- */
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

  refreshCountryDetail();
  renderTopList(currentYear);
}

function refreshCountryDetail() {
  if (!selected) return;
  var iso = selected;
  var name = countriesMeta[iso].name;

  document.getElementById("countryName").textContent = name;
  document.getElementById("countryYear").textContent =
    "Origin country \u00B7 " + countriesMeta[iso].region +
    " \u00B7 refugees 2015\u20132024, disaster displacement 2015\u20132023";

  var dNow = at(displaced[iso], currentYear);
  var rNow = at(byOrigin[iso], currentYear);

  var line = document.getElementById("countryRatio");
  if (dNow && rNow) {
    line.innerHTML = "In <b>" + currentYear + "</b>, " + name + " recorded <b>" + fmtFull(dNow) +
      "</b> new disaster displacements against <b>" + fmtFull(rNow) + "</b> refugees abroad.";
  } else if (dNow) {
    line.innerHTML = "In <b>" + currentYear + "</b>, " + name + " recorded <b>" + fmtFull(dNow) +
      "</b> new disaster displacements. No significant refugee outflow that year.";
  } else if (rNow) {
    line.innerHTML = "In <b>" + currentYear + "</b>, " + name + " had <b>" + fmtFull(rNow) +
      "</b> refugees abroad. No disaster displacement reported for the year.";
  } else {
    line.innerHTML = "No displacement of either kind reported for " + name + " in " + currentYear + ".";
  }

  renderCountryChart(iso);
  renderCountryTakeaways(iso);
  renderPeers(currentYear);
}

function renderCountryChart(iso) {
  var refs = YEARS.map(function (y) { return at(byOrigin[iso], y); });
  var dis = YEARS.map(function (y) {
    return DISASTER_YEARS.indexOf(y) === -1 ? null : at(displaced[iso], y);
  });

  if (countryChart) countryChart.destroy();

  countryChart = new Chart(document.getElementById("countryChart"), {
    type: "bar",
    data: {
      labels: YEARS,
      datasets: [
        {
          label: "Disaster displacement",
          data: dis,
          backgroundColor: "rgba(220,107,90,.70)",
          borderRadius: 3
        },
        {
          type: "line",
          label: "Refugees by origin",
          data: refs,
          borderColor: "#009edb",
          backgroundColor: "rgba(0,158,219,.10)",
          fill: false, tension: 0.3, borderWidth: 2.5, pointRadius: 3,
          pointBackgroundColor: "#009edb"
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
            label: function (ctx) {
              var v = ctx.parsed.y;
              return ctx.dataset.label + ": " + (v === null ? "not reported" : fmtFull(v));
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: "#8895a4" }, grid: { display: false } },
        y: {
          beginAtZero: true,
          title: { display: true, text: "People", color: "#8895a4", font: { size: 11 } },
          ticks: { color: "#8895a4", callback: function (v) { return fmtNum(v); } },
          grid: { color: "#eef1f4" }
        }
      }
    }
  });
}

function renderPeers(year) {
  if (!selected) return;
  var region = countriesMeta[selected].region;
  var rows = topCountriesFor("displaced", year, 6, region);
  var max = rows.length ? rows[0].v : 0;

  document.getElementById("countryPeersTitle").textContent =
    "Most disaster displacement in " + region + ", " + year;

  var host = document.getElementById("countryPeers");
  host.innerHTML = "";

  if (!rows.length) {
    host.innerHTML = '<div class="empty-note">No disaster displacement reported in this region for ' + year + '.</div>';
    return;
  }

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var div = document.createElement("div");
    div.className = "top-row" + (r.iso === selected ? " is-selected" : "");
    div.setAttribute("data-iso", r.iso);
    div.innerHTML =
      '<span class="r-name">' + countriesMeta[r.iso].name + '</span>' +
      '<span class="r-bar is-coral"><i style="width:' + (max ? (r.v / max) * 100 : 0) + '%"></i></span>' +
      '<span class="r-val">' + fmtNum(r.v) + '</span>';
    div.addEventListener("click", function () {
      selectCountry(this.getAttribute("data-iso"));
    });
    host.appendChild(div);
  }
}

/* ---------- global panel ---------- */
function renderGlobalPanel(year) {
  var rNow = globalRefugees(year);
  var dNow = DISASTER_YEARS.indexOf(year) === -1 ? null : globalDisplaced(year);
  var peak = peakDisasterYear();

  document.getElementById("panelYearTitle").textContent = String(year);
  document.getElementById("panelYearSub").textContent =
    "Global totals \u00B7 " + (dNow === null ? "disaster data not yet reported for this year" : "both series reported");

  document.getElementById("panelRefugees").textContent = fmtNum(rNow);
  document.getElementById("panelDisplaced").textContent = dNow === null ? "not reported" : fmtNum(dNow);

  var line = document.getElementById("ratioLine");
  if (dNow === null) {
    line.innerHTML = "The World Bank disaster displacement series runs to <b>2023</b>. " +
      "In " + year + ", refugees by origin stood at <b>" + fmtFull(rNow) + "</b>.";
  } else if (dNow > rNow) {
    line.innerHTML = "Disaster displacement is <b>" + (dNow / rNow).toFixed(1) +
      "&times;</b> the size of the refugee population, but most of it is <b>inside</b> borders, not across them.";
  } else {
    line.innerHTML = "Refugees abroad <b>" + fmtFull(rNow) + "</b> against <b>" +
      fmtFull(dNow) + "</b> newly displaced by disasters inside their own countries.";
  }

  renderTopList(year);
}

function renderGlobalTakeaways(year) {
  var items = [];
  var first = YEARS[0];
  var last = YEARS[YEARS.length - 1];
  var peak = peakDisasterYear();

  var rFirst = globalRefugees(first);
  var rLast = globalRefugees(last);
  items.push("Refugees by origin rose from <b>" + fmtNum(rFirst) + "</b> in " + first +
    " to <b>" + fmtNum(rLast) + "</b> in " + last + " \u2014 <b>" +
    fmtPct(((rLast - rFirst) / rFirst) * 100) + "</b>.");

  items.push("Disaster displacement peaks in <b>" + peak.year + "</b> at <b>" +
    fmtFull(peak.value) + "</b> new displacements, then falls back in the following years.");

  var dLast = globalDisplaced(DISASTER_YEARS[DISASTER_YEARS.length - 1]);
  items.push("The disaster series is <b>volatile, not monotonic</b>: " +
    DISASTER_YEARS[DISASTER_YEARS.length - 1] + " records <b>" + fmtNum(dLast) +
    "</b> against a " + DISASTER_YEARS.length + "-year average of <b>" +
    fmtNum(DISASTER_YEARS.reduce(function (s, y) { return s + globalDisplaced(y); }, 0) / DISASTER_YEARS.length) + "</b>.");

  if (DISASTER_YEARS.indexOf(year) === -1) {
    items.push("For <b>" + year + "</b> the World Bank has not yet published disaster displacement, " +
      "so the panel shows the refugee series alone.");
  } else {
    items.push("In <b>" + year + "</b>, <b>" + reportingCountries(year) +
      "</b> countries reported new disaster displacement, totalling <b>" +
      fmtFull(globalDisplaced(year)) + "</b> people.");
  }

  var ul = document.getElementById("takeaways");
  ul.innerHTML = "";
  for (var i = 0; i < items.length; i++) {
    var li = document.createElement("li");
    li.innerHTML = items[i];
    ul.appendChild(li);
  }
}

function renderCountryTakeaways(iso) {
  var items = [];
  var name = countriesMeta[iso].name;

  var dYears = [];
  var rYears = [];
  for (var i = 0; i < YEARS.length; i++) {
    if (at(displaced[iso], YEARS[i])) dYears.push(YEARS[i]);
    if (at(byOrigin[iso], YEARS[i])) rYears.push(YEARS[i]);
  }

  if (dYears.length >= 2) {
    var dFirst = at(displaced[iso], dYears[0]);
    var dLast = at(displaced[iso], dYears[dYears.length - 1]);
    items.push("Disaster displacement in <b>" + name + "</b> runs <b>" + fmtFull(dFirst) + "</b> (" +
      dYears[0] + ") to <b>" + fmtFull(dLast) + "</b> (" + dYears[dYears.length - 1] + "), <b>" +
      fmtPct(((dLast - dFirst) / dFirst) * 100) + "</b>.");
  } else {
    items.push("<b>" + name + "</b> reports no usable disaster displacement series across the decade.");
  }

  if (rYears.length >= 2) {
    var rFirst = at(byOrigin[iso], rYears[0]);
    var rLast = at(byOrigin[iso], rYears[rYears.length - 1]);
    items.push("Refugees from <b>" + name + "</b> moved from <b>" + fmtFull(rFirst) + "</b> (" +
      rYears[0] + ") to <b>" + fmtFull(rLast) + "</b> (" + rYears[rYears.length - 1] + "), <b>" +
      fmtPct(((rLast - rFirst) / rFirst) * 100) + "</b>.");
  } else if (at(byOrigin[iso], currentYear)) {
    items.push("<b>" + name + "</b> records refugees abroad but not enough years to describe a trend.");
  }

  var peakY = null, peakV = -1;
  for (var p = 0; p < dYears.length; p++) {
    var v = at(displaced[iso], dYears[p]);
    if (v > peakV) { peakV = v; peakY = dYears[p]; }
  }
  if (peakY !== null) {
    items.push("The worst disaster-displacement year on record for <b>" + name + "</b> is <b>" +
      peakY + "</b>, with <b>" + fmtFull(peakV) + "</b> new displacements.");
  }

  var region = countriesMeta[iso].region;
  var peerRows = topCountriesFor("displaced", currentYear, 200, region);
  var rank = -1;
  for (var q = 0; q < peerRows.length; q++) {
    if (peerRows[q].iso === iso) { rank = q + 1; break; }
  }
  if (rank > 0) {
    items.push("Within <b>" + region + "</b>, " + name + " ranks <b>" + rank + " of " +
      peerRows.length + "</b> for disaster displacement in " + currentYear + ".");
  }

  var ul = document.getElementById("countryTakeaways");
  ul.innerHTML = "";
  for (var n = 0; n < items.length; n++) {
    var li = document.createElement("li");
    li.innerHTML = items[n];
    ul.appendChild(li);
  }
}

/* ---------- year engine ---------- */
function onSlide(y) {
  stopPlay();
  onYearChange(Number(y));
}

function jumpYear(y) {
  stopPlay();
  onYearChange(y);
}

function onYearChange(y) {
  currentYear = y;
  document.getElementById("yearSlider").value = y;
  document.getElementById("yearDisplay").textContent = y;

  var note = "";
  if (y === peakDisasterYear().year) {
    note = y + " is the peak year for disaster displacement \u2014 " + fmtFull(globalDisplaced(y)) + ".";
  } else if (DISASTER_YEARS.indexOf(y) === -1) {
    note = "Disaster displacement for " + y + " has not been published yet.";
  } else {
    var d = globalDisplaced(y);
    var prev = DISASTER_YEARS.indexOf(y - 1) === -1 ? null : globalDisplaced(y - 1);
    note = y + ": " + fmtFull(d) + " newly displaced by disasters" +
      (prev ? " (" + fmtPct(((d - prev) / prev) * 100) + " on " + (y - 1) + ")" : "") + ".";
  }
  document.getElementById("yearCaption").textContent = note;

  renderGlobalChart(y);
  renderGlobalPanel(y);
  renderGlobalTakeaways(y);
  if (selected) refreshCountryDetail();
}

function togglePlay() {
  if (playing) { stopPlay(); return; }
  playing = true;
  var btn = document.getElementById("playBtn");
  btn.classList.remove("active");
  btn.innerHTML = "&#9632; Pause";
  if (currentYear >= YEARS[YEARS.length - 1]) currentYear = YEARS[0] - 1;
  playTimer = setInterval(function () {
    currentYear++;
    if (currentYear > YEARS[YEARS.length - 1]) {
      stopPlay();
      onYearChange(YEARS[YEARS.length - 1]);
      return;
    }
    onYearChange(currentYear);
  }, 1600);
}

function stopPlay() {
  playing = false;
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  var btn = document.getElementById("playBtn");
  if (btn) {
    btn.classList.add("active");
    btn.innerHTML = "&#9654; Play decade";
  }
}

document.addEventListener("DOMContentLoaded", function () {
  loadAll().catch(function (err) {
    console.error(err);
    var s = document.getElementById("status");
    s.style.display = "block";
    document.getElementById("app").style.display = "none";
    s.textContent = "Unable to load UNHCR or World Bank displacement data. " +
      "The dashboard structure remains, but live data could not be loaded. Please try again later.";
  });
});