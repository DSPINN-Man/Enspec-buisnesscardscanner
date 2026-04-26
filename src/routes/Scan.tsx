// Scan route — PWA camera capture.
//
// Flow:
//   1. getUserMedia({ video: { facingMode: 'environment' } }) — iOS Safari
//      honours this on 17+. Must be served over HTTPS.
//   2. User lines up the card inside the guide frame and hits the shutter.
//   3. We snapshot the current video frame to a <canvas>, center-crop to the
//      ISO/IEC 7810 ID-1 aspect (1.586), encode JPEG, save the Blob.
//   4. If online → attempt extraction immediately; if offline → save with
//      syncStatus = 'needs-extraction'. Either way the row is persisted to
//      IndexedDB before navigating — no data loss on refresh.
//   5. In Badge mode, BarcodeDetector (iOS 17+) decodes QR / Code128 /
//      Data Matrix from each video frame; graceful fallback to manual entry
//      if the browser lacks the API.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ModeToggle, type Mode } from '@/components/ModeToggle';
import { insertContact } from '@/db';
import { extractFromBlob } from '@/vision/extract';
import { flushPending } from '@/sync/queue';

const CARD_ASPECT = 1.586; // ID-1

export default function Scan() {
  const nav = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<Mode>('card');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lastBadgeRef = useRef<string | null>(null);

  // Start camera
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e: any) {
        setErr(e?.message ?? 'Camera unavailable. Grant permission in Settings → Safari.');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Badge mode: poll BarcodeDetector against the live video.
  useEffect(() => {
    if (mode !== 'badge') return;
    // @ts-expect-error BarcodeDetector isn't in lib.dom.d.ts in all TS versions
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
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || busy) return;
    setBusy(true);
    setErr(null);
    vibrate(10);

    try {
      const v = videoRef.current;
      const vw = v.videoWidth, vh = v.videoHeight;
      if (!vw || !vh) throw new Error('camera not ready');

      // Center-crop to ID-1 aspect; horizontal orientation assumed.
      const cropW = vw;
      const cropH = Math.round(cropW / CARD_ASPECT);
      const originY = Math.max(0, Math.round((vh - cropH) / 2));

      const c = canvasRef.current;
      c.width = Math.min(2000, cropW);
      c.height = Math.round(c.width / CARD_ASPECT);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(v, 0, originY, cropW, cropH, 0, 0, c.width, c.height);

      const blob = await new Promise<Blob>((resolve, reject) =>
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('blob failed'))), 'image/jpeg', 0.9)
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
      nav(`/review/${row.id}`, { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? 'Capture failed');
    } finally {
      setBusy(false);
    }
  }, [busy, nav]);

  const handleBadge = useCallback(async (raw: string) => {
    if (busy) return;
    setBusy(true);
    vibrate([20, 40, 20]);
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
      nav(`/review/${row.id}`, { replace: true });
    } finally {
      setBusy(false);
    }
  }, [busy, nav]);

  return (
    <div className="fixed inset-0 bg-black">
      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="hidden" />

      {/* Dim overlay with a transparent guide frame */}
      <div className="absolute inset-0 pointer-events-none flex flex-col">
        <div className="flex-1 bg-black/55" />
        <div
          className="self-center border border-hairline-2 rounded-2xl"
          style={{
            width: 'calc(100vw - 48px)',
            aspectRatio: mode === 'badge' ? '1 / 1' : String(CARD_ASPECT),
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
          }}
        >
          <Corners />
        </div>
        <div className="flex-1 bg-black/55" />
      </div>

      {/* Top bar */}
      <div
        className="absolute top-0 inset-x-0 glass-strong flex items-center justify-between px-4 py-2.5"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)' }}
      >
        <button onClick={() => nav(-1)} className="text-ink-2 text-[13px] font-semibold uppercase tracking-wider">Close</button>
        <ModeToggle mode={mode} onChange={setMode} />
        <span className="w-12" />
      </div>

      {/* Shutter / hint */}
      <div
        className="absolute inset-x-0 flex flex-col items-center gap-3"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 28px)' }}
      >
        {mode === 'card' ? (
          <button
            onClick={capture}
            disabled={busy}
            aria-label="Capture card"
            className="w-[72px] h-[72px] rounded-full border-4 border-white bg-white/15 backdrop-blur-md flex items-center justify-center disabled:opacity-50 active:scale-95 transition"
          >
            <span className="w-14 h-14 rounded-full bg-white" />
          </button>
        ) : (
          <p className="text-ink-2 text-[13px]">Point at a QR code or badge barcode</p>
        )}
        {mode === 'card' && <p className="text-ink-2 text-[12px]">Fill the frame — tap to capture</p>}
        {err && <p className="text-warn text-[12px] max-w-[80%] text-center">{err}</p>}
        {!navigator.onLine && mode === 'card' && (
          <p className="text-warn/90 text-[11px] uppercase tracking-wider">Offline — will extract when online</p>
        )}
      </div>
    </div>
  );
}

function Corners() {
  const cls = 'absolute w-5 h-5 border-[3px] border-accent-2';
  return (
    <>
      <span className={`${cls} -top-0.5 -left-0.5 border-r-0 border-b-0 rounded-tl-lg`} />
      <span className={`${cls} -top-0.5 -right-0.5 border-l-0 border-b-0 rounded-tr-lg`} />
      <span className={`${cls} -bottom-0.5 -left-0.5 border-r-0 border-t-0 rounded-bl-lg`} />
      <span className={`${cls} -bottom-0.5 -right-0.5 border-l-0 border-t-0 rounded-br-lg`} />
    </>
  );
}

function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch {/* iOS Safari ignores */}
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
      return {
        ...empty,
        name: get('FN'), title: get('TITLE'), company: get('ORG'),
        email: get('EMAIL'), phone: get('TEL'), website: get('URL'),
      };
    }
    if (/^MECARD:/i.test(data)) {
      const parts = Object.fromEntries(
        data.slice(7).split(';').filter(Boolean).map((kv) => kv.split(':')).map(([k, ...v]) => [k, v.join(':')])
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
