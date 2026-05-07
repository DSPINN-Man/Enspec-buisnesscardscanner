import { describe, expect, it } from 'vitest';
import { getRetryDelayMs } from './backoff';

describe('getRetryDelayMs', () => {
  it('retries Gemini 503 busy errors quickly without hammering the API', () => {
    expect(getRetryDelayMs({ status: 503, message: 'Gemini is temporarily busy' }, 1)).toBe(60_000);
    expect(getRetryDelayMs({ status: 503, message: 'Gemini is temporarily busy' }, 3)).toBe(240_000);
  });

  it('backs off longer for quota and caps transient retries', () => {
    expect(getRetryDelayMs({ status: 429, message: 'rate limit' }, 1)).toBe(600_000);
    expect(getRetryDelayMs({ status: 503, message: 'busy' }, 10)).toBe(10 * 60_000);
  });
});
