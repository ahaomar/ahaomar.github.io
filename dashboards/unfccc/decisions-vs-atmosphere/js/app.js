/* Dashboard application logic: extracted from inline script */
"use strict";

/* ============================================================
   Decisions vs. the Atmosphere: COP timeline vs CO2 curve
   Data: OWID (live) + curated COP record (embedded)
   ============================================================ */

/* ---------- curated COP dataset (COP1..COP31) ---------- */
var COPS = [
{n:1, year:1995, city:"Berlin", country:"Germany", president:"Angela Merkel", presCountry:"Germany",
 dates:"28 Mar – 7 Apr 1995", milestone:false,
 decisions:["First COP: 117 parties attend", "Berlin Mandate: talks on binding targets beyond 2000", "UNFCCC Secretariat seated in Bonn"],
 co2:23.5},
{n:2, year:1996, city:"Geneva", country:"Switzerland", president:"Chen Chimutengwende", presCountry:"Zimbabwe",
 dates:"8–19 Jul 1996", milestone:false,
 decisions:["Geneva Ministerial Declaration notes IPCC findings", "US backs legally binding mid-term targets", "Rules of procedure still unresolved"],
 co2:23.6},
{n:3, year:1997, city:"Kyoto", country:"Japan", president:"Hiroshi Ohki", presCountry:"Japan",
 dates:"1–11 Dec 1997", milestone:true,
 decisions:["Kyoto Protocol adopted: binding cuts for developed nations", "Average 5.2% below 1990 levels for 2008–2012", "Flexible mechanisms: emissions trading, CDM, joint implementation"],
 co2:24.4},
{n:4, year:1998, city:"Buenos Aires", country:"Argentina", president:"María Julia Alsogaray", presCountry:"Argentina",
 dates:"2–14 Nov 1998", milestone:false,
 decisions:["Buenos Aires Plan of Action: two-year roadmap", "First non-Annex volunteers: Argentina & Kazakhstan"],
 co2:24.6},
{n:5, year:1999, city:"Bonn", country:"Germany", president:"Jan Szyszko", presCountry:"Poland",
 dates:"25 Oct – 5 Nov 1999", milestone:false,
 decisions:["Technical session: 32 draft decisions adopted", " groundwork for finalising Kyoto rulebook"],
 co2:24.9},
{n:6, year:2000, city:"The Hague", country:"Netherlands", president:"Jan Pronk", presCountry:"Netherlands",
 dates:"13–25 Nov 2000", milestone:false,
 decisions:["Talks collapse over carbon sinks and compliance", "COP suspended without agreement: resumed as COP 6-2"],
 co2:25.5},
{n:"6-2", nDisp:"COP 6-2", year:2001, city:"Bonn", country:"Germany", president:"Jan Pronk", presCountry:"Netherlands",
 dates:"16–27 Jul 2001", milestone:false,
 decisions:["Kyoto survives US withdrawal: Bonn Agreements", "Sinks credit, compliance outlines, three new funds"],
 co2:25.5},
{n:7, nDisp:"COP 7", year:2001, city:"Marrakesh", country:"Morocco", president:"Mohamed Elyazghi", presCountry:"Morocco",
 dates:"29 Oct – 10 Nov 2001", milestone:false,
 decisions:["Marrakesh Accords: Kyoto rulebook completed", "Stage set for ratification (55 parties / 55% of 1990 emissions)"],
 co2:25.5},
{n:8, nDisp:"COP 8", year:2002, city:"New Delhi", country:"India", president:"T. R. Baalu", presCountry:"India",
 dates:"23 Oct – 1 Nov 2002", milestone:false,
 decisions:["Delhi Ministerial Declaration on technology transfer", "Delhi work programme on Article 6 (education)"],
 co2:26.6},
{n:9, nDisp:"COP 9", year:2003, city:"Milan", country:"Italy", president:"Miklós Persányi", presCountry:"Hungary",
 dates:"1–12 Dec 2003", milestone:false,
 decisions:["Adaptation Fund operational rules advanced", "First review of 110 developing-country reports"],
 co2:27.4},
{n:10, nDisp:"COP 10", year:2004, city:"Buenos Aires", country:"Argentina", president:"Ginés González García", presCountry:"Argentina",
 dates:"6–17 Dec 2004", milestone:false,
 decisions:["Ten-year stocktake since COP 1", "First post-2012 talks open: Kyoto's first period ends 2012"],
 co2:28.8},
{n:11, nDisp:"COP 11", year:2005, city:"Montreal", country:"Canada", president:"Stéphane Dion", presCountry:"Canada",
 dates:"28 Nov – 9 Dec 2005", milestone:false,
 decisions:["Kyoto Protocol enters into force: first CMP held", "Montreal Action Plan: talks on deeper post-2012 cuts"],
 co2:30.1},
{n:12, nDisp:"COP 12", year:2006, city:"Nairobi", country:"Kenya", president:"Kivutha Kibwana", presCountry:"Kenya",
 dates:"6–17 Nov 2006", milestone:false,
 decisions:["First sub-Saharan COP", "Five-year adaptation work programme adopted"],
 co2:31.3},
{n:13, nDisp:"COP 13", year:2007, city:"Bali", country:"Indonesia", president:"Rachmat Witoelar", presCountry:"Indonesia",
 dates:"3–15 Dec 2007", milestone:true,
 decisions:["Bali Action Plan: roadmap to a 2009 deal", "Two-year negotiating track toward Copenhagen", "REDD+ groundwork"],
 co2:32.3},
{n:14, nDisp:"COP 14", year:2008, city:"Poznań", country:"Poland", president:"Maciej Nowicki", presCountry:"Poland",
 dates:"1–12 Dec 2008", milestone:false,
 decisions:["Adaptation Fund financing principles agreed", "Forest protection mechanism advanced"],
 co2:32.7},
{n:15, nDisp:"COP 15", year:2009, city:"Copenhagen", country:"Denmark", president:"Connie Hedegaard", presCountry:"Denmark",
 dates:"7–18 Dec 2009", milestone:false,
 decisions:["Copenhagen Accord only 'noted': not adopted", "US$30bn fast-start finance pledged 2010–2012", "2 °C goal first written into a UN text"],
 co2:32.8},
{n:16, nDisp:"COP 16", year:2010, city:"Cancún", country:"Mexico", president:"Patricia Espinosa", presCountry:"Mexico",
 dates:"28 Nov – 10 Dec 2010", milestone:false,
 decisions:["Cancún Agreements formally adopted", "Green Climate Fund & Technology Centre established", "2 °C goal formally recognised by all parties"],
 co2:34.1},
{n:17, nDisp:"COP 17", year:2011, city:"Durban", country:"South Africa", president:"Maite Nkoana-Mashabane", presCountry:"South Africa",
 dates:"28 Nov – 9 Dec 2011", milestone:true,
 decisions:["Durban Platform: treaty covering ALL countries by 2015", "Green Climate Fund management framework agreed", "Second Kyoto period drafted (Doha path)"],
 co2:35.1},
{n:18, nDisp:"COP 18", year:2012, city:"Doha", country:"Qatar", president:"Abdullah bin Hamad Al-Attiyah", presCountry:"Qatar",
 dates:"26 Nov – 7 Dec 2012", milestone:false,
 decisions:["Doha Amendment extends Kyoto to 2020 (15% of emissions)", "Loss and damage language formalised for the first time"],
 co2:35.2},
{n:19, nDisp:"COP 19", year:2013, city:"Warsaw", country:"Poland", president:"Marcin Korolec", presCountry:"Poland",
 dates:"11–23 Nov 2013", milestone:false,
 decisions:["Warsaw Framework on REDD+ adopted", "Warsaw International Mechanism for Loss & Damage created"],
 co2:35.7},
{n:20, nDisp:"COP 20", year:2014, city:"Lima", country:"Peru", president:"Manuel Pulgar-Vidal", presCountry:"Peru",
 dates:"1–12 Dec 2014", milestone:false,
 decisions:["Lima Call for Climate Action: national pledges invited", "Groundwork for the Paris text"],
 co2:35.7},
{n:21, nDisp:"COP 21", year:2015, city:"Paris", country:"France", president:"Laurent Fabius", presCountry:"France",
 dates:"30 Nov – 12 Dec 2015", milestone:true,
 decisions:["Paris Agreement adopted: all countries, 1.5–2 °C", "Nationally Determined Contributions invented", "Ratified in under a year; in force Nov 2016"],
 co2:35.4},
{n:22, nDisp:"COP 22", year:2016, city:"Marrakesh", country:"Morocco", president:"Salaheddine Mezouar", presCountry:"Morocco",
 dates:"7–18 Nov 2016", milestone:false,
 decisions:["Paris Agreement enters into force during COP 22", "Marrakesh Partnership for Global Climate Action"],
 co2:35.6},
{n:23, nDisp:"COP 23", year:2017, city:"Bonn", country:"Germany", president:"Frank Bainimarama", presCountry:"Fiji",
 dates:"6–17 Nov 2017", milestone:false,
 decisions:["Fijian presidency, hosted in Bonn", "Powering Past Coal Alliance launched", "Talanoa Dialogue opens Paris stocktake path"],
 co2:36.2},
{n:24, nDisp:"COP 24", year:2018, city:"Katowice", country:"Poland", president:"Michał Kurtyka", presCountry:"Poland",
 dates:"3–14 Dec 2018", milestone:false,
 decisions:["Katowice Rulebook: Paris implementation rules", "IPCC 1.5 °C report 'noted' after oil-states pushback"],
 co2:36.7},
{n:25, nDisp:"COP 25", year:2019, city:"Madrid", country:"Spain", president:"Carolina Schmidt", presCountry:"Chile",
 dates:"2–13 Dec 2019", milestone:false,
 decisions:["Chilean presidency relocated to Madrid", "Article 6 carbon-market talks fail: punted to Glasgow"],
 co2:37.1},
{n:26, nDisp:"COP 26", year:2021, city:"Glasgow", country:"United Kingdom", president:"Alok Sharma", presCountry:"United Kingdom",
 dates:"31 Oct – 12 Nov 2021", milestone:true,
 decisions:["Glasgow Climate Pact: coal 'phased down'", "Article 6 carbon markets finalised", "Methane Pledge & zero-emission vehicles push"],
 co2:37.1},
{n:27, nDisp:"COP 27", year:2022, city:"Sharm El Sheikh", country:"Egypt", president:"Sameh Shoukry", presCountry:"Egypt",
 dates:"6–18 Nov 2022", milestone:true,
 decisions:["Loss and Damage Fund agreed: 30-year fight won", "Fossil-fuel 'phase-down' language blocked", "'Implementation COP': pledges vs. delivery gap"],
 co2:37.5},
{n:28, nDisp:"COP 28", year:2023, city:"Dubai", country:"United Arab Emirates", president:"Sultan Al Jaber", presCountry:"United Arab Emirates",
 dates:"30 Nov – 12 Dec 2023", milestone:true,
 decisions:["First Global Stocktake concluded", "'Transitioning away from fossil fuels': first in COP text", "Tripling renewables & doubling efficiency pledges"],
 co2:38.1},
{n:29, nDisp:"COP 29", year:2024, city:"Baku", country:"Azerbaijan", president:"Mukhtar Babayev", presCountry:"Azerbaijan",
 dates:"11–22 Nov 2024", milestone:false,
 decisions:["NCQG: US$300bn/yr climate finance by 2035", "Carbon-credit registry established", "'Finance COP': developing-world needs largely unmet"],
 co2:38.6},
{n:30, nDisp:"COP 30", year:2025, city:"Belém", country:"Brazil", president:"André Corrêa do Lago", presCountry:"Brazil",
 dates:"10–21 Nov 2025", milestone:true,
 decisions:["First COP in the Amazon", "Belém legacy: just transition, adaptation finance push", "Tropical Forest Forever Facility launched"],
 co2:38.7},
{n:31, nDisp:"COP 31", year:2026, city:"Antalya", country:"Türkiye", president:"Murat Kurum", presCountry:"Türkiye",
 dates:"9–20 Nov 2026", milestone:false,
 decisions:["Upcoming: Antalya, with Pacific-led pre-COP", "Turkish presidency of the WEOG rotation"],
 co2:38.6, upcoming:true}
];

