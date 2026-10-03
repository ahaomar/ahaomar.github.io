/* ============================================================
   COUNTRY CLIMATE PROFILE TOOL — js/app.js
   Browser edition of the country-climate-profile skill.
   Live sources: NASA POWER (T2M, PRECTOTCORR), World Bank Open
   Data (context indicators + country list), ND-GAIN (bundled
   snapshot), UNFCCC NDC Registry (link only).
   Every printed figure is computed from the fetched data.
   ============================================================ */
"use strict";

var NASA_BASE = "https://power.larc.nasa.gov/api/temporal";
var WB_BASE = "https://api.worldbank.org/v2";
var PERIOD_START = 1985;
var PERIOD_END = 2024;
var BASELINE_END = 2014;      // rainfall baseline: 1985–2014
var RECENT_START = 2015;      // recent decade: 2015–2024

var WB_INDICATORS = [
  { code: "SP.POP.TOTL",    label: "Population, total" },
  { code: "SP.POP.GROW",    label: "Population growth (annual %)" },
  { code: "SP.RUR.TOTL.ZS", label: "Rural population (% of total)" },
  { code: "AG.LND.ARBL.ZS", label: "Arable land (% of land area)" },
  { code: "NY.GDP.MKTP.CD", label: "GDP (current US$)" }
];

var MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

var countries = [];          // {name, iso2, iso3, lat, lon}
var ndGain = null;           // bundled snapshot {latest_year, count, countries}
var charts = [];             // Chart.js instances, destroyed on rebuild
var currentClimRain = null;  // full-record monthly climatology of the open profile

/* ---------- utilities ---------- */

function setStatus(msg, isError) {
  var el = document.getElementById("status");
  el.textContent = msg;
  el.className = isError ? "is-error" : "";
}

function fetchJSON(url) {
  return fetch(url).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status + " from data source");
    return res.json();
  });
}

function zeroPad(n) { return (n < 10 ? "0" : "") + n; }
function avg(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }

function utcNow() {
  return new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function fmtNum(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  var a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1) + " billion";
  if (a >= 1e6) return (v / 1e6).toFixed(1) + " million";
  if (a >= 1e3) return (v / 1e3).toFixed(1) + " thousand";
  return String(round2(v));
}

function fmtSigned(v, unit, digits) {
  var d = digits === undefined ? 2 : digits;
  return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d) + (unit || "");
}

