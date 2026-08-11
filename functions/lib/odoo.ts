export interface OdooEnv {
  ODOO_URL?: string;
  ODOO_DATABASE?: string;
  ODOO_USERNAME?: string;
  ODOO_API_KEY?: string;
  ODOO_MAILING_LIST_ID?: string;
  ODOO_EVENT_NAME?: string;
}

export interface ScannerPayload {
  id: string;
  mode: 'card' | 'badge';
  name: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  captured_at: number;
}

export interface OdooSyncResult {
  odooContactId: number;
  operation: 'created' | 'updated';
}

interface OdooConfig {
  url: string;
  database: string;
  username: string;
  apiKey: string;
  mailingListId: number;
  eventName: string;
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: {
    code?: number;
    message?: string;
    data?: { name?: string; message?: string };
  };
}

export class OdooSyncError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'authentication' | 'rpc' | 'invalid_response',
    readonly status = 502,
  ) {
    super(message);
    this.name = 'OdooSyncError';
  }
}

export function parseScannerPayload(value: unknown): ScannerPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('payload must be a JSON object');
  }

  const input = value as Record<string, unknown>;
  const id = requiredText(input.id, 'id', 128);
  if (!/^[a-z0-9_-]+$/i.test(id)) throw new TypeError('id contains unsupported characters');

  const mode = input.mode;
  if (mode !== 'card' && mode !== 'badge') throw new TypeError('mode must be card or badge');

  const capturedAt = input.captured_at;
  if (typeof capturedAt !== 'number' || !Number.isFinite(capturedAt) || capturedAt <= 0) {
    throw new TypeError('captured_at must be a timestamp');
  }

  return {
    id,
    mode,
    name: optionalText(input.name, 'name', 200),
    title: optionalText(input.title, 'title', 200),
    company: optionalText(input.company, 'company', 200),
    email: optionalText(input.email, 'email', 320),
    phone: optionalText(input.phone, 'phone', 80),
    website: optionalText(input.website, 'website', 500),
    notes: optionalText(input.notes, 'notes', 4000),
    captured_at: capturedAt,
  };
}

export function buildMailingContactValues(
  payload: ScannerPayload,
  env: OdooEnv,
): Record<string, unknown> {
  const config = readConfig(env);
  const marker = scannerMarker(payload.id);
  const eventNotes = [
    payload.notes,
    payload.website ? `Website: ${payload.website}` : null,
    `Event: ${config.eventName}`,
    `Capture type: ${payload.mode}`,
    `Captured: ${new Date(payload.captured_at).toISOString()}`,
    marker,
  ].filter((value): value is string => Boolean(value));

  return {
    // These are the same fields used by Nathan's /allenergy website form.
    name: payload.name || payload.company || 'Scanned contact',
    x_studio_job_title: payload.title || false,
    company_name: payload.company || false,
    email: payload.email || false,
    mobile: payload.phone || false,
    x_studio_notes: eventNotes.join('\n'),
    list_ids: [[6, 0, [config.mailingListId]]],
  };
}

export async function syncMailingContactToOdoo(
  payload: ScannerPayload,
  env: OdooEnv,
  fetcher: typeof fetch = fetch,
): Promise<OdooSyncResult> {
  const config = readConfig(env);
  const uid = await rpc<number>(config, 'common', 'authenticate', [
    config.database,
    config.username,
    config.apiKey,
    {},
  ], fetcher);

  if (!Number.isInteger(uid) || uid <= 0) {
    throw new OdooSyncError('Odoo rejected the integration credentials.', 'authentication', 502);
  }

  const marker = scannerMarker(payload.id);
  const matches = await executeKw<Array<{ id: number }>>(
    config,
    uid,
    'mailing.contact',
    'search_read',
    [[[['x_studio_notes', 'ilike', marker]]], { fields: ['id'], limit: 1 }],
    fetcher,
  );

  const values = buildMailingContactValues(payload, env);
  const existingId = Array.isArray(matches) ? matches[0]?.id : undefined;

  if (Number.isInteger(existingId) && Number(existingId) > 0) {
    const updated = await executeKw<boolean>(
      config,
      uid,
      'mailing.contact',
      'write',
      [[[Number(existingId)], values], {}],
      fetcher,
    );
    if (updated !== true) {
      throw new OdooSyncError('Odoo did not confirm the mailing contact update.', 'invalid_response');
    }
    return { odooContactId: Number(existingId), operation: 'updated' };
  }

  const created = await executeKw<number | number[]>(
    config,
    uid,
    'mailing.contact',
    'create',
    [[values], {}],
    fetcher,
  );
  const contactId = Array.isArray(created) ? created[0] : created;
  if (!Number.isInteger(contactId) || Number(contactId) <= 0) {
    throw new OdooSyncError('Odoo returned an invalid mailing contact identifier.', 'invalid_response');
  }
  return { odooContactId: Number(contactId), operation: 'created' };
}