/* ---------- state ---------- */
var co2World = {};      /* year -> Gt (annual) */
var tempWorld = {};     /* year -> anomaly degC */
var chart = null;
var currentIdx = 2;     /* default: Kyoto */
var mode = "annual";    /* annual | cumulative | temp */
var playing = false;
var playTimer = null;

/* ---------- helpers ---------- */
function setStatus(txt) {
  document.getElementById("status").textContent = txt;
  console.log("STATUS:", txt);
}

function fmtGt(v) {
  if (v === null || v === undefined) return "—";
  return (v / 1e9).toFixed(1) + "Bt";
}

function fmtPct(v) {
  if (v === null || v === undefined) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(0) + "%";
}

async function fetchText(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.text();
}

/* parse OWID CSV: Entity,Code,Year,Value */
function parseOWID(txt, valueColName) {
  var lines = txt.trim().split(/\r?\n/);
  var out = {};
  if (lines.length < 2) return out;
  var headers = lines[0].split(",");
  var vcol = headers.indexOf(valueColName);
  if (vcol === -1) vcol = 3; /* fall back to 4th column */
  for (var i = 1; i < lines.length; i++) {
    var cols = lines[i].split(",");
    if (cols.length <= vcol) continue;
    out[cols[0].trim() + "|" + cols[2].trim()] = parseFloat(cols[vcol]);
  }
  return out;
}