function ordinal(n) {
  var s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function destroyCharts() {
  charts.forEach(function (c) { c.destroy(); });
  charts = [];
}

function linearTrendSlope(years, values) {
  var n = years.length;
  if (n < 3) return null;
  var sx = 0, sy = 0, sxy = 0, sxx = 0, i;
  for (i = 0; i < n; i++) {
    sx += years[i]; sy += values[i];
    sxy += years[i] * values[i]; sxx += years[i] * years[i];
  }
  var denom = n * sxx - sx * sx;
  return denom === 0 ? null : (n * sxy - sx * sy) / denom;
}

/* ---------- data layer (port of the skill's fetch_climate.py) ---------- */

function loadCountryList() {
  return fetchJSON(WB_BASE + "/country?format=json&per_page=400").then(function (payload) {
    var rows = payload[1] || [];
    countries = rows
      .filter(function (r) { return r.region && r.region.id !== "NA"; })
      .map(function (r) {
        return {
          name: r.name,
          iso2: r.iso2Code,
          iso3: r.id,
          lat: parseFloat(r.latitude),
          lon: parseFloat(r.longitude)
        };
      })
      .filter(function (c) {
        return c.iso3 && c.iso3.length === 3 &&
               typeof c.lat === "number" && typeof c.lon === "number";
      });
    document.getElementById("countryCount").textContent = String(countries.length);
    setStatus("Choose a country to generate a profile.");
    return countries;
  }).catch(function (err) {
    setStatus("Country list could not be loaded — " + err.message +
              " Check your connection and reload the page.", true);
    throw err;
  });
}

function fetchNasa(lon, lat) {
  var url = NASA_BASE + "/monthly/point?parameters=T2M,PRECTOTCORR&community=AG" +
            "&longitude=" + lon + "&latitude=" + lat +
            "&start=" + PERIOD_START + "&end=" + PERIOD_END + "&format=JSON";
  return fetchJSON(url).then(function (data) {
    var props = data.properties.parameter;
    var years = [], temps = [], rain = [], monthly = {};
    var monthsT = [], monthsR = [], m, y;
    for (m = 0; m < 12; m++) { monthsT.push([]); monthsR.push([]); }
    for (y = PERIOD_START; y <= PERIOD_END; y++) {
      var tvals = [], rvals = [], complete = true;
      for (m = 0; m < 12; m++) {
        tvals.push(props.T2M[y + zeroPad(m + 1)]);
        rvals.push(props.PRECTOTCORR[y + zeroPad(m + 1)]);
      }
      for (m = 0; m < 12; m++) {
        if (tvals[m] === undefined || tvals[m] === -999 ||
            rvals[m] === undefined || rvals[m] === -999) { complete = false; break; }
      }
      if (!complete) continue;
      years.push(y);
      temps.push(round2(avg(tvals)));
      rain.push(round1(avg(rvals) * 365));  // mm/day mean annualised
      for (m = 0; m < 12; m++) { monthsT[m].push(tvals[m]); monthsR[m].push(rvals[m]); }
      monthly[y] = rvals.map(function (v) { return round2(v); });
    }
    if (years.length < 10) {
      throw new Error("fewer than 10 complete years of NASA observations");
    }
    return {
      lon: lon, lat: lat,
      years: years, temps: temps, rain: rain, monthlyRain: monthly,
      climTemp: monthsT.map(function (a) { return round2(avg(a)); }),
      climRain: monthsR.map(function (a) { return round2(avg(a)); })
    };
  });
}

function fetchWorldBank(iso3) {
  var out = {}, missing = [];
  return Promise.all(WB_INDICATORS.map(function (ind) {
    var url = WB_BASE + "/country/" + iso3 + "/indicator/" + ind.code +
              "?format=json&per_page=60";
    return fetchJSON(url).then(function (payload) {
      var rows = payload[1] || [];
      var vals = rows
        .filter(function (d) { return d.value !== null && d.value !== undefined; })
        .map(function (d) { return { year: parseInt(d.date, 10), value: d.value }; });
      if (vals.length) {
        var latest = vals.reduce(function (a, b) { return b.year > a.year ? b : a; });
        out[ind.code] = { label: ind.label, year: latest.year, value: latest.value };
      } else {
        missing.push(ind.code);
      }
    }).catch(function () {
      missing.push(ind.code);
    });
  })).then(function () {
    return { data: out, missing: missing };
  });
}

function loadNdGain(iso3) {
  if (ndGain === null) {
    return fetchJSON("data/ndgain.json").then(function (d) {
      ndGain = d;
      return ndGain.countries[iso3] || null;
    });
  }
  return Promise.resolve(ndGain.countries[iso3] || null);
}

/* ---------- derived statistics (all computed from fetched rows) ---------- */

function computeStats(nasa) {
  var slope = linearTrendSlope(nasa.years, nasa.temps);
  var warmestIdx = 0, i;
  for (i = 1; i < nasa.temps.length; i++) {
    if (nasa.temps[i] > nasa.temps[warmestIdx]) warmestIdx = i;
  }
  var baseVals = [], recentVals = [];
  for (i = 0; i < nasa.years.length; i++) {
    if (nasa.years[i] <= BASELINE_END) baseVals.push(nasa.rain[i]);
    if (nasa.years[i] >= RECENT_START) recentVals.push(nasa.rain[i]);
  }
  if (!baseVals.length || !recentVals.length) {
    throw new Error("not enough rainfall years to form baseline and recent periods");
  }
  var baseMean = avg(baseVals), recentMean = avg(recentVals);
  var peakMonth = 0;
  for (i = 1; i < 12; i++) {
    if (nasa.climRain[i] > nasa.climRain[peakMonth]) peakMonth = i;
  }
  return {
    firstYear: nasa.years[0],
    lastYear: nasa.years[nasa.years.length - 1],
    tempMeanAll: avg(nasa.temps),
    slope: slope,
    warmestYear: nasa.years[warmestIdx],
    warmestTemp: nasa.temps[warmestIdx],
    rainMin: Math.min.apply(null, nasa.rain),
    rainMax: Math.max.apply(null, nasa.rain),
    baseMean: baseMean,
    recentMean: recentMean,
    rainChangePct: (recentMean - baseMean) / baseMean * 100,
    peakMonthIdx: peakMonth,
    nBaseYears: baseVals.length,
    nRecentYears: recentVals.length
  };
}

/* ---------- typeahead combobox ---------- */

var activeIndex = -1;

function matchCountries(query) {
  var q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  var starts = [], contains = [];
  countries.forEach(function (c) {
    var n = c.name.toLowerCase();
    if (n.indexOf(q) === 0) starts.push(c);
    else if (n.indexOf(q) !== -1) contains.push(c);
  });
  return starts.concat(contains).slice(0, 12);
}

function matchCountryExact(value) {
  var q = value.trim().toLowerCase();
  return countries.find(function (c) { return c.name.toLowerCase() === q; }) || null;
}

function setComboExpanded(expanded) {
  document.querySelector(".combobox").setAttribute("aria-expanded", expanded ? "true" : "false");
  document.getElementById("countryInput").setAttribute("aria-expanded", expanded ? "true" : "false");
}

function onTypeahead(value) {
  var list = document.getElementById("suggestList");
  var matches = matchCountries(value);
  // invalidate a previous selection if the text no longer names it
  var selected = countries.find(function (c) { return c.iso3 === document.getElementById("countryInput").dataset.iso3; });
  if (selected && selected.name.toLowerCase() !== value.trim().toLowerCase()) {
    delete document.getElementById("countryInput").dataset.iso3;
  }
  list.textContent = "";
  activeIndex = -1;
  matches.forEach(function (c, i) {
    var li = document.createElement("li");
    li.setAttribute("role", "option");
    li.setAttribute("id", "sug-" + i);
    li.dataset.iso3 = c.iso3;
    var name = document.createElement("span");
    name.className = "s-name";
    name.textContent = c.name;
    var code = document.createElement("span");
    code.className = "s-code";
    code.textContent = c.iso3;
    li.appendChild(name);
    li.appendChild(code);
    li.addEventListener("mousedown", function (ev) {
      ev.preventDefault();
      selectCountry(c);
    });
    list.appendChild(li);
  });
  list.hidden = !matches.length;
  setComboExpanded(!!matches.length);
  document.getElementById("goBtn").disabled = !matchCountryExact(value);
}

function onComboKey(ev) {
  var list = document.getElementById("suggestList");
  if (list.hidden) {
    if (ev.key === "Enter") { generateProfile(); ev.preventDefault(); }
    return;
  }
  var items = Array.prototype.slice.call(list.children);
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    ev.preventDefault();
    var delta = ev.key === "ArrowDown" ? 1 : -1;
    activeIndex = (activeIndex + delta + items.length) % items.length;
    items.forEach(function (li, i) { li.classList.toggle("is-active", i === activeIndex); });
    document.getElementById("countryInput").setAttribute("aria-activedescendant", "sug-" + activeIndex);
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    if (activeIndex >= 0 && items[activeIndex]) {
      var iso3 = items[activeIndex].dataset.iso3;
      selectCountry(countries.find(function (c) { return c.iso3 === iso3; }));
    } else {
      generateProfile();
    }
  } else if (ev.key === "Escape") {
    list.hidden = true;
    setComboExpanded(false);
    document.getElementById("countryInput").removeAttribute("aria-activedescendant");
    activeIndex = -1;
  }
}

