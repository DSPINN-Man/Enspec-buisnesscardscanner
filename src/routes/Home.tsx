import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { dbx, type Contact } from '@/db';

export default function Home() {
  const rows = useLiveQuery(() => dbx.contacts.orderBy('createdAt').reverse().limit(200).toArray(), [], []);

  return (
    <div className="min-h-full pt-[72px] pb-[140px] px-4">
      {rows && rows.length === 0 ? (
        <div className="glass px-5 py-6 mt-6">
          <h2 className="text-xl font-semibold mb-1">No scans yet</h2>
          <p className="text-ink-2 text-sm">Tap Scan to capture your first card.</p>
        </div>
      ) : (
        <ul className="space-y-2.5 mt-4">
          {rows?.map((r) => <Row key={r.id} r={r} />)}
        </ul>
      )}

      <Link
        to="/scan"
        className="fixed left-1/2 -translate-x-1/2 bg-accent text-white font-bold text-[16px] rounded-full px-7 py-4 shadow-2xl shadow-accent/40 active:scale-95 transition"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
      >
        Scan
      </Link>
    </div>
  );
}

function Row({ r }: { r: Contact }) {
  const tone = toneFor(r.syncStatus);
  return (
    <Link to={`/review/${r.id}`} className="block glass px-4 py-3.5 active:opacity-80">
      <p className="text-[17px] font-semibold">{r.name || 'Untitled'}</p>
      <p className="text-ink-2 text-sm">
        {[r.title, r.company].filter(Boolean).join(' · ') || r.email || r.phone || '—'}
      </p>
      <div className="flex gap-2 mt-2">
        <Badge>{r.mode === 'badge' ? 'Badge' : 'Card'}</Badge>
        <Badge tone={tone}>{labelFor(r.syncStatus)}</Badge>
      </div>
    </Link>
  );
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const color = { neutral: 'text-ink-2 border-hairline', good: 'text-ok border-ok/50', warn: 'text-warn border-warn/60', bad: 'text-danger border-danger/60' }[tone];
  return <span className={`text-[11px] font-semibold tracking-wider uppercase px-2.5 py-0.5 rounded-full border ${color}`}>{children}</span>;
}

function toneFor(s: Contact['syncStatus']) {
  if (s === 'synced')  return 'good';
  if (s === 'failed')  return 'bad';
  if (s === 'syncing' || s === 'needs-extraction') return 'warn';
  return 'neutral';
}
function labelFor(s: Contact['syncStatus']) {
  if (s === 'needs-extraction') return 'awaiting AI';
  return s;
}