/* ============================================================
   DATA LOADING
   ============================================================ */
async function loadAll() {
  setStatus("Step 1/2: loading CO₂ & temperature series (Our World in Data)");
  var co2Csv = await fetchText("https://ourworldindata.org/grapher/annual-co2-emissions-per-country.csv");
  var co2Parsed = parseOWID(co2Csv, "Annual CO₂ emissions");
  for (var k in co2Parsed) {
    if (k.indexOf("World|") === 0) {
      co2World[parseInt(k.split("|")[1], 10)] = co2Parsed[k];
    }
  }
  if (!Object.keys(co2World).length) throw new Error("No World CO₂ rows parsed");

  var tempCsv = await fetchText("https://ourworldindata.org/grapher/temperature-anomaly.csv");
  var tempParsed = parseOWID(tempCsv, "Average");
  for (var t in tempParsed) {
    if (t.indexOf("World|") === 0) {
      tempWorld[parseInt(t.split("|")[1], 10)] = tempParsed[t];
    }
  }

  console.log("DATA CHECK: CO2 years:", Object.keys(co2World).length,
              "| temp years:", Object.keys(tempWorld).length);

  setStatus("");
  document.getElementById("status").style.display = "none";
  document.getElementById("app").style.display = "block";

  renderHeadlineStats();
  buildChart();
  buildAllCopsTable();
  selectCop(currentIdx, true);
}

