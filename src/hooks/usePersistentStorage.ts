// Asks the browser to mark our storage as persistent. Critical for iOS
// Safari, which otherwise aggressively evicts IndexedDB after ~2 weeks
// of non-use. Must be called after a user gesture or on an active tab.

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!('storage' in navigator) || !('persist' in navigator.storage)) return false;
    const already = await navigator.storage.persisted?.();
    if (already) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!('storage' in navigator) || !('estimate' in navigator.storage)) return null;
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}
