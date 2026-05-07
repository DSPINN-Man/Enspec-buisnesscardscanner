export function getRetryDelayMs(error: { status?: number; message?: string }, attempts: number): number {
  const message = String(error.message ?? '');
  const status = error.status;

  if (status === 429 || /\b429\b|quota|rate limit|RESOURCE_EXHAUSTED/i.test(message)) {
    return cappedDelay(5 * 60_000, attempts, 30 * 60_000);
  }

  if (status === 503 || status === 502 || /\b50[23]\b|UNAVAILABLE|high demand|overloaded|capacity|temporarily busy/i.test(message)) {
    return cappedDelay(30_000, attempts, 10 * 60_000);
  }

  return cappedDelay(60_000, attempts, 60 * 60_000);
}

function cappedDelay(baseMs: number, attempts: number, capMs: number): number {
  return Math.min(baseMs * 2 ** Math.max(1, attempts), capMs);
}
