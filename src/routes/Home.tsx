// Home — single-screen scanner + recent scans, matching the Variant design.
//
// • The scanner card embeds a live camera preview (started on first user tap
//   to satisfy iOS Safari's autoplay/permission rules).
// • "Capture Output" snaps the current frame, crops to ID-1 aspect, persists
//   to IndexedDB, calls /api/extract if online (or queues if not), then
//   navigates to /review/:id.
// • Recent Scans live below the card and update reactively from Dexie.
// • Mode toggle flips between Business Card (Vision AI) and Conference Badge
//   (BarcodeDetector watching the same video stream).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { dbx, insertContact, type Contact } from '@/db';
import { extractFromBlob } from '@/vision/extract';
import { flushPending } from '@/sync/queue';
import { ModeToggle, type Mode } from '@/components/ModeToggle';

const CARD_ASPECT = 1.586;

export default function Home() {
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>('card');
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastBadgeRef = useRef<string | null>(null);

  const rows = useLiveQuery(
    () => dbx.contacts.orderBy('createdAt').reverse().limit(50).toArray(),
    [],
    [],
  );

  // Stop camera on unmount.
  useEffect(() => () => stopCamera(), []);

  const startCamera = useCallback(async () => {
    if (cameraOn || streamRef.current) return;
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraOn(true);
    } catch (e: any) {
      setErr(e?.message ?? 'Camera unavailable. Grant permission in Settings → Safari.');
    }
  }, [cameraOn]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  // Badge mode poll — runs only when camera is live and mode is 'badge'.
  useEffect(() => {
    if (!cameraOn || mode !== 'badge') return;
    // @ts-expect-error BarcodeDetector not in lib.dom in some TS versions
    if (typeof BarcodeDetector === 'undefined') return;
    // @ts-expect-error
    const detector = new BarcodeDetector({
      formats: ['qr_code', 'code_128', 'data_matrix', 'pdf417', 'aztec'],
    });
    let raf = 0;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (videoRef.current && videoRef.current.readyState >= 2) {
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length) {
            const value = codes[0].rawValue as string;
            if (value && value !== lastBadgeRef.current) {
              lastBadgeRef.current = value;
              await handleBadge(value);
              return;
            }
          }
        } catch {/* noop */}
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [cameraOn, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const capture = useCallback(async () => {
    if (busy) return;
    if (!cameraOn) {
      // First tap turns the camera on — iOS gesture rule.
      await startCamera();
      return;
    }
    if (!videoRef.current || !canvasRef.current) return;
    setBusy(true);
    setErr(null);
    try {
      const v = videoRef.current;
      const vw = v.videoWidth, vh = v.videoHeight;
      if (!vw || !vh) throw new Error('Camera not ready — give it a moment.');

      const cropW = vw;
      const cropH = Math.round(cropW / CARD_ASPECT);
      const originY = Math.max(0, Math.round((vh - cropH) / 2));

      const c = canvasRef.current;
      c.width = Math.min(2000, cropW);
      c.height = Math.round(c.width / CARD_ASPECT);
      c.getContext('2d')!.drawImage(v, 0, originY, cropW, cropH, 0, 0, c.width, c.height);

      const blob = await new Promise<Blob>((res, rej) =>
        c.toBlob((b) => (b ? res(b) : rej(new Error('blob failed'))), 'image/jpeg', 0.9),
      );

      let row;
      if (navigator.onLine) {
        try {
          const r = await extractFromBlob(blob);
          row = await insertContact({
            mode: 'card',
            imageBlob: blob,
            ...r.fields,
            confidence: r.confidence,
            rawText: r.rawText,
            syncStatus: 'pending',
          });
          flushPending().catch(() => {});
        } catch {
          row = await insertContact({ mode: 'card', imageBlob: blob, syncStatus: 'needs-extraction' });
        }
      } else {
        row = await insertContact({ mode: 'card', imageBlob: blob, syncStatus: 'needs-extraction' });
      }
      nav(`/review/${row.id}`);
    } catch (e: any) {
      setErr(e?.message ?? 'Capture failed');
    } finally {
      setBusy(false);
    }
  }, [busy, cameraOn, nav, startCamera]);

  const handleBadge = useCallback(async (raw: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const parsed = parseBadge(raw);
      const row = await insertContact({
        mode: 'badge',
        imageBlob: null,
        rawText: raw,
        confidence: { name: 1, title: 1, company: 1, email: 1, phone: 1, website: 1, notes: 0 },
        syncStatus: 'pending',
        ...parsed,
      });
      flushPending().catch(() => {});
      nav(`/review/${row.id}`);
    } finally {
      setBusy(false);
    }
  }, [busy, nav]);

  return (
    <div className="shell pb-32">
      {/* Mode toggle */}
      <div className="mt-1 mb-4">
        <ModeToggle mode={mode} onChange={(m) => { setMode(m); setErr(null); }} />
      </div>

      {/* Scanner card */}
      <section className="card p-5">
        <p className="text-[12px] text-ink-2 mb-1.5">{cameraOn ? 'Live preview' : 'Ready to scan'}</p>
        <h1 className="font-display font-extrabold text-[40px] leading-[1.05] tracking-tight mb-4">
          {mode === 'card' ? 'Point Camera' : 'Scan Badge'}
        </h1>

        {/* Preview area: dashed placeholder when off, live video when on */}
        <button
          onClick={startCamera}
          disabled={cameraOn}
          className="relative block w-full rounded-xl2 overflow-hidden border-2 border-dashed border-hairline-2 bg-bg-2 aspect-[16/10] disabled:cursor-default"
          aria-label={cameraOn ? 'Live camera preview' : 'Tap to start camera'}
        >
          <video
            ref={videoRef}
            playsInline muted autoPlay
            className={`w-full h-full object-cover ${cameraOn ? 'opacity-100' : 'opacity-0'} transition-opacity`}
          />
          {!cameraOn && <PlaceholderDots />}
          {cameraOn && mode === 'card' && <GuideOverlay />}
        </button>
        <canvas ref={canvasRef} className="hidden" />

        {err && <p className="mt-3 text-[12px] text-warn">{err}</p>}
        {!navigator.onLine && (
          <p className="mt-3 text-[11px] uppercase tracking-wider text-warn">Offline — will extract when online</p>
        )}

        {/* Capture row */}
        <div className="mt-4 flex items-center gap-2.5">
          <button
            onClick={capture}
            disabled={busy || mode === 'badge'}
            className="flex-1 flex items-center justify-center gap-2 rounded-full bg-accent text-white font-semibold py-3.5 shadow-cta active:scale-[0.99] transition disabled:opacity-50"
          >
            {busy ? (
              <Spinner />
            ) : (
              <>
                <CloudUpIcon /> {cameraOn ? 'Capture Output' : mode === 'badge' ? 'Tap preview to start' : 'Start camera'}
              </>
            )}
          </button>
          <button
            onClick={cameraOn ? stopCamera : () => nav('/scans')}
            aria-label="More"
            className="w-12 h-12 rounded-2xl border border-hairline bg-card flex items-center justify-center text-ink hover:bg-bg-2 transition"
          >
            <ArrowIcon />
          </button>
        </div>
      </section>

      {/* Recent scans */}
      <div className="mt-7 mb-2 flex items-baseline justify-between">
        <h2 className="text-[13px] text-ink-2 font-medium">Recent Scans</h2>
        <span className="text-[12px] text-ink-3">{currentDateLabel()}</span>
      </div>

      {rows && rows.length === 0 ? (
        <div className="card p-5 text-center">
          <p className="text-ink-2 text-sm">No scans yet — tap above to capture your first card.</p>
        </div>
      ) : (
        <ul className="space-y-2">{rows?.map((r) => <ScanRow key={r.id} r={r} />)}</ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ScanRow({ r }: { r: Contact }) {
  const nav = useNavigate();
  const initials = computeInitials(r);
  const av = avatarTone(initials);
  return (
    <li>
      <button
        onClick={() => nav(`/review/${r.id}`)}
        className="w-full text-left card px-4 py-3 flex items-center gap-3.5 active:scale-[0.995] transition"
      >
        <span
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-[13px] shrink-0"
          style={{ backgroundColor: av }}
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ink font-semibold truncate">{r.name || 'Untitled'}</p>
          <p className="text-ink-2 text-[13px] truncate">
            {[r.title, r.company].filter(Boolean).join(', ') ||
              (r.mode === 'badge' ? 'Conference Badge' : r.email || r.phone || '—')}
          </p>
        </div>
        <span className="text-ink-3 text-[12px] shrink-0">{relativeTime(r.createdAt)}</span>
      </button>
    </li>
  );
}

function PlaceholderDots() {
  // Decorative cluster of soft circles centered in the dashed box.
  const dots = [
    { x: '38%',  y: '40%', c: '#D7CCEF' },
    { x: '50%',  y: '40%', c: '#C7C2BB' },
    { x: '62%',  y: '40%', c: '#C7C2BB' },
    { x: '38%',  y: '60%', c: '#C7C2BB' },
    { x: '50%',  y: '60%', c: '#D7CCEF' },
    { x: '62%',  y: '60%', c: '#C7C2BB' },
  ];
  return (
    <div className="absolute inset-0">
      {dots.map((d, i) => (
        <span
          key={i}
          className="absolute w-4 h-4 rounded-full"
          style={{ left: d.x, top: d.y, backgroundColor: d.c, transform: 'translate(-50%,-50%)' }}
        />
      ))}
    </div>
  );
}

function GuideOverlay() {
  const cls = 'absolute w-5 h-5 border-2 border-accent';
  return (
    <div className="absolute inset-3 pointer-events-none">
      <span className={`${cls} top-0 left-0 border-r-0 border-b-0 rounded-tl-md`} />
      <span className={`${cls} top-0 right-0 border-l-0 border-b-0 rounded-tr-md`} />
      <span className={`${cls} bottom-0 left-0 border-r-0 border-t-0 rounded-bl-md`} />
      <span className={`${cls} bottom-0 right-0 border-l-0 border-t-0 rounded-br-md`} />
    </div>
  );
}

function CloudUpIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 18a4 4 0 0 1-1-7.9A6 6 0 0 1 18 9.5 4.5 4.5 0 0 1 17.5 18H7Z" />
      <path d="M12 12v6m0-6 3 3m-3-3-3 3" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 animate-spin" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---- helpers --------------------------------------------------------------

function computeInitials(r: Contact): string {
  const src = r.name || r.company || r.email || '??';
  const parts = src.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

const TONES = ['#F4A261', '#7AA1E1', '#52B6A4', '#E07A8B', '#B19CE0', '#9AA0A6'];
function avatarTone(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

function relativeTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5)    return 'Just now';
  if (s < 60)   return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); if (d < 7)  return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function currentDateLabel(): string {
  return new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function parseBadge(data: string) {
  const empty = { name: null as string | null, title: null, company: null, email: null, phone: null, website: null, notes: null };
  try {
    if (data.startsWith('{')) {
      const j = JSON.parse(data);
      return { ...empty, ...pick(j, ['name', 'title', 'company', 'email', 'phone', 'website', 'notes']) };
    }
    if (/^BEGIN:VCARD/i.test(data)) {
      const get = (tag: string) => new RegExp(`${tag}[^:]*:(.+)`, 'i').exec(data)?.[1]?.trim() ?? null;
      return { ...empty, name: get('FN'), title: get('TITLE'), company: get('ORG'), email: get('EMAIL'), phone: get('TEL'), website: get('URL') };
    }
    if (/^MECARD:/i.test(data)) {
      const parts = Object.fromEntries(
        data.slice(7).split(';').filter(Boolean).map((kv) => kv.split(':')).map(([k, ...v]) => [k, v.join(':')]),
      );
      return { ...empty, name: parts.N ?? null, company: parts.ORG ?? null, email: parts.EMAIL ?? null, phone: parts.TEL ?? null, website: parts.URL ?? null };
    }
    if (/^https?:\/\//i.test(data)) return { ...empty, website: data };
  } catch {/* noop */}
  return { ...empty, notes: data };
}
function pick<T extends object, K extends keyof T>(o: T, keys: K[]): Partial<T> {
  const r: Partial<T> = {};
  for (const k of keys) if (k in o) r[k] = o[k];
  return r;
}
