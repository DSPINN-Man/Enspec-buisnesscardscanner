import Dexie, { type EntityTable } from 'dexie';

export type SyncStatus = 'pending' | 'needs-extraction' | 'syncing' | 'synced' | 'failed';
export type ScanMode = 'card' | 'badge';

export interface Contact {
  id: string;
  name: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  mode: ScanMode;
  imageBlob: Blob | null;     // JPEG of flattened card, stored locally only
  confidence: Record<string, number> | null;
  rawText: string | null;
  syncStatus: SyncStatus;
  syncAttempts: number;
  syncError: string | null;
  nextAttemptAt: number;
  createdAt: number;
  updatedAt: number;
}

class ScannerDB extends Dexie {
  contacts!: EntityTable<Contact, 'id'>;
  constructor() {
    super('sota-scanner');
    this.version(1).stores({
      contacts: 'id, syncStatus, createdAt, nextAttemptAt',
    });
  }
}

export const dbx = new ScannerDB();

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export async function insertContact(
  input: Partial<Contact> & { mode?: ScanMode; imageBlob?: Blob | null }
): Promise<Contact> {
  const now = Date.now();
  const row: Contact = {
    id: uid(),
    name: input.name ?? null,
    title: input.title ?? null,
    company: input.company ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    website: input.website ?? null,
    notes: input.notes ?? null,
    mode: input.mode ?? 'card',
    imageBlob: input.imageBlob ?? null,
    confidence: input.confidence ?? null,
    rawText: input.rawText ?? null,
    syncStatus: input.syncStatus ?? 'pending',
    syncAttempts: 0,
    syncError: null,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await dbx.contacts.add(row);
  return row;
}

export async function patchContact(id: string, patch: Partial<Contact>): Promise<void> {
  await dbx.contacts.update(id, { ...patch, updatedAt: Date.now() });
}

export async function dueForSync(now: number, limit = 25): Promise<Contact[]> {
  return dbx.contacts
    .where('syncStatus')
    .anyOf('pending', 'needs-extraction', 'failed')
    .filter((c) => c.nextAttemptAt <= now)
    .limit(limit)
    .toArray();
}

export async function pendingCount(): Promise<number> {
  return dbx.contacts.where('syncStatus').anyOf('pending', 'needs-extraction', 'failed').count();
}