/* ---------- headline stats ---------- */
function renderHeadlineStats() {
  var first = co2World[1995], last = null, lastY = null;
  for (var y = 2026; y >= 2024; y--) {
    if (co2World[y] !== undefined) { last = co2World[y]; lastY = y; break; }
  }
  if (!last) { var ys = Object.keys(co2World).map(Number).sort(); last = co2World[ys[ys.length-1]]; lastY = ys[ys.length-1]; }

  document.getElementById("statFirst").innerHTML = fmtGt(first) + "<small>1995</small>";
  document.getElementById("statLast").innerHTML = fmtGt(last) + "<small>" + lastY + "</small>";
  document.getElementById("statDelta").innerHTML = fmtPct(((last - first) / first) * 100) + "<small>in 30 yrs</small>";

  var warmY = null;
  for (var w = 2026; w >= 2024; w--) { if (tempWorld[w] !== undefined) { warmY = w; break; } }
  if (warmY === null) { var ts = Object.keys(tempWorld).map(Number).sort(); warmY = ts[ts.length-1]; }
  document.getElementById("statWarm").innerHTML = "+" + tempWorld[warmY].toFixed(2) + "°C<small>" + warmY + "</small>";
}

/* ============================================================
   CHART: CO2 with COP markers
   ============================================================ */
