# Henry Kim — Portfolio Site

A static, minimal portfolio. The homepage is plain HTML/CSS/JS hosted on
GitHub Pages; work images live in this same repo; the Google Sheet is the
only thing you edit to publish new work.

**To add a new piece of work later: add a row at the top of the Sheet
(under the header row) and drop the matching images into
`images/works/`. Nothing else needs to change.**

---

## File structure

```
├── index.html
├── css/style.css
├── js/app.js              ← one line to edit: SHEET_API_URL
├── images/
│   ├── logo/               (optional, for a future logo/favicon)
│   └── works/               ← all thumbnail + main images go here
├── apps-script/Code.gs      ← paste into the Sheet's Apps Script editor
└── CNAME.example            ← rename to CNAME once you have a domain
```

---

## Setup — do this once

### 1. Buy the domain (Porkbun)
1. Go to [porkbun.com](https://porkbun.com) and buy your domain.
2. Leave DNS settings as-is for now — you'll edit them in step 5.

### 2. Create the GitHub repo
1. Create a free GitHub account if you don't have one.
2. Create a new **public** repository (e.g. `portfolio`).
3. Upload everything in this folder to the repo (keep the folder structure).
4. In the repo: **Settings → Pages → Source**, select the `main` branch,
   root folder. Save. GitHub gives you a URL like
   `https://yourusername.github.io/portfolio/` — confirm the site loads
   (it'll be empty until step 4 is wired up).

### 3. Create the Google Sheet (your database)
1. Create a new Google Sheet, name it e.g. "Portfolio".
2. In row 1, add these exact column headers:

   | Category | Type | Title | Description | ThumbnailPath | MainContent |
   |---|---|---|---|---|---|

3. Add one row per piece of work, starting in row 2:
   - **Category** — `Design` or `Education`
   - **Type** — `image` or `video`
   - **Title** — the work's title
   - **Description** — a short write-up
   - **ThumbnailPath** — just the filename, e.g. `project1-thumb.jpg`
     (the file itself goes in `images/works/` in the repo)
   - **MainContent** —
     - if Type is `image`: filename(s) in `images/works/`. For a single
       image, just the filename, e.g. `project1.jpg`. For multiple
       images, separate filenames with commas — no external links, just
       the filenames, matching exactly what's in `images/works/`
       (case-sensitive, extension included):
       ```
       project1-a.jpg,project1-b.jpg,project1-c.jpg
       ```
       The order you list them in is the order they appear in the
       popup's image carousel.
     - if Type is `video`: the full YouTube or Vimeo URL

   **New work always goes in the row right under the header (row 2)** —
   the site shows the top row first, so newest work stays on top.

### 4. Turn the Sheet into a live JSON feed (Apps Script)
This is the "script added to the Sheet" step — it's what lets the static
site read the Sheet automatically, with nothing to re-run later.

1. In the Sheet: **Extensions → Apps Script**.
2. Delete any starter code, paste in the contents of `apps-script/Code.gs`.
3. Click **Deploy → New deployment**.
4. Click the gear icon next to "Select type" → choose **Web app**.
5. Set:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy**, authorize when prompted.
7. Copy the **Web app URL** it gives you (ends in `/exec`).
8. Open `js/app.js` in the repo, paste that URL as the value of
   `SHEET_API_URL` at the top of the file, commit.

Every future edit to the Sheet appears on the live site automatically —
you never need to touch this script again unless you change the column
headers.

### 5. Point the domain at GitHub Pages
1. In the repo, rename `CNAME.example` to `CNAME` and put your domain
   inside it (just the domain, e.g. `henrykim.design`), commit.
2. In Porkbun's DNS settings for your domain, add:
   - Four **A** records for `@` pointing to GitHub's IPs:
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - One **CNAME** record for `www` pointing to `yourusername.github.io`
3. Back in GitHub **Settings → Pages**, enter your custom domain and
   enable **Enforce HTTPS** once it's available (can take a few hours).

---

## Image specs

| | Recommended size | Format |
|---|---|---|
| Thumbnail | 800 × 600px (4:3) | JPG or WebP, optimized for web |
| Main image(s) | 1920px wide max | JPG or WebP, optimized for web |

Keep individual files under ~500KB where possible so the grid loads fast.

---

## Day-to-day use
- **New work:** add a row at the top of the Sheet + drop images into
  `images/works/` in the repo. No code edits.
- **Change the nav, name, manifesto, or layout:** edit `index.html` /
  `css/style.css` directly and commit.
- **Add a logo/favicon:** drop it in `images/logo/` and reference it from
  `index.html`.
