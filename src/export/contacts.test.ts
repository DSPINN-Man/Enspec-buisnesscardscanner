import { describe, expect, it } from 'vitest';
import type { Contact } from '@/db';
import { contactsToCsv, contactsToJsonBackup, exportFilename } from './contacts';

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'card-1',
    name: 'Ada "Ace" Lovelace',
    title: 'CTO',
    company: 'Math\nWorks',
    email: 'ada@example.com',
    phone: '+44 1234',
    website: 'example.com',
    notes: 'Met at conference',
    mode: 'card',
    imageBlob: null,
    confidence: { name: 0.98 },
    rawText: 'Ada Lovelace',
    syncStatus: 'pending',
    syncAttempts: 2,
    syncError: null,
    nextAttemptAt: 1_700_000_001_000,
    starred: true,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_002_000,
    ...overrides,
  };
}

describe('contactsToCsv', () => {
  it('exports CRM-friendly columns and safely escapes CSV values', () => {
    const csv = contactsToCsv([contact()]);

    expect(csv).toContain('id,captured_at,updated_at,mode,starred,sync_status');
    expect(csv).toContain('"Ada ""Ace"" Lovelace"');
    expect(csv).toContain('"Math\nWorks"');
    expect(csv).toContain('"Met at conference"');
    expect(csv).toContain("\"'+44 1234\"");
  });
});

describe('contactsToJsonBackup', () => {
  it('includes all contact fields and embeds image blobs as data URLs', async () => {
    const backup = await contactsToJsonBackup([
      contact({ imageBlob: new Blob(['image-bytes'], { type: 'image/jpeg' }) }),
    ]);

    expect(backup.source).toBe('enspec-business-card-scanner');
    expect(backup.count).toBe(1);
    expect(backup.contacts[0].id).toBe('card-1');
    expect(backup.contacts[0].imageBlob).toEqual({
      type: 'image/jpeg',
      size: 11,
      dataUrl: 'data:image/jpeg;base64,aW1hZ2UtYnl0ZXM=',
    });
  });
});

describe('exportFilename', () => {
  it('uses a stable date-stamped filename', () => {
    expect(exportFilename('csv', new Date('2026-05-14T10:20:30Z'))).toBe('enspec-card-scans-2026-05-14.csv');
    expect(exportFilename('json', new Date('2026-05-14T10:20:30Z'))).toBe('enspec-card-scans-backup-2026-05-14.json');
  });
});
