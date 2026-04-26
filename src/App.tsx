import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useOnlineSync } from '@/hooks/useOnlineSync';
import { requestPersistentStorage } from '@/hooks/usePersistentStorage';

export default function App() {
  const { online, pending, lastSyncAt, syncNow, syncing } = useOnlineSync();
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => { requestPersistentStorage().then(setPersisted); }, []);

  return (
    <div className="min-h-full flex flex-col">
      <StatusStrip
        online={online}
        pending={pending}
        lastSyncAt={lastSyncAt}
        syncing={syncing}
        onSync={syncNow}
        persisted={persisted}
      />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

function StatusStrip(props: {
  online: boolean;
  pending: number;
  lastSyncAt: number | null;
  syncing: boolean;
  onSync: () => void;
  persisted: boolean | null;
}) {
  const { online, pending, lastSyncAt, syncing, onSync, persisted } = props;
  return (
    <div
      className="fixed top-0 left-0 right-0 z-20 glass-strong flex items-center gap-3 px-4 py-2 text-xs"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${online ? 'bg-ok' : 'bg-danger'} ${online ? 'animate-pulseRing' : ''}`} />
      <span className="text-ink-2">{online ? 'Online' : 'Offline'}</span>
      <span className="text-ink-3">·</span>
      <span className="text-ink-2">{pending} pending</span>
      <span className="text-ink-3">·</span>
      <span className="text-ink-3">{lastSyncAt ? `synced ${fmt(lastSyncAt)}` : 'never synced'}</span>
      <button
        onClick={onSync}
        disabled={!online || syncing || pending === 0}
        className="ml-auto px-3 py-1 rounded-full border hairline text-ink disabled:opacity-40"
      >
        {syncing ? 'Syncing…' : 'Sync now'}
      </button>
      {persisted === false && (
        <span className="ml-2 text-warn" title="iOS has not granted persistent storage. Queued scans could be evicted.">⚠</span>
      )}
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
