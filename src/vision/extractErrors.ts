export type ExtractErrorReason = 'busy' | 'quota' | 'auth' | 'offline' | 'unknown';

export interface ExtractError extends Error {
  status?: number;
  retryable: boolean;
  reason: ExtractErrorReason;
}

export interface ReviewErrorHint {
  kind: ExtractErrorReason;
  message: string;
}

const BUSY_MESSAGE = 'Gemini is temporarily busy. Your card was saved and will retry automatically.';
const QUOTA_MESSAGE = 'Gemini rate limit hit. Your card was saved and will retry automatically in a few minutes.';
const AUTH_MESSAGE = 'Gemini rejected the API key. Check GEMINI_API_KEY in Cloudflare Pages Variables and Secrets.';

export function makeExtractError(
  message: string,
  reason: ExtractErrorReason,
  options: { status?: number; retryable?: boolean } = {},
): ExtractError {
  const error = new Error(message) as ExtractError;
  error.status = options.status;
  error.reason = reason;
  error.retryable = options.retryable ?? reason !== 'auth';
  return error;
}

export async function createExtractError(response: Response): Promise<ExtractError> {
  const body = await readErrorBody(response);
  const serverMessage = typeof body?.message === 'string' ? body.message : null;
  const combined = [
    response.status,
    response.statusText,
    serverMessage,
    typeof body?.error === 'string' ? body.error : null,
    typeof body?.detail === 'string' ? body.detail : null,
  ].filter(Boolean).join(' ');

  if (response.status === 429 || /quota|rate limit|RESOURCE_EXHAUSTED/i.test(combined)) {
    return makeExtractError(serverMessage || QUOTA_MESSAGE, 'quota', { status: response.status, retryable: true });
  }

  if (response.status === 401 || response.status === 403 || /api key|permission|auth|PERMISSION_DENIED/i.test(combined)) {
    return makeExtractError(serverMessage || AUTH_MESSAGE, 'auth', { status: response.status, retryable: false });
  }

  if (response.status === 503 || response.status === 502 || /UNAVAILABLE|high demand|overloaded|capacity|temporarily busy/i.test(combined)) {
    return makeExtractError(serverMessage || BUSY_MESSAGE, 'busy', { status: response.status, retryable: true });
  }

  return makeExtractError(`Extract API ${response.status}: ${serverMessage || response.statusText || 'Request failed'}`, 'unknown', {
    status: response.status,
    retryable: response.status >= 500,
  });
}

export function getReviewErrorHint(errorText: string): ReviewErrorHint {
  if (/project has been denied access/i.test(errorText)) {
    return {
      kind: 'auth',
      message: 'Gemini project has been denied access. Create a new Google AI Studio API key/project or contact Google support, then replace the Cloudflare secret.',
    };
  }

  if (/\b429\b|quota|rate limit|RESOURCE_EXHAUSTED/i.test(errorText)) {
    return {
      kind: 'quota',
      message: 'Hit Gemini rate limits. The card is saved and will retry automatically in a few minutes.',
    };
  }

  if (/\b40[13]\b|API key|authentication|permission|PERMISSION_DENIED/i.test(errorText)) {
    return {
      kind: 'auth',
      message: 'Gemini rejected the API key. Check GEMINI_API_KEY in Cloudflare Pages Variables and Secrets, then redeploy.',
    };
  }

  if (/\b50[23]\b|UNAVAILABLE|high demand|overloaded|capacity|temporarily busy|service unavailable/i.test(errorText)) {
    return {
      kind: 'busy',
      message: 'AI service is busy. This card is saved and will retry automatically; you can edit the fields manually meanwhile.',
    };
  }

  return {
    kind: 'unknown',
    message: 'Extraction failed. The card is saved and the queue will retry automatically.',
  };
}

async function readErrorBody(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text };
  }
}