function closeSuggestions() {
  document.getElementById("suggestList").hidden = true;
  setComboExpanded(false);
}

function selectCountry(c) {
  var input = document.getElementById("countryInput");
  input.value = c.name;
  input.dataset.iso3 = c.iso3;
  input.dataset.lat = c.lat;
  input.dataset.lon = c.lon;
  closeSuggestions();
  document.getElementById("goBtn").disabled = false;
  generateProfile();
}

document.addEventListener("click", function (ev) {
  if (!ev.target.closest(".combobox")) closeSuggestions();
});

/* ---------- profile generation ---------- */

function generateProfile() {
  var input = document.getElementById("countryInput");
  var country = matchCountryExact(input.value) ||
                countries.find(function (c) { return c.iso3 === input.dataset.iso3; });
  if (!country) {
    setStatus("Select a country from the suggestions, or type the full name.", true);
    return;
  }
  document.getElementById("goBtn").disabled = true;
  var sources = [];
  var gaps = [];
  var retrieved = utcNow();

  setStatus("Step 1/3: NASA POWER climate observations…");
  fetchNasa(country.lon, country.lat)
    .then(function (nasa) {
      sources.push({
        text: "NASA POWER agroclimatology API, monthly point data (" + nasa.lon + ", " +
              nasa.lat + "), " + nasa.years[0] + "–" + nasa.years[nasa.years.length - 1] +
              " (MERRA-2). power.larc.nasa.gov",
        url: "https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M,PRECTOTCORR&community=AG&longitude=" +
             nasa.lon + "&latitude=" + nasa.lat + "&start=1985&end=2024&format=JSON"
      });
      setStatus("Step 2/3: World Bank exposure indicators…");
      return fetchWorldBank(country.iso3).then(function (wb) {
        if (Object.keys(wb.data).length) {
          sources.push({
            text: "World Bank Open Data API, indicators " +
                  WB_INDICATORS.map(function (i) { return i.code; }).join(", ") +
                  " — latest reporting year per indicator. api.worldbank.org",
            url: WB_BASE + "/country/" + country.iso3 + "/indicator/SP.POP.TOTL?format=json"
          });
        }
        if (wb.missing.length) {
          gaps.push("World Bank indicators with no reported value: " +
                    wb.missing.join(", ") + ".");
        }
        setStatus("Step 3/3: ND-GAIN vulnerability index…");
        return loadNdGain(country.iso3).catch(function (err) {
          gaps.push("ND-GAIN snapshot could not be loaded (" + err.message + ").");
          return null;
        }).then(function (nd) {
          if (nd) {
            sources.push({
              text: "ND-GAIN Country Index, " + ndGain.latest_year + " scores (" +
                    ndGain.count + " countries), bundled snapshot. gain.nd.edu",
              url: "https://gain.nd.edu/our-work/country-index/"
            });
          } else {
            gaps.push("ND-GAIN Country Index: no score available for " + country.iso3 +
                      " in the bundled " + (ndGain ? ndGain.latest_year : "") + " snapshot.");
          }
          sources.push({
            text: "UNFCCC NDC Registry, " + country.name + " submission. unfccc.int",
            url: "https://unfccc.int/NDCREG?country=" + country.iso3
          });
          renderProfile(country, nasa, wb, nd, sources, gaps, retrieved);
          setStatus("Profile generated " + retrieved +
                    ". Every figure is computed from the sources listed under Sources.");
        });
      });
    })
    .catch(function (err) {
      setStatus("Live data unavailable — " + err.message +
                " No profile has been generated.", true);
      document.getElementById("app").style.display = "none";
      document.getElementById("printBtn").style.display = "none";
    })
    .then(function () {
      document.getElementById("goBtn").disabled = false;
    });
}

