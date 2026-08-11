import { describe, expect, it, vi } from 'vitest';
import {
  buildMailingContactValues,
  parseScannerPayload,
  syncMailingContactToOdoo,
  type OdooEnv,
  type ScannerPayload,
} from '../lib/odoo';

const env: OdooEnv = {
  ODOO_URL: 'https://enspec.odoo.com',
  ODOO_DATABASE: 'enspec',
  ODOO_USERNAME: 'scanner@example.com',
  ODOO_API_KEY: 'test-key',
  ODOO_MAILING_LIST_ID: '5',
};

const payload: ScannerPayload = {
  id: 'm123abc',
  mode: 'card',
  name: 'Ada Lovelace',
  title: 'Engineer',
  company: 'Analytical Engines Ltd',
  email: 'ada@example.com',
  phone: '+44 20 0000 0000',
  website: 'https://example.com',
  notes: 'Asked about harmonics',
  captured_at: Date.UTC(2026, 4, 13, 10, 30),
};

describe('parseScannerPayload', () => {
  it('accepts and trims a valid scanner contact', () => {
    expect(parseScannerPayload({ ...payload, name: '  Ada Lovelace  ' }).name).toBe('Ada Lovelace');
  });

  it('rejects unsafe identifiers and oversized notes', () => {
    expect(() => parseScannerPayload({ ...payload, id: '../contact' })).toThrow(/unsupported/);
    expect(() => parseScannerPayload({ ...payload, notes: 'x'.repeat(4001) })).toThrow(/too long/);
  });
});

describe('buildMailingContactValues', () => {
  it('matches Nathan\'s mailing-contact fields and assigns All Energy 2026', () => {
    const values = buildMailingContactValues(payload, env);
    expect(values).toMatchObject({
      name: 'Ada Lovelace',
      x_studio_job_title: 'Engineer',
      company_name: 'Analytical Engines Ltd',
      email: 'ada@example.com',
      mobile: '+44 20 0000 0000',
      list_ids: [[6, 0, [5]]],
    });
    expect(String(values.x_studio_notes)).toContain('Website: https://example.com');
    expect(String(values.x_studio_notes)).toContain('Event: All Energy 2026');
    expect(String(values.x_studio_notes)).toContain('ENSPEC_SCANNER_ID:m123abc');
  });
});

describe('syncMailingContactToOdoo', () => {
  it('creates a mailing contact when the scan has not been delivered before', async () => {
    const fetcher = mockRpc([89, [], 321]);
    await expect(syncMailingContactToOdoo(payload, env, fetcher)).resolves.toEqual({
      odooContactId: 321,
      operation: 'created',
    });

    const calls = rpcCalls(fetcher);
    expect(calls[1].params.args[3]).toBe('mailing.contact');
    expect(calls[1].params.args[4]).toBe('search_read');
    expect(calls[2].params.args[3]).toBe('mailing.contact');
    expect(calls[2].params.args[4]).toBe('create');
    expect(calls[2].params.args[5][0]).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      list_ids: [[6, 0, [5]]],
    });
  });

  it('updates the existing mailing contact on a retry or edit', async () => {
    const fetcher = mockRpc([89, [{ id: 321 }], true]);
    await expect(syncMailingContactToOdoo(payload, env, fetcher)).resolves.toEqual({
      odooContactId: 321,
      operation: 'updated',
    });

    const calls = rpcCalls(fetcher);
    expect(calls[2].params.args[3]).toBe('mailing.contact');
    expect(calls[2].params.args[4]).toBe('write');
    expect(calls[2].params.args[5][0]).toEqual([321]);
  });
});

function mockRpc(results: unknown[]): typeof fetch {
  return vi.fn(async () => {
    const result = results.shift();
    return new Response(JSON.stringify({ jsonrpc: '2.0', result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function rpcCalls(fetcher: typeof fetch): Array<any> {
  return (fetcher as any).mock.calls.map((call: [string, RequestInit]) => JSON.parse(String(call[1].body)));
}
