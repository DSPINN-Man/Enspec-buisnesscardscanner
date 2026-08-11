import { dbx, type Contact } from '@/db';

const CSV_COLUMNS: Array<{ header: string; value: (contact: Contact) => unknown }> = [
  { header: 'id', value: (c) => c.id },
  { header: 'captured_at', value: (c) => toIso(c.createdAt) },
  { header: 'updated_at', value: (c) => toIso(c.updatedAt) },
  { header: 'mode', value: (c) => c.mode },
  { header: 'starred', value: (c) => c.starred },
  { header: 'sync_status', value: (c) => c.syncStatus },
  { header: 'sync_attempts', value: (c) => c.syncAttempts },
  { header: 'odoo_contact_id', value: (c) => c.odooContactId },
  { header: 'name', value: (c) => c.name },
  { header: 'title', value: (c) => c.title },
  { header: 'company', value: (c) => c.company },
  { header: 'email', value: (c) => c.email },
  { header: 'phone', value: (c) => c.phone },
  { header: 'website', value: (c) => c.website },
  { header: 'notes', value: (c) => c.notes },
  { header: 'raw_text', value: (c) => c.rawText },
  { header: 'sync_error', value: (c) => c.syncError },
  { header: 'confidence_json', value: (c) => c.confidence ? JSON.stringify(c.confidence) : '' },
];

interface SerializedImageBlob {
  type: string;
  size: number;
  dataUrl: string;
}

type JsonBackupContact = Omit<Contact, 'imageBlob'> & {
  imageBlob: SerializedImageBlob | null;
};

export interface ContactsJsonBackup {
  source: 'enspec-business-card-scanner';
  version: 1;
  exportedAt: string;
  count: number;
  contacts: JsonBackupContact[];
}

export async function loadContactsForExport(): Promise<Contact[]> {
  return dbx.contacts.orderBy('createdAt').toArray();
}

export function contactsToCsv(contacts: Contact[]): string {
  const header = CSV_COLUMNS.map((column) => column.header).join(',');
  const rows = contacts.map((contact) =>
    CSV_COLUMNS.map((column) => csvCell(column.value(contact))).join(','),
  );

  return [header, ...rows].join('\r\n');
}

export async function contactsToJsonBackup(contacts: Contact[], exportedAt = new Date()): Promise<ContactsJsonBackup> {
  const serialized = await Promise.all(contacts.map(async ({ imageBlob, ...contact }) => ({
    ...contact,
    imageBlob: await serializeImageBlob(imageBlob),
  })));

  return {
    source: 'enspec-business-card-scanner',
    version: 1,
    exportedAt: exportedAt.toISOString(),
    count: serialized.length,
    contacts: serialized,
  };
}

export function exportFilename(type: 'csv' | 'json', date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return type === 'csv'
    ? `enspec-card-scans-${stamp}.csv`
    : `enspec-card-scans-backup-${stamp}.json`;
}

export async function exportContactsCsv(): Promise<number> {
  const contacts = await loadContactsForExport();
  await saveTextFile(exportFilename('csv'), contactsToCsv(contacts), 'text/csv;charset=utf-8');
  return contacts.length;
}

export async function exportContactsJsonBackup(): Promise<number> {
  const contacts = await loadContactsForExport();
  const backup = await contactsToJsonBackup(contacts);
  await saveTextFile(
    exportFilename('json'),
    JSON.stringify(backup, null, 2),
    'application/json;charset=utf-8',
  );
  return contacts.length;
}

function csvCell(value: unknown): string {
  if (value === null || typeof value === 'undefined') return '';
  const text = escapeSpreadsheetFormula(String(value));
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeSpreadsheetFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

async function serializeImageBlob(blob: Blob | null): Promise<SerializedImageBlob | null> {
  if (!blob) return null;
  const type = blob.type || 'application/octet-stream';
  return {
    type,
    size: blob.size,
    dataUrl: `data:${type};base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function toIso(timestamp: number): string {
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

async function saveTextFile(filename: string, content: string, mimeType: string): Promise<void> {
  const file = new File([content], filename, { type: mimeType });
  const shareNavigator = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };

  if (shareNavigator.share && shareNavigator.canShare?.({ files: [file] })) {
    await shareNavigator.share({ files: [file], title: filename });
    return;
  }

  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
