# Project Workflow — Digital CV (ahaomar.github.io)

This is Omar Farooq's personal digital CV site, hosted on GitHub Pages at https://ahaomar.github.io/
Static HTML/CSS/JS only. No backend, no database. All data fetched client-side from open-CORS APIs.

## Site structure

- Main pages: `index.html`, `projects.html`, `skills.html`, `blog.html`, `contact.html`, `dashboards.html`
- Dashboards: `dashboards/<source>/<dashboard-name>/index.html`
  - Sources used: `worldbank/`, `unhcr/`, `unfccc/`, `owid/`, `openmeteo/`
- Each dashboard MUST have its own folder structure:
  - `index.html` (no inline CSS or JS)
  - `css/style.css` (per-dashboard stylesheet)
  - `js/app.js` (per-dashboard JavaScript)
  - The site-wide `css/style.css` is still linked for topbar/nav: `<link rel="stylesheet" href="../../../css/style.css">`
- Blog posts: `blog/<post-slug>.html`, listed in `blog.html`
- LinkedIn posts: `linkedinpost/post-N-<dashboard-name>.txt`
- Ideas archive: `dashboards/CLIMATE_DASHBOARD_IDEAS.txt`
- SEO: `sitemap.xml` + `robots.txt` in root

## MANDATORY workflow when creating ANY new dashboard or blog post

When the user asks for a new dashboard (or blog post), ALWAYS do ALL of the following:

1. **Build the dashboard/blog post** following the existing structure (separate css/js, no inline)
2. **Add it to the listing page** — `dashboards.html` (provenance table + entries list format) or `blog.html`
3. **Write a LinkedIn post** — save to `linkedinpost/post-N-<name>.txt` in the established format:
   - Header line with title + target audience
   - Hook opening (verified data figure)
   - What the dashboard shows (bullets)
   - Key data findings (computed/verified from actual data, never invented)
   - Live-data / no-backend architecture note
   - Dashboard URL (https://ahaomar.github.io/dashboards/...)
   - Relevant hashtags (10, matched to audience: UN/IOM/climate/data communities)
4. **Update `sitemap.xml`** — add the new URL with appropriate priority:
   - Dashboards: priority 0.9, weekly
   - Blog posts: priority 0.6, yearly
   - Bump `lastmod` dates on updated pages
5. **Verify before finishing**: `node --check` on JS files, test with `python3 -m http.server`, and verify data sources actually work (CORS + data present) before writing posts about them

## Verified working data sources (as of Sep 2026)

- World Bank Indicators API — `api.worldbank.org/v2` (remittances, ODA, displacement, climate exposure)
  - NOTE: `EN.ATM.CO2E.*` indicators are ARCHIVED (removed from API)
- UNHCR Population Statistics API — `api.unhcr.org/population/v1` (use `coo=`/`coa=` comma-separated ISO3 batches of ~120, `yearFrom`/`yearTo` params)
- Our World in Data grapher CSVs — `ourworldindata.org/grapher/<slug>.csv` (open CORS)
  - Verified slugs: `annual-co2-emissions-per-country`, `temperature-anomaly`, `methane-emissions`
  - NOTE: OWID renames slugs (301 without CORS = browser NetworkError). Use fetchFirstWorking() with fallback URLs. `cumulative-co2-emissions` → now `cumulative-co-emissions`, `co2-emissions-per-capita` → now `co-emissions-per-capita`
- Open-Meteo — `archive-api.open-meteo.com` (ERA5 since 1940) + `geocoding-api.open-meteo.com` (free, no key)

## Known dead sources (do not use)

- UNFCCC documents API — bot-walled (Incapsula)
- ReliefWeb — requires registered appname now
- WHO GHO — not responding
- World Bank CO2 indicators (EN.ATM.CO2E.*) — archived

## Dashboard design conventions

- Cobalt theme design tokens (oklch colors) in per-dashboard `css/style.css`
- Masthead + kicker + standfirst + meta-strip stats
- Timeline year slider with Play button (auto-advance ~1.6-1.8s/year)
- Panels with panel-head, auto-generated takeaways computed live from data
- Footer: Data Sources & Methodology + colophon
- All figures in LinkedIn posts and takeaways must be verified from the actual API data before publishing

## User preferences

- User communicates in English; keep responses concise
- Never invent data figures — always verify against live API responses first
- Push/commit only when explicitly asked
- COP naming: COP31 is Antalya, Türkiye, Nov 2026. COP17 was Durban 2011 (user initially said COP17 when meaning current COP)
- This model (z-ai/glm) does not support image input — diagnose styling issues from code, not screenshots
