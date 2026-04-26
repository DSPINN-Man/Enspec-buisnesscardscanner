// Sync queue — the only mutator that progresses rows toward 'synced'.
// Runs on: app foreground, window 'online' event, manual tap, route changes.
//
// Handles two kinds of pending work on the same queue, because iOS offline
// blocks both AI extraction and endpoint delivery:
//
//   1. needs-extraction  →  call /api/extract, fill fields, mark 'pending'
//   2. pending | failed  →  POST to /api/sync with Idempotency-Key, mark 'synced'
//
// Exponential backoff on failure: nextAttemptAt = now + min(60 * 2^attempts, 3600)s.

import { dbx, dueForSync, patchContact, type Contact } from '@/db';
import { extractFromBlob } from '@/vision/extract';

const MAX_ATTEMPTS = 6;
const SYNC_ENDPOINT = import.meta.env.VITE_SYNC_ENDPOINT ?? '/api/sync';

export interface FlushResult { attempted: number; sent: number; extracted: number; failed: number; }

let flushing = false;

export async function flushPending(): Promise<FlushResult> {
  if (flushing) return { attempted: 0, sent: 0, extracted: 0, failed: 0 };
  if (!navigator.onLine) return { attempted: 0, sent: 0, extracted: 0, failed: 0 };

  flushing = true;
  let sent = 0, extracted = 0, failed = 0;

  try {
    const now = Date.now();
    const batch = await dueForSync(now, 25);
    for (const row of batch) {
      if (row.syncAttempts >= MAX_ATTEMPTS) continue;
      try {
        if (row.syncStatus === 'needs-extraction') {
          await runExtraction(row);
          extracted++;
          continue; // let the next flush pass pick it up for delivery
        }
        await patchContact(row.id, { syncStatus: 'syncing' });
        await deliver(row);
        await patchContact(row.id, {
          syncStatus: 'synced',
          syncError: null,
          syncAttempts: 0,
        });
        sent++;
      } catch (err: any) {
        failed++;
        const attempts = row.syncAttempts + 1;
        const delay = Math.min(60 * 2 ** attempts, 3600) * 1000;
        await patchContact(row.id, {
          syncStatus: 'failed',
          syncAttempts: attempts,
          syncError: String(err?.message ?? err).slice(0, 500),
          nextAttemptAt: Date.now() + delay,
        });
      }
    }
    return { attempted: batch.length, sent, extracted, failed };
  } finally {
    flushing = false;
  }
}

async function runExtraction(row: Contact) {
  if (!row.imageBlob) throw new Error('missing image for extraction');
  const result = await extractFromBlob(row.imageBlob);
  await patchContact(row.id, {
    ...result.fields,
    confidence: result.confidence,
    rawText: result.rawText,
    syncStatus: 'pending',
  });
}

async function deliver(row: Contact) {
  const res = await fetch(SYNC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': row.id,
    },
    body: JSON.stringify({
      id: row.id,
      mode: row.mode,
      name: row.name,
      title: row.title,
      company: row.company,
      email: row.email,
      phone: row.phone,
      website: row.website,
      notes: row.notes,
      captured_at: row.createdAt,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function getLastSyncedAt(): Promise<number | null> {
  const row = await dbx.contacts.where('syncStatus').equals('synced').last();
  return row?.updatedAt ?? null;
}
