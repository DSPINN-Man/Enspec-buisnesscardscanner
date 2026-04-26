import { useEffect, useState, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { pendingCount } from '@/db';
import { flushPending, getLastSyncedAt } from '@/sync/queue';

// The main liveness hook. Aggregates:
//   • navigator.onLine (driven by 'online' / 'offline' events)
//   • reactive pending count from Dexie
//   • last successful sync timestamp
// And exposes syncNow() so the status strip + review screen can trigger
// a flush on demand. Opportunistic flushes fire on mount, on 'online',
// on visibilitychange (user returns to the tab / resumes the PWA),
// and every 60s while online (cheap heartbeat; no-op if queue is empty).

export function useOnlineSync() {
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const pending = useLiveQuery(pendingCount, [], 0) ?? 0;
  const heartbeat = useRef<number | null>(null);

  const refreshLast = useCallback(async () => {
    setLastSyncAt(await getLastSyncedAt());
  }, []);

  const syncNow = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await flushPending();
      await refreshLast();
    } finally {
      setSyncing(false);
    }
  }, [syncing, refreshLast]);

  useEffect(() => {
    refreshLast();

    const onOnline  = () => { setOnline(true);  syncNow(); };
    const onOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === 'visible') syncNow(); };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);

    // Opportunistic mount flush.
    syncNow();

    // Heartbeat while tab is open — retries failed rows whose backoff expired.
    heartbeat.current = window.setInterval(() => {
      if (navigator.onLine) syncNow();
    }, 60_000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      if (heartbeat.current) window.clearInterval(heartbeat.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { online, pending, syncing, lastSyncAt, syncNow };
}
