// Cloudflare Pages Function — POST /api/sync
//
// Forwards a contact JSON to your email/CRM webhook (SendGrid, Postmark,
// Make.com, n8n, etc). If EMAIL_WEBHOOK_URL is unset we just acknowledge
// — useful while you're still wiring up delivery.

interface Env {
  EMAIL_WEBHOOK_URL?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const payload = await request.json();
    const idempotency = request.headers.get('Idempotency-Key') ?? '';

    if (!env.EMAIL_WEBHOOK_URL) {
      return json({ ok: true, delivered: false, reason: 'EMAIL_WEBHOOK_URL not set' });
    }

    const res = await fetch(env.EMAIL_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotency,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return json({ error: `webhook ${res.status}`, detail: await res.text() }, 502);
    return json({ ok: true, delivered: true });
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
