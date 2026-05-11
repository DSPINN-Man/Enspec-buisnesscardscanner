import { describe, expect, it } from 'vitest';
import { isDueForSync } from './index';

describe('isDueForSync', () => {
  it('keeps automatic retries behind backoff but lets manual sync force a retry', () => {
    const now = 1_000;
    const blockedByBackoff = { nextAttemptAt: now + 60_000 };

    expect(isDueForSync(blockedByBackoff, now)).toBe(false);
    expect(isDueForSync(blockedByBackoff, now, true)).toBe(true);
  });
});
