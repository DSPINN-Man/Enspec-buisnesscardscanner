// Cloudflare Pages Function - POST /api/extract
//
// Same-origin proxy to Gemini. Pages serves this automatically; no separate
// Worker, no CORS, no second URL. Secrets are configured in:
// Pages -> Settings -> Variables and Secrets.

interface Env {
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  GEMINI_FALLBACK_MODEL?: string;
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const DEFAULT_GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash';
const LAST_RESORT_GEMINI_MODEL = 'gemini-2.5-flash-lite';

const SYSTEM_PROMPT = `You are a precise business-card / conference-badge extractor.
Return a strict JSON object matching this shape - no prose, no markdown fences:

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
  "rawText": string,
  "boundingBox": { "x": number, "y": number, "width": number, "height": number } | null
}

Each confidence is 0.0 to 1.0 - your honest belief that the value is correct.
If a field is not present on the card return null and confidence 0.
Phone numbers: preserve country code if visible. Website: include scheme if shown, else bare domain.
Notes: free-form extras (office, social handles). Keep short or null.

boundingBox: locate the rectangular outline of the printed card or badge in the
image. Return coordinates NORMALISED to the image dimensions (each value 0..1).
x, y are the top-left corner; width/height are the box size. Be tight - exclude
hands, shadows, and surrounding surface. If no clear card is visible, return null.`;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GEMINI_API_KEY) {
    return json({ error: 'GEMINI_API_KEY not configured in Pages env vars' }, 500);
  }

  try {
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof File)) return json({ error: 'missing image' }, 400);

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

    const gemini = await generateWithGemini(body, env);
    if (!gemini.ok) return json(gemini.body, gemini.status);

    const text = gemini.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = safeJSON(text);
    if (!parsed || typeof parsed !== 'object') {
      return json({ error: 'gemini returned non-JSON', raw: text }, 502);
    }
    return json(parsed);
  } catch (err: any) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
};

type GeminiSuccess = { ok: true; data: any; model: string };
type GeminiFailure = { ok: false; status: number; body: Record<string, unknown> };
type GeminiResult = GeminiSuccess | GeminiFailure;

async function generateWithGemini(body: unknown, env: Env): Promise<GeminiResult> {
  const plans = getGeminiModelPlans(env);

  let lastFailure: GeminiFailure | null = null;

  for (const plan of plans) {
    for (let attempt = 1; attempt <= plan.attempts; attempt++) {
      const res = await fetch(`${geminiUrl(plan.model)}?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        return { ok: true, data: await res.json(), model: plan.model };
      }

      const detail = await res.text().catch(() => '');
      lastFailure = toGeminiFailure(res.status, plan.model, detail);

      if (!isRetryableGeminiFailure(lastFailure)) return lastFailure;
      if (attempt < plan.attempts) await sleep(700 * attempt);
    }
  }

  return lastFailure ?? {
    ok: false,
    status: 502,
    body: {
      error: 'gemini_unavailable',
      message: 'Gemini is temporarily busy. Your card was saved and will retry automatically.',
      retryable: true,
    },
  };
}

export function getGeminiModelPlans(env: Pick<Env, 'GEMINI_MODEL' | 'GEMINI_FALLBACK_MODEL'>): Array<{ model: string; attempts: number }> {
  const candidates = [
    env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    env.GEMINI_FALLBACK_MODEL || DEFAULT_GEMINI_FALLBACK_MODEL,
    LAST_RESORT_GEMINI_MODEL,
  ];

  return Array.from(new Set(candidates.filter(Boolean))).map((model, index) => ({
    model,
    attempts: index === 0 ? 2 : 1,
  }));
}

function geminiUrl(model: string): string {
  return `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;
}

function isRetryableGeminiFailure(failure: GeminiFailure): boolean {
  const status = failure.status;
  const detail = String(failure.body.detail ?? failure.body.message ?? failure.body.error ?? '');

  if (status === 500 || status === 502 || status === 503 || status === 504) return true;

  return (status === 400 || status === 404) && /model|not found|unsupported|unavailable|deprecated/i.test(detail);
}

function toGeminiFailure(status: number, model: string, detail: string): GeminiFailure {
  const isBusy = status === 500 || status === 502 || status === 503 || status === 504;
  const isQuota = status === 429;
  const isAuth = status === 401 || status === 403;

  return {
    ok: false,
    status,
    body: {
      error: isBusy ? 'gemini_unavailable' : isQuota ? 'gemini_quota' : isAuth ? 'gemini_auth' : `gemini_${status}`,
      message: isBusy
        ? 'Gemini is temporarily busy. Your card was saved and will retry automatically.'
        : isQuota
          ? 'Gemini rate limit hit. Your card was saved and will retry automatically in a few minutes.'
          : isAuth
            ? 'Gemini rejected the API key. Check GEMINI_API_KEY in Cloudflare Pages Variables and Secrets.'
            : 'Gemini extraction failed. Your card was saved and will retry automatically.',
      retryable: !isAuth,
      upstreamStatus: status,
      model,
      detail: detail.slice(0, 500),
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function safeJSON(s: string): unknown {
  try { return JSON.parse(s); } catch {
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
