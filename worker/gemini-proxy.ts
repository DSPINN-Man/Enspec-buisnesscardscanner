// Cloudflare Worker — proxies the browser to Gemini 2.0 Flash.
//
// Why a proxy:
//   • Keeps GEMINI_API_KEY out of the client bundle.
//   • Normalises Gemini's response into our {fields, confidence, rawText} shape
//     so the frontend doesn't need to know about Google's payload format.
//   • Adds per-team allowlist / rate-limit hooks (stubbed — add as needed).
//
// Endpoints:
//   POST /api/extract   multipart form { image: File }          → structured JSON
//   POST /api/sync      application/json { ...contact }         → forwards to EMAIL_WEBHOOK
//
// Deploy: `npm run worker:deploy` (after `wrangler login` + setting secrets).
//   wrangler secret put GEMINI_API_KEY
//   wrangler secret put EMAIL_WEBHOOK_URL     # e.g. a SendGrid/Postmark webhook

export interface Env {
  GEMINI_API_KEY: string;
  EMAIL_WEBHOOK_URL?: string;
  ALLOWED_ORIGIN?: string; // e.g. https://cards.enspec.com
}

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT = `You are a precise business-card / conference-badge extractor.
Return a strict JSON object matching this shape — no prose, no markdown fences:

{
  "fields": {
    "name": string | null,
    "title": string | null,
    "company": string | null,
    "email": string | null,
    "phone": string | null,
    "website": string | null,
    "notes": string | null
  },
  "confidence": {
    "name": number, "title": number, "company": number,
    "email": number, "phone": number, "website": number, "notes": number
  },
  "rawText": string
}

Each confidence is 0.0 to 1.0 — your honest belief that the value is correct.
If a field is not present on the card return null and confidence 0.
Phone numbers: preserve country code if visible. Website: include scheme if shown, else bare domain.
Notes: free-form extras (office, social handles). Keep short or null.`;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const cors = corsHeaders(env.ALLOWED_ORIGIN);

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      if (url.pathname === '/api/extract' && req.method === 'POST') {
        return json(await handleExtract(req, env), 200, cors);
      }
      if (url.pathname === '/api/sync' && req.method === 'POST') {
        return json(await handleSync(req, env), 200, cors);
      }
      return new Response('not found', { status: 404, headers: cors });
    } catch (err: any) {
      return json({ error: String(err?.message ?? err) }, 500, cors);
    }
  },
};

async function handleExtract(req: Request, env: Env): Promise<unknown> {
  const form = await req.formData();
  const file = form.get('image');
  if (!(file instanceof File)) throw new Error('missing image');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const base64 = bytesToBase64(bytes);

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{
      role: 'user',
      parts: [
        { text: 'Extract the contact from this image.' },
        { inline_data: { mime_type: file.type || 'image/jpeg', data: base64 } },
      ],
    }],
    generation_config: {
      temperature: 0.1,
      response_mime_type: 'application/json',
    },
  };

  const res = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);

  const data = await res.json() as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = safeJSON(text);
  if (!parsed || typeof parsed !== 'object') throw new Error('gemini returned non-JSON');
  return parsed;
}

async function handleSync(req: Request, env: Env): Promise<unknown> {
  const payload = await req.json();
  if (!env.EMAIL_WEBHOOK_URL) return { ok: true, delivered: false, reason: 'no webhook configured' };
  const idempotency = req.headers.get('Idempotency-Key') ?? '';
  const res = await fetch(env.EMAIL_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotency },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`webhook ${res.status}`);
  return { ok: true, delivered: true };
}

// ---- helpers --------------------------------------------------------------

function corsHeaders(origin?: string) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
    'Vary': 'Origin',
  };
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

function safeJSON(s: string): unknown {
  try { return JSON.parse(s); } catch {
    // occasionally the model wraps JSON in ```json fences despite instructions
    const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) { try { return JSON.parse(m[1]); } catch { /* fallthrough */ } }
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}