function buildChart() {
  if (chart) chart.destroy();

  var labels = [], data = [];
  var from = 1990, to = 2026;
  var src = (mode === "temp") ? tempWorld : co2World;

  for (var y = from; y <= to; y++) {
    if (src[y] !== undefined) {
      labels.push(y);
      data.push(mode === "annual" ? +(src[y] / 1e9).toFixed(2) : mode === "cumulative" ? +(src[y] / 1e9).toFixed(2) : +src[y].toFixed(2));
    }
  }

  /* COP point markers */
  var copPoints = COPS.map(function(c, i) {
    var y = (mode === "temp") ? tempWorld[c.year] : (co2World[c.year] !== undefined ? co2World[c.year] / 1e9 : null);
    return (y === null || y === undefined) ? null :
      { x: c.year, y: +y.toFixed(2), cop: c, idx: i };
  }).filter(Boolean);

  chart = new Chart(document.getElementById("co2Chart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: mode === "temp" ? "Warming vs 1850–1900 (°C)" : (mode === "cumulative" ? "Cumulative CO₂ (Gt)" : "Annual CO₂ (Gt)"),
          data: data,
          borderColor: "#1a5c9e",
          backgroundColor: "rgba(26,92,158,.10)",
          fill: true, tension: 0.35, borderWidth: 2.5,
          pointRadius: 0,
          yAxisID: "y"
        },
        {
          label: "COP summits",
          data: copPoints,
          type: "scatter",
          pointRadius: function(ctx) {
            var p = ctx.raw; if (!p) return 4;
            return p.idx === currentIdx ? 9 : (p.cop.milestone ? 6 : 4);
          },
          pointHoverRadius: 8,
          backgroundColor: function(ctx) {
            var p = ctx.raw; if (!p) return "#dc6b5a";
            if (p.idx === currentIdx) return "#dc6b5a";
            return p.cop.milestone ? "#0d3b66" : "rgba(13,59,102,.55)";
          },
          borderColor: "#fff",
          borderWidth: 1.5,
          yAxisID: "y"
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      onClick: function(evt, elements) {
        if (elements.length) {
          var p = elements[0].raw;
          if (p && p.cop) { selectCop(p.idx); }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              if (ctx.dataset.label === "COP summits") {
                var p = ctx.raw;
                return "COP " + (p.cop.nDisp || p.cop.n) + ": " + p.cop.city + " " + p.cop.year;
              }
              var v = ctx.parsed.y;
              return ctx.dataset.label + ": " + v;
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: "#8895a4", maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: {
          title: { display: true, text: mode === "temp" ? "°C above 1850–1900" : "Gt CO₂", color: "#8895a4", font: { size: 11 } },
          ticks: { color: "#8895a4" }, grid: { color: "#eef1f4" },
          beginAtZero: mode !== "temp"
        }
      }
    }
  });
}

function setMode(m) {
  mode = m;
  document.getElementById("tglAnnual").classList.toggle("active", m === "annual");
  document.getElementById("tglCumulative").classList.toggle("active", m === "cumulative");
  document.getElementById("tglTemp").classList.toggle("active", m === "temp");
  document.getElementById("chartTitle").innerHTML =
    m === "temp" ? "Global temperature anomaly, 1850–2026" :
    m === "cumulative" ? "Cumulative CO₂, 1750–2024 (world)" :
    "Global CO₂ emissions, 1990–2024";
  document.getElementById("chartModeNote").textContent =
    m === "temp" ? "Live from Our World in Data (HadCRUT5)" :
    m === "cumulative" ? "Live from Our World in Data (Global Carbon Project)" :
    "Live from Our World in Data (Global Carbon Project)";
  buildChart();
}

/* ============================================================
   COP DETAIL + VERDICT ENGINE
   ============================================================ */
function fiveYrGrowth(year) {
  /* CO2 growth in the 5 years after `year` vs 5 years before */
  var after = co2World[year + 5], at = co2World[year];
  var before = co2World[year - 5];
  if (at === undefined || after === undefined || before === undefined) return null;
  var pre = ((at - before) / before) * 100;
  var post = ((after - at) / at) * 100;
  return { pre: pre, post: post, bend: post - pre };
}

