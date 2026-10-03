# SEO Checklist — ahaomar.github.io

Completed on 3 October 2026. Manual follow-ups and maintenance notes below.

## What was implemented (automated)

- **Self-hosted fonts** — `css/fonts.css` + `assets/fonts/*.woff2` (variable, latin subset, ~102 KB total). Google Fonts requests removed from every page. Two fonts preloaded above the fold.
- **Render-blocking chain fixed** — `@import` removed from `css/style.css`; dashboard pages now link `tokens.css` directly.
- **Scripts deferred** — `main.js`, Chart.js and Leaflet now load with `defer` (SRI hashes computed and pinned on every CDN script).
- **Favicon set** — `favicon.ico` shrunk 185 KB → 15 KB, plus `favicon-32x32.png` and `assets/apple-touch-icon.png`, linked in every head.
- **Project screenshots** — all 9 PNGs converted to WebP (16.8 MB → 1.4 MB) and served via `<picture>` with PNG fallback.
- **Structured data** — JSON-LD on every page: `ProfilePage`/`Person`/`WebSite` (home), `CollectionPage`/`WebPage` + `BreadcrumbList` (projects, skills, dashboards, contact, blog, all 19 dashboard pages), `Blog` (blog index), `Article` (posts).
- **Social cards** — `assets/og-image.png` (1200×630) + `og:image`, `twitter:card summary_large_image` on all pages.
- **Sitemap** — all 29 URLs, lastmod refreshed to 2026-10-03.
- **Minified copies** — `css/style.min.css`, `css/tokens.min.css`, `js/main.min.js`. Sources stay readable.

## Only you can do these (highest ranking impact)

1. **Google Search Console** (search.google.com/search-console — property already verified via meta tag):
   - Submit `https://ahaomar.github.io/sitemap.xml`
   - URL Inspection → request indexing for `index.html`, `projects.html`, `dashboards.html`, and your 2–3 best dashboards
2. **Backlinks** — the strongest ranking lever for a personal site:
   - Add the site URL to your LinkedIn profile (Featured section + contact info) and GitHub profile README
   - Link it from your published agent skills (skills.sh listings) and any UN community profiles
   - Each dashboard already carries a canonical URL — share those links on LinkedIn (the drafts in `linkedinpost/` do this)
3. **Bing Webmaster Tools** — import from Search Console in one click; Bing powers DuckDuckGo and Yahoo.

## Keyword positioning (per page)

| Page | Primary target |
|------|----------------|
| Home | Omar Farooq, platform architect Drupal, UN digital platforms |
| projects.html | UN Drupal projects, IOM platform architecture, migration data systems |
| skills.html | Drupal architect skills, AI systems, PHP Symfony UN |
| dashboards.html | UN data dashboards, migration data visualisation, World Bank API dashboards |
| Individual dashboards | their topic (e.g. "undernourishment dashboard", "remittances vs ODA") |
| blog posts | their topic, linked from relevant dashboards |

Rankings depend on content depth, age and backlinks — not on any code change. Internal links between dashboards, case studies and posts (already present in the dashboard colophons and project pages) are how topical authority builds.

## Maintenance

- After editing `css/style.css`, `css/tokens.css` or `js/main.js`, regenerate the minified copies:
  `npx esbuild css/style.css --minify --outfile=css/style.min.css` (same for tokens.css and js/main.js)
- After publishing new dashboards/posts: add to `dashboards.html`/`blog.html`, add to `sitemap.xml`, bump lastmod.
- Re-request indexing in Search Console after major content updates.
- If you change CDN script versions, recompute the SRI hash:
  `curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A`
