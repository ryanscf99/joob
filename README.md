# jOOB — Macau youth job buddy

**jOOB** (*Jobs Out Of the Blue*) is a bilingual (EN / 繁中) pilot web app that narrows **asymmetric information** between Macau youth job seekers and employers — with a ginger-cat theme, Cat TV breaks, open-data labour signals, and smart CV match.

Built for the **Macau Job Problem** research project.

---

## Share with a friend (one-click public URL)

The easiest way to give someone a link that **works without your laptop**:

### A. Deploy to Vercel (recommended)

#### 1) Put the project on GitHub

```bash
cd "/Users/ryanfong/Desktop/Macau Research Project/Macau Job Problem"

# First time only
git init
git add .
git commit -m "jOOB: Macau youth job platform"

# Create a new empty repo on github.com, then:
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/joob.git
git push -u origin main
```

#### 2) Slim media before the first push (important)

Local Cat TV can be **hundreds of MB**. Free Vercel deploys often fail if the whole video pack is uploaded.

```bash
# Keeps front_video + smaller clips (~45 MB). Full clips stay in media-local/ on your Mac.
npm run media:slim

git add public/videos src/lib/cat-gallery.ts
git commit -m "Slim media for Vercel deploy"
git push
```

Restore full local videos anytime:

```bash
npm run media:restore
```

#### 3) Connect Vercel

1. Go to **[vercel.com](https://vercel.com)** → Sign in with **GitHub**
2. **Add New Project** → import `joob` (or your repo name)
3. Framework: **Next.js** (auto-detected)
4. (Optional) Environment variables:
   - `XAI_API_KEY` = your key from [console.x.ai](https://console.x.ai)  
     (enables Grok AI match / job advice; without it, heuristic match still works)
5. Click **Deploy**

When the build finishes you get a URL like:

```text
https://joob-xxxx.vercel.app
```

Send that link to friends. Every `git push` to `main` redeploys automatically.

#### One-click button (after the repo is public)

Replace `YOUR_USERNAME/joob` with your real GitHub path, then put this in a page or just open it:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR_USERNAME%2Fjoob&env=XAI_API_KEY&envDescription=Optional%20xAI%20key%20for%20Grok%20AI%20matching&project-name=joob&repository-name=joob)

Or open:

```text
https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/joob
```

#### CLI alternative (no dashboard)

```bash
npm i -g vercel
cd "/Users/ryanfong/Desktop/Macau Research Project/Macau Job Problem"
npm run media:slim   # first time
vercel             # follow prompts → preview URL
vercel --prod      # production URL
```

---

### B. Same Wi‑Fi only (no deploy)

1. Double-click **`start.command`**
2. Terminal prints a **Share (same Wi‑Fi)** line like `http://192.168.x.x:3000`
3. Friend opens that URL on the same network

Your Mac must stay on and the terminal must keep running.

### C. Temporary public tunnel (no GitHub)

1. Double-click **`start.command`** (leave it open).  
2. Double-click **`share-tunnel.command`**.  
3. Share the printed HTTPS URL with your friend.

Uses **Cloudflare Tunnel** if `cloudflared` is installed (`brew install cloudflared`); otherwise free **localtunnel** (often slower).

**Why tunnels feel slow:** every photo/video is proxied over the internet. The app **lazy-loads** cat media so the first screen opens faster; for a consistently snappy share link, use **Vercel (section A)**.

---

## Local start (you)

### Easiest (macOS)

1. Finder → this project folder  
2. Double-click **`start.command`**  
3. Chrome opens **http://localhost:3000** automatically  

If macOS blocks it: right-click → **Open**.

### Terminal

```bash
cd "/Users/ryanfong/Desktop/Macau Research Project/Macau Job Problem"
./start.sh
# or
npm run dev
```

```bash
npm run build   # production build (also regenerates media list)
npm start       # serve production build
```

---

## What it does

| Module | Purpose |
|--------|---------|
| **Jobs** | DSAL official + Jobscall + platform listings, pay benchmarks, workforce transparency |
| **Smart Match** | CV / profile match (Grok when `XAI_API_KEY` is set, else rules) |
| **Labour Dashboard** | Open-data style observatory + DSAL A3 group totals |
| **Profile** | Youth profile, CV upload, parental consent flag |
| **Cat TV** | Break-room cat clips while job hunting |

---

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind** — ginger-orange jOOB theme
- **Recharts** — dashboard
- **xAI Grok** (optional) — AI job advice / match
- **localStorage** — profiles & applications in the browser

---

## Environment

Copy `.env.example` → `.env.local` for local AI:

```bash
cp .env.example .env.local
# edit XAI_API_KEY=
```

On Vercel: **Project → Settings → Environment Variables** → add `XAI_API_KEY`.

---

## Media scripts

| Command | What it does |
|---------|----------------|
| `npm run media:list` | Rebuild `src/lib/cat-gallery.ts` from `public/cats` + `public/videos` |
| `npm run media:slim` | Archive heavy videos to `media-local/` for a Vercel-friendly deploy |
| `npm run media:restore` | Move archived videos back into `public/videos` |

`pic/` (original camera files) is **gitignored**; web-ready copies live under `public/`.

---

## Suggested demo flow

1. Toggle **中文 / EN**
2. Home — front cat video + meow lounge  
3. **Jobs** — open a card (cat buddy photo on each ad)  
4. **Smart Match** — upload CV / demo profile  
5. **Cat TV** (bottom-right) — Prev / Next clips  
6. Share your **Vercel URL** with a friend  

---

## Project notes

- Complements DSAL / DSEDJ services; **not** an official government portal.  
- Open-data series are labelled benchmarks / samples, not live feeds unless noted.  
- Research pilot under **Macau Job Problem**.

---

## Production accounts and data

jOOB supports two modes:

- **Local demo:** no Supabase variables; profile, saves, and applications remain on the device.
- **Production:** Supabase Auth + Postgres; each seeker can access only their own rows through row-level security.

To enable production mode:

1. Create a Supabase project.
2. Run `supabase/migrations/202607140001_job_seeker_foundation.sql`.
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Add `http://localhost:3000/auth/callback` and the deployed callback URL to Supabase Auth redirect URLs.

CV parsing stores only structured features in the seeker profile by default. The original upload and full extracted text are not persisted. Signed-in users can export or delete seeker data from the Profile page.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run test:cv
npm run test:e2e
npm run build
```

The deterministic rules engine remains available without `XAI_API_KEY`; AI reranking is supplementary and shows its contribution separately.