/* ---------- renderers ---------- */

function renderProfile(country, nasa, wb, nd, sources, gaps, retrieved) {
  destroyCharts();
  var stats = computeStats(nasa);

  document.getElementById("app").style.display = "";
  document.getElementById("printBtn").style.display = "";

  document.getElementById("profileTitle").textContent =
    "Key findings — " + country.name + " (" + country.iso3 + ")";
  document.getElementById("profileMeta").textContent =
    "Climate record " + stats.firstYear + "–" + stats.lastYear + " · generated " + retrieved;
  document.getElementById("locLabel").textContent =
    "grid point " + round1(nasa.lon) + ", " + round1(nasa.lat);
  document.getElementById("retrievedAt").textContent = retrieved;

  renderCards(stats, wb.data, nd);
  renderTempChart(nasa, stats);
  renderRainChart(nasa, stats);
  currentClimRain = nasa.climRain;
  renderTakeaways(nasa, stats, nd);
  renderWorldBank(wb.data);
  renderVulnerability(country, nd);
  renderSources(sources);
  renderGaps(gaps);
  closeSuggestions();
}

function renderCards(stats, wb, nd) {
  var cards = [];

  // Card 1: temperature — trend per decade where meaningful, else warmest year
  if (stats.slope !== null && Math.abs(stats.slope * 10) >= 0.05) {
    cards.push({
      value: fmtSigned(stats.slope * 10, " °C", 2),
      label: "temperature change per decade, " + stats.firstYear + "–" + stats.lastYear +
             " (NASA POWER)"
    });
  } else {
    cards.push({
      value: stats.warmestTemp.toFixed(1) + " °C",
      label: "warmest year on record: " + stats.warmestYear +
             " (mean of annual means, " + stats.firstYear + "–" + stats.lastYear + ")"
    });
  }

  // Card 2: rainfall, recent decade vs baseline — both periods printed
  cards.push({
    value: fmtSigned(stats.rainChangePct, "%", 1),
    label: "recent-decade rainfall (" + RECENT_START + "–" + PERIOD_END +
           ") against the " + PERIOD_START + "–" + BASELINE_END +
           " baseline (NASA POWER)"
  });

  // Card 3: vulnerability rank from the bundled ND-GAIN snapshot
  if (nd) {
    var vulnRank = ndGain.count + 1 - nd.rank;  // rank 1 = highest score (most ready)
    cards.push({
      value: nd.score.toFixed(1),
      label: "ND-GAIN score, " + ndGain.latest_year + " — ranked " +
             ordinal(vulnRank) + " most vulnerable of " + ndGain.count +
             " (higher score = more ready)"
    });
  } else if (wb["AG.LND.ARBL.ZS"]) {
    var ar = wb["AG.LND.ARBL.ZS"];
    cards.push({
      value: ar.value.toFixed(1) + "%",
      label: "of land area is arable (World Bank, " + ar.year +
             ") — ND-GAIN score unavailable"
    });
  } else {
    cards.push({ value: "—", label: "vulnerability standing unavailable (ND-GAIN and World Bank)" });
  }

  var host = document.getElementById("cards");
  host.textContent = "";
  cards.forEach(function (c) {
    var div = document.createElement("div");
    div.className = "card";
    var b = document.createElement("b");
    b.textContent = c.value;
    var span = document.createElement("span");
    span.textContent = c.label;
    div.appendChild(b);
    div.appendChild(span);
    host.appendChild(div);
  });
}

