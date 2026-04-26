// Cloudflare Pages Function — POST /api/extract
//
// Same-origin proxy to Gemini 2.0 Flash. Pages serves this automatically;
// no separate Worker, no CORS, no second URL. Secrets configured in:
// Pages → Settings → Variables and Secrets.

interface Env {
  GEMINI_API_KEY: string;
}

// Model: gemini-2.5-flash is the current free-tier vision model available
// to new API keys. (gemini-2.0-flash was deprecated for new users.)
// Use the alias `gemini-flash-latest` if you'd rather track Google's
// current default automatically.
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
  "rawText": string,
  "boundingBox": { "x": number, "y": number, "width": number, "height": number } | null
}

Each confidence is 0.0 to 1.0 — your honest belief that the value is correct.
If a field is not present on the card return null and confidence 0.
Phone numbers: preserve country code if visible. Website: include scheme if shown, else bare domain.
Notes: free-form extras (office, social handles). Keep short or null.

boundingBox: locate the rectangular outline of the printed card or badge in the
image. Return coordinates NORMALISED to the image dimensions (each value 0..1).
x, y are the top-left corner; width/height are the box size. Be tight — exclude
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

    const res = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // Pass the upstream status through so the client can react specifically
      // to 429 (rate limit) and 401/403 (bad key) — wrapping everything in 502
      // hides those signals from the queue's backoff logic.
      const detail = await res.text();
      return json({ error: `gemini ${res.status}`, detail }, res.status);
    }

    const data = await res.json() as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = safeJSON(text);
    if (!parsed || typeof parsed !== 'object') {
      return json({ error: 'gemini returned non-JSON', raw: text }, 502);
    }
    return json(parsed);
  } catch (err: any) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
};

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
