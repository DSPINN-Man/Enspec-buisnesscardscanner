// Cloudflare Pages Function — POST /api/sync
// Creates or updates an All Energy 2026 mailing contact through Odoo's JSON-RPC API.
// Odoo credentials stay in encrypted Cloudflare environment secrets.

import {
  OdooSyncError,
  parseScannerPayload,
  syncMailingContactToOdoo,
  type OdooEnv,
} from '../lib/odoo';

interface Env extends OdooEnv {
  SCANNER_ALLOWED_ORIGIN?: string;
}

const MAX_BODY_BYTES = 32 * 1024;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large', message: 'The contact payload is too large.' }, 413);
  }

  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) {
    return json({ error: 'unsupported_media_type', message: 'Expected application/json.' }, 415);
  }

  if (!isAllowedOrigin(request, env.SCANNER_ALLOWED_ORIGIN)) {
    return json({ error: 'origin_not_allowed', message: 'This scanner origin is not allowed.' }, 403);
  }

  try {
    const payload = parseScannerPayload(await request.json());
    const headerId = request.headers.get('Idempotency-Key');
    if (!headerId || headerId !== payload.id) {
      return json({ error: 'invalid_idempotency_key', message: 'The scan identifier is missing or invalid.' }, 400);
    }

    const result = await syncMailingContactToOdoo(payload, env);
    return json({
      ok: true,
      delivered: true,
      odooContactId: result.odooContactId,
      operation: result.operation,
    });
  } catch (err: unknown) {
    if (err instanceof TypeError) {
      return json({ error: 'invalid_payload', message: err.message }, 400);
    }
    if (err instanceof OdooSyncError) {
      return json({
        error: `odoo_${err.code}`,
        message: err.message,
        retryable: err.code !== 'not_configured' && err.code !== 'authentication',
      }, err.status);
    }
    return json({ error: 'sync_failed', message: 'Odoo sync failed unexpectedly.', retryable: true }, 500);
  }
};

function isAllowedOrigin(request: Request, configuredOrigin?: string): boolean {
  if (!configuredOrigin) return true;
  const origin = request.headers.get('Origin');
  return origin === configuredOrigin.replace(/\/$/, '');
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
