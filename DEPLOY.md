# Deploy jOOB in 5 minutes

## Goal

A public URL you can text to a friend, e.g. `https://joob.vercel.app`.

## Checklist

1. **GitHub account** — [github.com](https://github.com)
2. **Vercel account** — [vercel.com](https://vercel.com) (sign in with GitHub)
3. **This project** on your Mac

## Steps

### 1. Slim videos (once)

Heavy Cat TV files can block free deploys:

```bash
cd "/Users/ryanfong/Desktop/Macau Research Project/Macau Job Problem"
npm run media:slim
```

This keeps `front_video.mp4` + smaller clips. Full clips stay in `media-local/videos/` on your Mac only.

### 2. Push to GitHub

```bash
git init   # if not already a repo
git add .
git status   # confirm pic/ and media-local/ are NOT listed
git commit -m "Deploy jOOB"
```

Create an empty repo on GitHub (no README), then:

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/joob.git
git push -u origin main
```

### 3. Import on Vercel

1. [vercel.com/new](https://vercel.com/new)
2. Import the `joob` repo  
3. Leave defaults (Next.js)  
4. Optional: add env `XAI_API_KEY`  
5. **Deploy**

### 4. Share

Copy the production URL from the Vercel dashboard → send to friends.

### Later updates

```bash
git add .
git commit -m "Update jOOB"
git push
```

Vercel redeploys automatically.

## Restore full Cat TV on your Mac

```bash
npm run media:restore
npm run dev
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails / upload too large | Run `npm run media:slim` again with a tighter budget: `npm run media:slim -- --budget 30` then commit & push |
| AI match says no key | Add `XAI_API_KEY` in Vercel → Settings → Environment Variables → Redeploy |
| Friend can't open localhost | Use the **Vercel** URL, not `localhost` |
| Same Wi‑Fi only needed | Use `start.command` and the LAN IP printed in the terminal |

## Optional: custom domain

Vercel → Project → Settings → Domains → add e.g. `joob.yourdomain.com`.
