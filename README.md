# ENSPEC Card Scanner — PWA

Offline-first business card & conference-badge scanner. React + Vite + TypeScript, deploys as a single Cloudflare Pages site (frontend + serverless API in one project). Installs to the iPhone home screen via Add-to-Home-Screen — no App Store, no Apple Developer account.

## Architecture

```
Browser (iPhone PWA)                Cloudflare Pages                       Google
┌────────────────────────────┐      ┌──────────────────────────┐           ┌────────────┐
│  Vite + React + Tailwind   │      │  Static dist/            │           │            │
│  Service worker (Workbox)  │─────▶│  + Pages Functions:      │──────────▶│ Gemini 2.0 │
│  Dexie (IndexedDB)         │      │    /api/extract          │           │  Flash     │
│  MediaDevices camera       │      │    /api/sync             │           └────────────┘
│  BarcodeDetector (badge)   │      │  Secrets in dashboard    │──────────▶ Email webhook
└────────────────────────────┘      └──────────────────────────┘           (SendGrid / etc.)
```

Single deployment. Same domain. No CORS. Secrets live in the Pages dashboard.

## Local dev

```bash
npm install
npm run dev                     # http://localhost:5173
```

For local end-to-end (camera + Pages Functions together) use Wrangler's Pages dev:

```bash
npx wrangler pages dev -- npm run dev
```

The camera + service worker require **HTTPS**. For iPhone testing on your LAN, build then preview:

```bash
npm run build && npm run preview -- --host
```

## Deploy (Cloudflare Pages)

### One-time

1. Push this repo to GitHub (already done).
2. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → pick this repo.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** *(leave empty)*
4. **Settings → Variables and Secrets:** add (encrypted)
   - `GEMINI_API_KEY`  ← from https://aistudio.google.com/app/apikey
   - `EMAIL_WEBHOOK_URL`  ← optional (SendGrid / Postmark / Make.com webhook URL)

### Every push

`git push` → Pages auto-deploys. Service worker auto-updates; team gets the new version on next launch.

### Custom domain

Pages → **Custom domains → Set up a custom domain** → `cards.enspec.com` (or whatever). Cloudflare provisions the TLS cert; team uses the friendly URL.

## Team install (60 seconds each)

> Open **https://cards.enspec.com** in Safari on your iPhone.
> Tap the Share icon → **Add to Home Screen** → Add.
> Open it from the home screen, grant camera permission, scan.

## Offline behaviour (iOS Safari)

| Action                              | Offline | Online |
|-------------------------------------|---------|--------|
| Open app                            | ✅ cached shell | ✅ |
| Capture card photo                  | ✅      | ✅     |
| AI extraction                       | ❌ queued (`needs-extraction`) | ✅ |
| Sync to email webhook               | ❌ queued (`pending`) | ✅ |
| Background sync while app is closed | ❌ (iOS doesn't allow) | — |

On reconnect or app re-open, the queue flushes automatically. Manual "Sync now" is always available in the status strip.

### iOS storage durability

On first use the app calls `navigator.storage.persist()`. Safari grants this after a few interactions. Without it, iOS can evict IndexedDB after ~2 weeks of non-use. The status strip shows a ⚠ when persistence hasn't been granted yet.

## Project layout

```
web-scanner/
├─ src/                       Frontend
│  ├─ main.tsx                Router bootstrap
│  ├─ App.tsx                 Status strip (online / pending / last synced / sync now)
│  ├─ routes/
│  │  ├─ Home.tsx             Scans list + Scan FAB
│  │  ├─ Scan.tsx             getUserMedia + guide frame + capture + BarcodeDetector
│  │  └─ Review.tsx           Confidence-heatmap edit form
│  ├─ components/             ConfidenceField, ModeToggle
│  ├─ db/index.ts             Dexie schema + CRUD
│  ├─ vision/extract.ts       Calls /api/extract
│  ├─ sync/queue.ts           Flush logic, exponential backoff
│  └─ hooks/                  useOnlineSync, usePersistentStorage
├─ functions/api/             Pages Functions (serverless)
│  ├─ extract.ts              POST /api/extract → Gemini 2.0 Flash
│  └─ sync.ts                 POST /api/sync → forwards to EMAIL_WEBHOOK_URL
├─ public/
│  └─ favicon.svg             (generate icon-192.png / icon-512.png before prod deploy)
├─ vite.config.ts             vite-plugin-pwa — manifest + Workbox
├─ tailwind.config.ts         Theme tokens (evolution of source repo palette)
└─ README.md
```

## Before going live — checklist

- [ ] In Pages dashboard: add `GEMINI_API_KEY` (encrypted) — required
- [ ] In Pages dashboard: add `EMAIL_WEBHOOK_URL` (encrypted) — optional, omit to test extraction without delivery
- [ ] Generate PWA icons (`icon-192.png`, `icon-512.png`, `icon-512-maskable.png`) into `public/` (e.g. realfavicongenerator.net)
- [ ] Trigger a redeploy after adding secrets (Pages → Deployments → Retry deployment)
- [ ] Custom domain set up (optional but nicer)
- [ ] Install on your own iPhone and do a full scan → offline → reconnect → sync cycle before sharing the URL

## Roadmap (independent next steps)

1. **Rectangle detection** via OpenCV.js or a TFJS segmentation model — replace manual shutter with auto-capture when the card is flat & in focus
2. **Image upload leg** in the sync pipeline so the original card photo ends up in the email alongside the JSON
3. **Duplicate detection** — hash (name, email) and flag dupes on the Home list
4. **Conflict resolution** — edit-after-sync → PATCH to the sync endpoint with `updated_at`
5. **Capacitor wrap** if you ever get an Apple Developer account: `npx cap add ios` → real background sync, haptics, no Safari eviction. Same codebase.