async function executeKw<T>(
  config: OdooConfig,
  uid: number,
  model: string,
  method: string,
  methodArgs: [unknown[], Record<string, unknown>],
  fetcher: typeof fetch,
): Promise<T> {
  const [args, kwargs] = methodArgs;
  return rpc<T>(config, 'object', 'execute_kw', [
    config.database,
    uid,
    config.apiKey,
    model,
    method,
    args,
    kwargs,
  ], fetcher);
}

async function rpc<T>(
  config: OdooConfig,
  service: 'common' | 'object',
  method: string,
  args: unknown[],
  fetcher: typeof fetch,
): Promise<T> {
  const response = await fetcher(`${config.url}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { service, method, args },
      id: crypto.randomUUID(),
    }),
  });

  if (!response.ok) {
    throw new OdooSyncError(`Odoo returned HTTP ${response.status}.`, 'rpc', 502);
  }

  const body = await response.json() as JsonRpcResponse<T>;
  if (body.error) {
    const name = body.error.data?.name || body.error.message || 'Odoo RPC error';
    throw new OdooSyncError(String(name).slice(0, 160), 'rpc', 502);
  }
  if (!Object.prototype.hasOwnProperty.call(body, 'result')) {
    throw new OdooSyncError('Odoo returned an incomplete response.', 'invalid_response', 502);
  }
  return body.result as T;
}

function readConfig(env: OdooEnv): OdooConfig {
  const required: Array<keyof OdooEnv> = [
    'ODOO_URL',
    'ODOO_DATABASE',
    'ODOO_USERNAME',
    'ODOO_API_KEY',
    'ODOO_MAILING_LIST_ID',
  ];
  const missing = required.filter((key) => !String(env[key] ?? '').trim());
  if (missing.length) {
    throw new OdooSyncError(`Missing Odoo configuration: ${missing.join(', ')}`, 'not_configured', 503);
  }

  const url = String(env.ODOO_URL).trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(url)) {
    throw new OdooSyncError('ODOO_URL must use HTTPS.', 'not_configured', 503);
  }

  return {
    url,
    database: String(env.ODOO_DATABASE).trim(),
    username: String(env.ODOO_USERNAME).trim(),
    apiKey: String(env.ODOO_API_KEY).trim(),
    mailingListId: positiveId(env.ODOO_MAILING_LIST_ID, 'ODOO_MAILING_LIST_ID'),
    eventName: String(env.ODOO_EVENT_NAME || 'All Energy 2026').trim(),
  };
}

function positiveId(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new OdooSyncError(`${name} must be a positive integer.`, 'not_configured', 503);
  }
  return parsed;
}

function requiredText(value: unknown, name: string, max: number): string {
  const result = optionalText(value, name, max);
  if (!result) throw new TypeError(`${name} is required`);
  return result;
}

function optionalText(value: unknown, name: string, max: number): string | null {
  if (value === null || typeof value === 'undefined' || value === '') return null;
  if (typeof value !== 'string') throw new TypeError(`${name} must be text`);
  const result = value.trim();
  if (result.length > max) throw new TypeError(`${name} is too long`);
  return result || null;
}

function scannerMarker(id: string): string {
  return `ENSPEC_SCANNER_ID:${id}`;
}