function renderTempChart(nasa, stats) {
  var trend = null;
  if (stats.slope !== null) {
    trend = nasa.years.map(function (y) {
      return round2(stats.slope * (y - nasa.years[0]) + stats.tempMeanAll -
                    stats.slope * (avg(nasa.years) - nasa.years[0]));
    });
  }
  charts.push(new Chart(document.getElementById("tempChart"), {
    type: "line",
    data: {
      labels: nasa.years,
      datasets: [
        {
          label: "Annual mean temperature (°C)",
          data: nasa.temps,
          borderColor: getComputedStyle(document.documentElement)
                         .getPropertyValue("--color-accent").trim() || "#2456c4",
          backgroundColor: "rgba(36,86,196,.08)",
          borderWidth: 2, pointRadius: 0, pointHitRadius: 8, tension: 0.15,
          fill: true
        },
        trend ? {
          label: "Linear trend",
          data: trend,
          borderColor: "rgba(0,0,0,.45)",
          borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, fill: false
        } : null
      ].filter(Boolean)
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { boxWidth: 14, font: { size: 11 } } } },
      scales: {
        x: { ticks: { maxTicksLimit: 9, font: { size: 10 } } },
        y: { title: { display: true, text: "°C" }, ticks: { font: { size: 10 } } }
      }
    }
  }));
}

function renderRainChart(nasa, stats) {
  charts.push(new Chart(document.getElementById("rainChart"), {
    type: "bar",
    data: {
      labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      datasets: [
        {
          label: "Baseline " + PERIOD_START + "–" + BASELINE_END +
                 " (" + stats.nBaseYears + " years)",
          data: recentClimByMonth(nasa, function (y) { return y <= BASELINE_END; }),
          backgroundColor: "rgba(36,86,196,.55)"
        },
        {
          label: "Recent decade " + RECENT_START + "–" + PERIOD_END +
                 " (" + stats.nRecentYears + " years)",
          data: recentClimByMonth(nasa, function (y) { return y >= RECENT_START; }),
          backgroundColor: "rgba(233,116,81,.75)"
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { boxWidth: 14, font: { size: 11 } } } },
      scales: {
        x: { ticks: { font: { size: 10 } } },
        y: { title: { display: true, text: "mm per day" }, ticks: { font: { size: 10 } } }
      }
    }
  }));
}

