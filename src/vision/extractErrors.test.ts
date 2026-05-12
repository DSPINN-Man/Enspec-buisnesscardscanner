import { describe, expect, it } from 'vitest';
import { createExtractError, getReviewErrorHint } from './extractErrors';

describe('createExtractError', () => {
  it('turns Gemini 503 responses into a friendly retryable busy error', async () => {
    const response = new Response(JSON.stringify({
      error: 'gemini_unavailable',
      message: 'Gemini is temporarily busy. Your card was saved and will retry automatically.',
      retryable: true,
      upstreamStatus: 503,
    }), { status: 503, statusText: 'Service Unavailable' });

    const error = await createExtractError(response);

    expect(error.message).toBe('Gemini is temporarily busy. Your card was saved and will retry automatically.');
    expect(error.status).toBe(503);
    expect(error.retryable).toBe(true);
    expect(error.reason).toBe('busy');
  });

  it('keeps quota and auth errors specific', async () => {
    const quota = await createExtractError(new Response('', { status: 429 }));
    const auth = await createExtractError(new Response('', { status: 403 }));

    expect(quota.reason).toBe('quota');
    expect(quota.retryable).toBe(true);
    expect(auth.reason).toBe('auth');
    expect(auth.retryable).toBe(false);
  });
});

describe('getReviewErrorHint', () => {
  it('surfaces project access denial instead of blaming a missing key', () => {
    const hint = getReviewErrorHint('Gemini access denied: Your project has been denied access. Please contact support.');

    expect(hint.kind).toBe('auth');
    expect(hint.message).toContain('project has been denied access');
    expect(hint.message).not.toContain('GEMINI_API_KEY');
  });

  it('does not expose raw JSON for Gemini high-demand failures', () => {
    const hint = getReviewErrorHint('Extract API 503: {"error":"gemini 503","detail":"This model is currently experiencing high demand","status":"UNAVAILABLE"}');

    expect(hint.kind).toBe('busy');
    expect(hint.message).toContain('AI service is busy');
    expect(hint.message).not.toContain('{');
  });
});
