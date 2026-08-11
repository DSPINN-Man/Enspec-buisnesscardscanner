import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useOnlineSync } from '@/hooks/useOnlineSync';
import { requestPersistentStorage } from '@/hooks/usePersistentStorage';

export default function App() {
  const { online, pending, lastSyncAt, syncNow, syncing } = useOnlineSync();
  const [, setPersisted] = useState<boolean | null>(null);

  useEffect(() => { requestPersistentStorage().then(setPersisted); }, []);

  return (
    <div className="min-h-full bg-bg">
      <Header />
      <main>
        <Outlet />
      </main>
      <SyncStrip online={online} pending={pending} lastSyncAt={lastSyncAt} syncing={syncing} onSync={syncNow} />
    </div>
  );
}

function Header() {
  return (
    <div className="shell pt-3 pb-2 flex items-center justify-between" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-ink text-white flex items-center justify-center font-display font-extrabold text-[11px] tracking-tight shrink-0">
          ENS
        </div>
        <div className="min-w-0">
          <p className="font-display font-extrabold tracking-tight text-[16px] leading-tight">ENSPEC</p>
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-3 truncate">All Energy 2026</p>
        </div>
      </div>
      <span className="rounded-full border border-accent/20 bg-accent-soft px-3 py-1.5 text-[11px] font-semibold text-accent">
        Odoo sync
      </span>
    </div>
  );
}

function SyncStrip(props: {
  online: boolean; pending: number; lastSyncAt: number | null; syncing: boolean; onSync: () => void;
}) {
  const { online, pending, lastSyncAt, syncing, onSync } = props;
  if (pending === 0 && online && !syncing) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 bg-card/95 backdrop-blur-xl border-t border-hairline">
      <div className="shell flex items-center gap-3 py-2.5 text-[12px]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}>
        <span className={`inline-block w-2 h-2 rounded-full ${online ? 'bg-ok animate-pulseRing' : 'bg-danger'}`} />
        <span className="text-ink-2">{online ? 'Online' : 'Offline'}</span>
        <span className="text-ink-3">·</span>
        <span className="text-ink-2">{pending} pending</span>
        <span className="text-ink-3 ml-auto">{lastSyncAt ? fmt(lastSyncAt) : 'never'}</span>
        <button
          onClick={onSync}
          disabled={!online || syncing || pending === 0}
          className="px-3 py-1.5 rounded-full bg-accent text-white font-semibold disabled:opacity-40 disabled:bg-bg-2 disabled:text-ink-3"
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
    </div>
  );
}

function fmt(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}