function selectCop(idx, first) {
  currentIdx = idx;
  var c = COPS[idx];
  if (!c) return;

  document.getElementById("countryPanel") && (document.getElementById("countryPanel").style.display = "none");
  document.getElementById("copPanel").style.display = "none";
  document.getElementById("copWrap").style.display = "block";

  /* slider sync */
  var slider = document.getElementById("copSlider");
  slider.value = idx;
  var pct = (idx / (COPS.length - 1)) * 100;
  slider.style.setProperty("--fill", pct + "%");

  /* header */
  var disp = c.nDisp || ("COP " + c.n);
  document.getElementById("yearDisplay").innerHTML = disp + " &middot; " + c.year;
  document.getElementById("yearCaption").textContent = c.city + ", " + c.country + ": " + (c.decisions[0] || "");
  document.getElementById("copNote").textContent =
    (c.upcoming ? "Upcoming conference: Nov 2026" : "Attended decisions embedded · atmosphere data live");

  /* detail card */
  document.getElementById("copTag").textContent = disp + " · " + c.year;
  document.getElementById("copName").textContent = c.city + ", " + c.country;
  document.getElementById("copMeta").innerHTML =
    "President: <b>" + c.president + "</b> (" + c.presCountry + ") &middot; " + c.dates;

  /* verdict: computed from live data */
  var g = fiveYrGrowth(c.year);
  var verdictEl = document.getElementById("copVerdict");
  if (c.upcoming) {
    verdictEl.innerHTML = "The next chapter: Antalya 2026. The curve waits for no communiqu&eacute;.";
  } else if (g) {
    var bent = g.bend < -1;
    var flat = g.bend >= -1 && g.bend < 1;
    var word = bent ? "bent" : flat ? "paused" : "steepened";
    verdictEl.innerHTML =
      "CO<sub>2</sub> growth " + word + " after " + c.city +
      ": <b>" + fmtPct(g.post) + "</b> in the 5 years after vs " + fmtPct(g.pre) + " in the 5 years before.";
  } else {
    verdictEl.innerHTML = "Verdict pending: insufficient data window around " + c.year + ".";
  }

  /* delta grid */
  var at = co2World[c.year];
  var grid = document.getElementById("deltaGrid");
  if (at !== undefined) {
    var warm = tempWorld[c.year];
    var warmHtml = (warm !== undefined)
      ? "<div class='delta-cell'><span>Warming in " + c.year + "</span><b>+" + warm.toFixed(2) + "°C</b><small>vs 1850–1900</small></div>"
      : "";
    grid.innerHTML =
      "<div class='delta-cell'><span>World CO<sub>2</sub> that year</span><b>" + (at / 1e9).toFixed(1) + " Gt</b><small>annual emissions</small></div>" +
      warmHtml +
      (g ? "<div class='delta-cell'><span>5-yr bend</span><b>" + (g.bend >= 0 ? "+" : "") + g.bend.toFixed(1) + "pp</b><small>growth after vs before</small></div>" : "");
  } else {
    grid.innerHTML = "";
  }

  /* decisions */
  var ul = document.getElementById("copDecisions");
  ul.innerHTML = "";
  c.decisions.forEach(function(d) {
    var li = document.createElement("li");
    li.innerHTML = d;
    ul.appendChild(li);
  });

  /* table + chart highlight refresh */
  highlightRows();
  if (chart) buildChart();
  if (!first) highlightRows();
}

function highlightRows() {
  var rows = document.querySelectorAll(".cop-row");
  for (var i = 0; i < rows.length; i++) {
    rows[i].classList.toggle("is-selected", Number(rows[i].getAttribute("data-idx")) === currentIdx);
  }
}

/* ---------- all-COPs table ---------- */
function buildAllCopsTable() {
  var host = document.getElementById("allCopsTable");
  host.innerHTML = "";
  COPS.forEach(function(c, i) {
    var at = co2World[c.year];
    var div = document.createElement("div");
    div.className = "cop-row" + (c.milestone ? " milestone" : "");
    div.setAttribute("data-idx", i);
    div.innerHTML =
      "<span class='r-name'>" + (c.nDisp || ("COP " + c.n)) + ": " + c.city + ", " + c.country + " (" + c.year + ")</span>" +
      "<span class='r-val'>" + (at !== undefined ? (at / 1e9).toFixed(1) + " Gt" : "—") + "</span>";
    div.addEventListener("click", function() {
      stopPlay();
      selectCop(Number(this.getAttribute("data-idx")));
    });
    host.appendChild(div);
  });
}

/* ============================================================
   PLAYBACK
   ============================================================ */
function onSlide(v) {
  stopPlay();
  selectCop(Number(v));
}

function jumpTo(idx) {
  stopPlay();
  selectCop(idx);
}

function togglePlay() {
  if (playing) { stopPlay(); return; }
  playing = true;
  var btn = document.getElementById("playBtn");
  btn.classList.remove("active");
  btn.innerHTML = "&#9632; Pause";
  if (currentIdx >= COPS.length - 1) currentIdx = 0;
  playTimer = setInterval(function() {
    currentIdx++;
    if (currentIdx > COPS.length - 1) { stopPlay(); selectCop(COPS.length - 1); return; }
    selectCop(currentIdx);
  }, 2200);
}

function stopPlay() {
  playing = false;
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  var btn = document.getElementById("playBtn");
  btn.classList.add("active");
  btn.innerHTML = "&#9654; Play 31 COPs";
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
