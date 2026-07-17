# M. Omar Farooq — Personal Site ("The Atelier")

A four page static site: Index (about + CV), Projects, Blog, Contact.
Plain HTML/CSS/JS, no build step, ready for GitHub Pages.

Design system: charcoal ground, bone type, a single copper accent,
an isometric platform-stack diagram in the hero, and a connected
timeline spine running through the career history. Built to read
like a premium architecture studio's site rather than a generic
CV template.

## File structure

```
index.html          About + full CV
projects.html        Six platform case studies
blog.html             Blog listing
blog/
  governance-first-architecture.html   First post (live example)
contact.html          Contact + CV download
css/style.css          Shared design system
js/main.js              Mobile nav toggle
assets/Omar_Farooq_CV.pdf   Downloadable CV
```

## Deploy to GitHub Pages

1. Create a new GitHub repository. If you want the site at
   `https://<your-username>.github.io`, name the repo exactly
   `<your-username>.github.io`. Otherwise any repo name works and the
   site will publish at `https://<your-username>.github.io/<repo-name>`.

2. Push these files to the repository root:

   ```
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```

3. In the repo, go to **Settings → Pages**. Under "Build and
   deployment," set Source to **Deploy from a branch**, branch
   **main**, folder **/ (root)**. Save.

4. GitHub will publish the site within a minute or two at the URL
   shown on that same settings page.

5. Optional: for a custom domain, add a `CNAME` file at the repo root
   containing just your domain, then point your domain's DNS at
   GitHub Pages per GitHub's custom domain docs.

## Adding a new blog post

1. Copy `blog/governance-first-architecture.html` to a new file in
   `blog/`, e.g. `blog/your-post-slug.html`.
2. Replace the title, meta description, kicker, heading, and body
   copy. Keep the `post-meta` line and the header/footer/nav blocks
   as they are.
3. Add a new entry near the top of `blog.html`, above the existing
   `post-card` links:

   ```html
   <a class="post-card" href="blog/your-post-slug.html">
     <p class="post-meta">Category · N min read</p>
     <h2>Your title</h2>
     <p>One or two sentence summary.</p>
   </a>
   ```
4. To convert a "Coming soon" placeholder into a real post, remove
   its `draft` class and `aria-disabled` attribute, and give it a
   real `href`.

## Updating the CV

Replace `assets/Omar_Farooq_CV.pdf` with a new export, keeping the
filename the same, or update the links in every page's footer and on
`contact.html` to match a new filename.

## Notes on the design

Two other directions were explored and set aside: a light "engineering
blueprint" system (grid paper, teal accent) and an ivory "institutional
dossier" system (emerald ink, brass seal). This final version, "The
Atelier," was the one selected: a warm charcoal ground with bone type
and a single copper signal color, built around an isometric diagram of
a platform stack (interface, API, data, infrastructure) as the visual
signature, and a connected vertical spine for the career timeline that
reinforces "systems that connect" as the through-line of the whole site.

Typefaces: Piazzolla (italic serif, display), Manrope (sans, body),
JetBrains Mono (labels and metadata), all loaded from Google Fonts.
If you deploy somewhere without internet access to Google Fonts,
download the families and self host them in a new `fonts/` folder,
then update the `@font-face` rules in `css/style.css` accordingly.
