# ENSPEC Card Scanner — PWA

Offline-first business card & conference-badge scanner. React + Vite + TypeScript, deploys as a static site + a Cloudflare Worker proxy. Installs to the iPhone home screen via Add-to-Home-Screen — no App Store, no Apple Developer account.

## Architecture

```
Browser (iPhone PWA)                   Cloudflare Worker                 Google
┌────────────────────────────┐         ┌──────────────────────┐          ┌────────────┐
│  Vite + React + Tailwind   │         │  /api/extract        │──────────▶ Gemini 2.0 │
│  Service worker (Workbox)  │────────▶│  /api/sync           │          │  Flash     │
│  Dexie (IndexedDB)         │         │  (API keys here)     │          └────────────┘
│  MediaDevices camera       │◀────────│  forwards sync to →  │──────────▶ SendGrid /  │
│  BarcodeDetector (badge)   │         │                      │          │  Postmark /  │
└────────────────────────────┘         └──────────────────────┘          │  Make       │
        │                                                                 └────────────┘
        ▼
   App shell + contacts cached locally; flushes queue on reconnect / foreground / 60s heartbeat.
```

## Local dev

```bash
cd web-scanner
npm install
cp .env.example .env.local      # edit if Worker already deployed; otherwise leave as-is for now
npm run dev                     # http://localhost:5173
```

The camera + service worker require **HTTPS**. For iPhone testing on your local network, use:

```bash
npx vite --host --https
```

or preview a production build: `npm run build && npm run preview`.

## Deploy — one-time setup (~30 minutes)

### 1. Deploy the Cloudflare Worker

```bash
cd worker
npx wrangler login
npx wrangler secret put GEMINI_API_KEY        # from https://aistudio.google.com/app/apikey
npx wrangler secret put EMAIL_WEBHOOK_URL     # your SendGrid/Postmark/Make webhook (optional)
npx wrangler deploy gemini-proxy.ts
```

You'll get a URL like `https://card-scanner-proxy.<you>.workers.dev`. Put it in `.env.local`:

```
VITE_EXTRACT_ENDPOINT=https://card-scanner-proxy.<you>.workers.dev/api/extract
VITE_SYNC_ENDPOINT=https://card-scanner-proxy.<you>.workers.dev/api/sync
```

### 2. Deploy the web app (pick one)

**Cloudflare Pages** (recommended — co-located with the Worker):
```bash
npx wrangler pages deploy dist --project-name=card-scanner
```

**Vercel**: `npx vercel --prod` after `npm run build`.

**Netlify**: drag-and-drop the `dist/` folder in the Netlify dashboard.

You'll get a URL like `https://card-scanner.pages.dev`. Add a custom domain (`cards.enspec.com`) via DNS.

### 3. Team install (60 seconds each)

Send the team this message:

> Open **https://cards.enspec.com** in Safari on your iPhone.
> Tap the Share icon → **Add to Home Screen** → Add.
> Open it from the home screen, grant camera permission, start scanning.

## Offline behaviour (iOS Safari)

| Action                | Offline | Online |
|-----------------------|---------|--------|
| Open app              | ✅ cached shell | ✅ |
| Capture card photo    | ✅      | ✅     |
| AI extraction         | ❌ queued (`needs-extraction`) | ✅ |
| Sync to email webhook | ❌ queued (`pending`) | ✅ |
| Background sync while app is closed | ❌ (iOS doesn't allow) | — |

On reconnect or app re-open, the queue flushes automatically. Manual "Sync now" button is also always available in the status strip.

### iOS storage durability

On first use the app calls `navigator.storage.persist()`. Safari grants this after a few interactions. Without it, iOS can evict IndexedDB after ~2 weeks of non-use. The status strip shows a ⚠ if persistence hasn't been granted yet.

## Updating the app

```bash
git push
```

Cloudflare Pages redeploys on push. Team members pick up the new version on their next app launch (service worker auto-updates, reload applies it). No App Store review.

## Project layout

```
web-scanner/
├─ src/
│  ├─ main.tsx             Router bootstrap
│  ├─ App.tsx              Status strip (online / pending / last synced / sync now)
│  ├─ index.css            Tailwind + glass utility classes
│  ├─ routes/
│  │  ├─ Home.tsx          Scans list + big Scan FAB
│  │  ├─ Scan.tsx          getUserMedia + guide frame + capture + BarcodeDetector
│  │  └─ Review.tsx        Confidence-heatmap edit form
│  ├─ components/
│  │  ├─ ConfidenceField.tsx   Orange-highlighted low-confidence input
│  │  └─ ModeToggle.tsx        Card ↔ Badge pill
│  ├─ db/index.ts          Dexie schema + CRUD
│  ├─ vision/extract.ts    Extraction client (calls /api/extract)
│  ├─ sync/queue.ts        Flushes pending + needs-extraction, backs off on failure
│  └─ hooks/
│     ├─ useOnlineSync.ts       Liveness + auto-flush triggers
│     └─ usePersistentStorage.ts  Requests `navigator.storage.persist()`
├─ worker/
│  ├─ gemini-proxy.ts      Cloudflare Worker — Gemini 2.0 Flash proxy + sync forwarder
│  └─ wrangler.toml
├─ public/
│  └─ favicon.svg          (generate icon-192.png / icon-512.png before prod deploy)
├─ vite.config.ts          vite-plugin-pwa — manifest + Workbox
├─ tailwind.config.ts      Theme tokens (evolution of source repo palette)
└─ README.md
```

## Before first prod deploy — checklist

- [ ] Deploy the Worker and set `GEMINI_API_KEY` + `EMAIL_WEBHOOK_URL` secrets
- [ ] Put Worker URL in `.env.local` (VITE_EXTRACT_ENDPOINT + VITE_SYNC_ENDPOINT)
- [ ] Generate PWA icons (`icon-192.png`, `icon-512.png`, `icon-512-maskable.png`) into `public/`
- [ ] Set a custom domain so team members don't type a workers.dev URL
- [ ] `npm run build` then deploy `dist/`
- [ ] Install on your own iPhone and do a full scan → offline → reconnect → sync cycle before handing out the URL

## Roadmap (independent next steps)

1. **Rectangle detection** via OpenCV.js or a TFJS segmentation model — replace manual shutter with auto-capture when card is flat & in focus
2. **Image upload leg** in the sync pipeline so the original card photo ends up in the email alongside the JSON
3. **Duplicate detection** — hash (name, email) and flag dupes on the Home list
4. **Conflict resolution** — edit-after-sync → PATCH to the sync endpoint with `updated_at`
5. **Capacitor wrap** if you ever get an Apple Developer account: `npx cap add ios` → real background sync, haptics, no Safari eviction. Same codebase.
