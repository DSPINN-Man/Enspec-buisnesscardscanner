// Swipe-to-action row for scans. Vanilla pointer events — no lib.
//
//   ← swipe left  → reveals red Delete  (snap-open + tap, or fast swipe past
//                                        threshold = instant delete)
//   → swipe right → reveals amber Star  (toggles starred)
//
// • Vertical drags are NOT captured — page scroll keeps working (touch-action).
// • Once open, tapping the row body closes it instead of navigating.
// • Tapping outside an open row anywhere on the page closes it (handled by the
//   parent list with a single document listener).
// • Mouse / trackpad work too via pointer events, so desktop is identical.

import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import type { Contact } from '@/db';

const REVEAL = 96;        // px each side reveals when fully open
const THRESHOLD = 56;     // distance to count as a swipe-open
const FLING = 220;        // px past threshold = instant fire
const DIR_LOCK = 8;       // px of horizontal motion before we capture

export function SwipeableScanRow({
  r, onDelete, onStar, openId, setOpenId,
}: {
  r: Contact;
  onDelete: (id: string) => void;
  onStar: (id: string) => void;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const nav = useNavigate();
  const [tx, setTx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startTx = useRef(0);
  const lockedHoriz = useRef(false);
  const moved = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  const isOpen = openId === r.id;

  // External close: close when another row opens, or parent closes all.
  useEffect(() => {
    if (!isOpen && tx !== 0 && !dragging) setTx(0);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    startY.current = e.clientY;
    startTx.current = tx;
    lockedHoriz.current = false;
    moved.current = false;
    setDragging(true);
    ref.current?.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (!lockedHoriz.current) {
      if (Math.abs(dx) < DIR_LOCK && Math.abs(dy) < DIR_LOCK) return;
      lockedHoriz.current = Math.abs(dx) > Math.abs(dy);
      if (!lockedHoriz.current) { setDragging(false); return; }
    }
    moved.current = true;
    const next = Math.max(-REVEAL - 30, Math.min(REVEAL + 30, startTx.current + dx));
    setTx(next);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    ref.current?.releasePointerCapture?.(e.pointerId);
    const final = tx;
    if (final < -FLING) { onDelete(r.id); setOpenId(null); return; }
    if (final >  FLING) { onStar(r.id);   setTx(0); setOpenId(null); return; }
    if (final < -THRESHOLD) { setTx(-REVEAL); setOpenId(r.id); return; }
    if (final >  THRESHOLD) { setTx( REVEAL); setOpenId(r.id); return; }
    setTx(0);
    if (isOpen) setOpenId(null);
  };

  const onClickRow = (e: React.MouseEvent) => {
    if (moved.current) { e.preventDefault(); return; }
    if (isOpen) { e.preventDefault(); setOpenId(null); setTx(0); return; }
    nav(`/review/${r.id}`);
  };

  const initials = computeInitials(r);
  const av = avatarTone(initials);

  return (
    <li className="relative overflow-hidden rounded-2xl">
      {/* Action panels behind the row */}
      <div className="absolute inset-y-0 left-0 w-24 flex items-center justify-center bg-amber-400 text-white">
        <StarIcon filled={r.starred} />
        <span className="sr-only">Star</span>
      </div>
      <div className="absolute inset-y-0 right-0 w-24 flex items-center justify-center bg-red-500 text-white">
        <TrashIcon />
        <span className="sr-only">Delete</span>
      </div>

      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClickRow}
        style={{
          transform: `translateX(${tx}px)`,
          transition: dragging ? 'none' : 'transform 220ms cubic-bezier(.2,.9,.3,1)',
          touchAction: 'pan-y',
        }}
        className="relative bg-card border border-hairline rounded-2xl shadow-card px-4 py-3 flex items-center gap-3.5 select-none cursor-pointer"
      >
        <span
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-[13px] shrink-0 relative"
          style={{ backgroundColor: av }}
        >
          {initials}
          {r.starred && (
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-400 text-white flex items-center justify-center shadow">
              <StarIcon filled small />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ink font-semibold truncate">{r.name || 'Untitled'}</p>
          <p className="text-ink-2 text-[13px] truncate">
            {[r.title, r.company].filter(Boolean).join(', ') ||
              (r.mode === 'badge' ? 'Conference Badge' : r.email || r.phone || '—')}
          </p>
        </div>
        <span className="text-ink-3 text-[12px] shrink-0">{relativeTime(r.createdAt)}</span>
      </div>
    </li>
  );
}

function StarIcon({ filled, small }: { filled?: boolean; small?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={small ? 'w-2.5 h-2.5' : 'w-6 h-6'} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.2 1 5.9L12 17l-5.2 2.8 1-5.9L3.5 9.7l5.9-.9L12 3.5Z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-7 4v7m4-7v7M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    </svg>
  );
}

// Shared helpers (also used by Home + Scans pages — exporting for reuse)
export function computeInitials(r: Contact): string {
  const src = r.name || r.company || r.email || '??';
  const parts = src.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
const TONES = ['#F4A261', '#7AA1E1', '#52B6A4', '#E07A8B', '#B19CE0', '#9AA0A6'];
export function avatarTone(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}
export function relativeTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5)    return 'Just now';
  if (s < 60)   return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); if (d < 7)  return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