// per-month mean precipitation (mm/day) over a filtered set of years
function recentClimByMonth(nasa, yearFilter) {
  // NASA payload months were aggregated in fetchNasa; rebuild per-period
  // climatology from the stored per-year monthly values.
  var sums = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], n = 0, i, m;
  for (i = 0; i < nasa.years.length; i++) {
    if (!yearFilter(nasa.years[i])) continue;
    var yearVals = nasa.monthlyRain ? nasa.monthlyRain[nasa.years[i]] : null;
    if (!yearVals) continue;
    for (m = 0; m < 12; m++) sums[m] += yearVals[m];
    n++;
  }
  if (!n) return nasa.climRain;  // fallback: full-period climatology
  return sums.map(function (s) { return round2(s / n); });
}

function renderTakeaways(nasa, stats, nd) {
  var items = [];
  var peak = stats.peakMonthIdx;
  var season = wetSeasonSummary(nasa);

  if (stats.slope !== null && Math.abs(stats.slope * 10) >= 0.05) {
    items.push(
      "Mean annual temperature at the representative location averaged " +
      stats.tempMeanAll.toFixed(1) + " °C over " + stats.firstYear + "–" + stats.lastYear +
      "; the linear trend is " + fmtSigned(stats.slope * 10, " °C", 2) + " per decade."
    );
  } else {
    items.push(
      "Mean annual temperature at the representative location averaged " +
      stats.tempMeanAll.toFixed(1) + " °C over " + stats.firstYear + "–" + stats.lastYear +
      "; the linear trend is below 0.05 °C per decade at this single grid point."
    );
  }
  items.push(
    "The warmest year in the record is " + stats.warmestYear +
    " (" + stats.warmestTemp.toFixed(1) + " °C annual mean)."
  );
  items.push(
    "Annual rainfall ranges from " + Math.round(stats.rainMin) + " mm to " +
    Math.round(stats.rainMax) + " mm per year across the record, and " +
    Math.round(stats.rainChangePct >= 0 ? stats.rainChangePct : -stats.rainChangePct) +
    " per cent " + (stats.rainChangePct >= 0 ? "higher" : "lower") +
    " in " + RECENT_START + "–" + PERIOD_END + " (" +
    Math.round(stats.recentMean) + " mm per year) than in " +
    PERIOD_START + "–" + BASELINE_END + " (" + Math.round(stats.baseMean) +
    " mm per year)."
  );
  var season = wetSeasonSummary(nasa);
  items.push(
    "The wettest month on the " + stats.firstYear + "–" + stats.lastYear +
    " climatology is " + MONTH_NAMES[peak] + " (" + nasa.climRain[peak].toFixed(1) +
    " mm per day on average)" +
    (season ? "; " + season : ", and monthly rainfall is relatively even through the year.")
  );
  if (nd) {
    var vulnRank = ndGain.count + 1 - nd.rank;
    items.push(
      "On the ND-GAIN Country Index (" + ndGain.latest_year + "), the score of " +
      nd.score.toFixed(1) + " places the country " + ordinal(vulnRank) +
      " most vulnerable of " + ndGain.count + " scored countries (a low score means high vulnerability)."
    );
  }

  var host = document.getElementById("takeaways");
  host.textContent = "";
  items.forEach(function (t) {
    var li = document.createElement("li");
    li.textContent = t;
    host.appendChild(li);
  });
}

// Computed, not assumed: names the wettest months only when the climatology
// actually concentrates rainfall, with the share of annual rainfall they
// carry. Returns "" for an even distribution.
function wetSeasonSummary(nasa) {
  var clim = currentClimRain;
  if (!clim) return "";
  var annual = clim.reduce(function (s, v) { return s + v; }, 0);
  if (annual <= 0) return "";
  var peak = clim.reduce(function (best, v, i) { return v > clim[best] ? i : best; }, 0);
  var driest = clim.reduce(function (best, v, i) { return v < clim[best] ? i : best; }, 0);
  var concentration = clim[peak] / (annual / 12);
  if (concentration < 2) return "";  // no distinct wet season in the data

  var order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].sort(function (a, b) {
    return clim[b] - clim[a];
  });
  var share = 0, picked = [], m;
  for (m = 0; m < order.length && share / annual < 0.6; m++) {
    share += clim[order[m]];
    picked.push(order[m]);
  }
  var names = picked.sort(function (a, b) { return a - b; })
    .map(function (i) { return MONTH_NAMES[i]; });
  var pct = Math.round(share / annual * 100);
  var list = names.length === 1 ? names[0]
    : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  return "the months " + list + " together account for approximately " + pct +
         " per cent of the annual total.";
}

