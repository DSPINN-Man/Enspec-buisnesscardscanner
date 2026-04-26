// Dashboard — every saved scan, grouped by day, with search + filters.
// Same swipe gestures as Home (← delete, → star). Stats strip up top.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { dbx, deleteContact, toggleStar, type Contact } from '@/db';
import { SwipeableScanRow } from '@/components/SwipeableScanRow';

type Filter = 'all' | 'starred' | 'pending' | 'today';

export default function Scans() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);

  const all = useLiveQuery(
    () => dbx.contacts.orderBy('createdAt').reverse().toArray(),
    [],
    [] as Contact[],
  );

  // Close any open swipe on scroll.
  useEffect(() => {
    if (!openSwipeId) return;
    const close = () => setOpenSwipeId(null);
    document.addEventListener('scroll', close, { passive: true });
    return () => document.removeEventListener('scroll', close);
  }, [openSwipeId]);

  const filtered = useMemo(() => {
    if (!all) return [];
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();
    const ql = q.trim().toLowerCase();
    return all.filter((r) => {
      if (filter === 'starred' && !r.starred) return false;
      if (filter === 'pending' && r.syncStatus === 'synced') return false;
      if (filter === 'today'   && r.createdAt < todayMs) return false;
      if (!ql) return true;
      const hay = [r.name, r.title, r.company, r.email, r.phone, r.notes]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(ql);
    });
  }, [all, q, filter]);

  const counts = useMemo(() => {
    if (!all) return { total: 0, starred: 0, pending: 0, today: 0 };
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();
    return all.reduce((acc, r) => {
      acc.total++;
      if (r.starred) acc.starred++;
      if (r.syncStatus !== 'synced') acc.pending++;
      if (r.createdAt >= todayMs) acc.today++;
      return acc;
    }, { total: 0, starred: 0, pending: 0, today: 0 });
  }, [all]);

  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <div className="shell pt-2 pb-32">
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => nav('/')} className="w-10 h-10 rounded-full border border-hairline bg-card flex items-center justify-center text-ink-2 hover:text-ink transition" aria-label="Back">
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h1 className="font-display font-extrabold text-[28px] tracking-tight">All Scans</h1>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <Stat label="Total"    value={counts.total} />
        <Stat label="Starred"  value={counts.starred} accent />
        <Stat label="Pending"  value={counts.pending} />
        <Stat label="Today"    value={counts.today} />
      </div>

      {/* Search */}
      <div className="mb-3 relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, company, email…"
          className="w-full rounded-full bg-card border border-hairline pl-10 pr-4 py-3 text-[15px] text-ink placeholder:text-ink-3 outline-none focus:border-accent transition"
        />
        <svg viewBox="0 0 24 24" className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        {q && (
          <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 text-[18px]" aria-label="Clear search">×</button>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-4 overflow-x-auto -mx-1 px-1">
        {(['all','starred','pending','today'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition ${
              filter === f
                ? 'bg-accent text-white border-accent shadow-cta'
                : 'bg-card text-ink-2 border-hairline hover:text-ink'
            }`}
          >
            {f === 'all' ? 'All' : f === 'starred' ? 'Starred' : f === 'pending' ? 'Pending sync' : 'Today'}
          </button>
        ))}
      </div>

      {/* Groups */}
      {groups.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-ink-2 text-sm">{q || filter !== 'all' ? 'No scans match your filters.' : 'No scans yet.'}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className="text-[12px] uppercase tracking-wider text-ink-3 font-semibold mb-2 px-1">{g.label}</h2>
              <ul className="space-y-2">
                {g.rows.map((r) => (
                  <SwipeableScanRow
                    key={r.id}
                    r={r}
                    onDelete={(id) => deleteContact(id)}
                    onStar={(id) => toggleStar(id)}
                    openId={openSwipeId}
                    setOpenId={setOpenSwipeId}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`card px-3 py-2.5 text-center ${accent ? 'bg-accent-soft border-accent/20' : ''}`}>
      <div className={`text-[20px] font-bold leading-none ${accent ? 'text-accent' : 'text-ink'}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-ink-3 font-semibold mt-1">{label}</div>
    </div>
  );
}

function groupByDay(rows: Contact[]): Array<{ label: string; rows: Contact[] }> {
  if (rows.length === 0) return [];
  const startOfDay = (ts: number) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const today = startOfDay(Date.now());
  const yesterday = today - 86400000;

  const out: Map<string, Contact[]> = new Map();
  // Starred always on top in their own group.
  const starred = rows.filter((r) => r.starred);
  if (starred.length) out.set('★ Starred', starred);

  const rest = rows.filter((r) => !r.starred);
  for (const r of rest) {
    const d = startOfDay(r.createdAt);
    const label =
      d === today ? 'Today' :
      d === yesterday ? 'Yesterday' :
      new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    if (!out.has(label)) out.set(label, []);
    out.get(label)!.push(r);
  }
  return Array.from(out, ([label, rows]) => ({ label, rows }));
}