function renderWorldBank(wb) {
  var host = document.getElementById("wbRecord");
  host.textContent = "";
  WB_INDICATORS.forEach(function (ind) {
    var d = wb[ind.code];
    if (!d) return;
    var row = document.createElement("div");
    row.className = "record-row";
    var name = document.createElement("span");
    name.className = "r-name";
    name.textContent = ind.label;
    var val = document.createElement("span");
    val.className = "r-val";
    val.textContent = fmtIndicator(ind.code, d.value) + "  (" + d.year + ")";
    row.appendChild(name);
    row.appendChild(val);
    host.appendChild(row);
  });

  var note = document.getElementById("exposureNote");
  note.textContent = "";
  var sentences = [];
  var pop = wb["SP.POP.TOTL"], grow = wb["SP.POP.GROW"],
      rural = wb["SP.RUR.TOTL.ZS"], arable = wb["AG.LND.ARBL.ZS"];
  if (pop) {
    var s = "The population is approximately " + fmtNum(pop.value) +
            " (World Bank, " + pop.year + ")";
    if (grow) s += " and is growing " + grow.value.toFixed(1) + " per cent per year (" + grow.year + ")";
    sentences.push(s + ".");
  }
  if (rural && arable) {
    sentences.push(
      "Approximately " + rural.value.toFixed(0) + " per cent of the population lives in rural areas (" +
      rural.year + "); arable land is " + arable.value.toFixed(1) + " per cent of land area (" +
      arable.year + ")."
    );
  }
  sentences.forEach(function (t) {
    var li = document.createElement("li");
    li.textContent = t;
    note.appendChild(li);
  });
}

function fmtIndicator(code, v) {
  if (code === "NY.GDP.MKTP.CD") return "US$ " + fmtNum(v);
  if (code === "SP.POP.TOTL") return fmtNum(v);
  return v.toFixed(1) + "%";
}

function renderVulnerability(country, nd) {
  var el = document.getElementById("ndgainText");
  if (nd) {
    var vulnRank = ndGain.count + 1 - nd.rank;
    el.textContent =
      "On the ND-GAIN Country Index (" + ndGain.latest_year + "), " + country.name +
      " scores " + nd.score.toFixed(1) + ", placing it " + ordinal(vulnRank) +
      " most vulnerable of " + ndGain.count + " scored countries. A low score means " +
      "high vulnerability; a high score indicates greater readiness.";
  } else {
    el.textContent = "No ND-GAIN score is available for " + country.name +
      " in the bundled snapshot; see gain.nd.edu for the current index.";
  }

  var link = document.getElementById("ndcLink");
  link.textContent = "";
  var a = document.createElement("a");
  a.href = "https://unfccc.int/NDCREG?country=" + country.iso3;
  a.textContent = "Open " + country.name + "'s submission in the UNFCCC NDC Registry";
  a.rel = "noopener";
  link.appendChild(a);
}

function renderSources(sources) {
  var host = document.getElementById("sources");
  host.textContent = "";
  sources.forEach(function (s) {
    var li = document.createElement("li");
    li.appendChild(document.createTextNode(s.text + " "));
    var a = document.createElement("a");
    a.href = s.url;
    a.textContent = s.url;
    a.rel = "noopener";
    li.appendChild(a);
    host.appendChild(li);
  });
}

function renderGaps(gaps) {
  var el = document.getElementById("gaps");
  if (!gaps.length) { el.hidden = true; el.textContent = ""; return; }
  el.hidden = false;
  el.textContent = "Data caveats: " + gaps.join(" ");
}

/* ---------- init ---------- */

loadCountryList().catch(function () {
  // status already set by loadCountryList; keep the page usable for a retry
});
