// Exponential backoff retry for image-generation API calls. Retries on rate
// limits, 5xx responses, and transient network errors. Logs each retry so the
// user can see why a long run paused.

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
}

const RETRYABLE_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_PATTERNS = /rate.?limit|timeout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|fetch failed/i;

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; code?: number | string; message?: string };
  if (typeof e.status === 'number' && RETRYABLE_CODES.has(e.status)) return true;
  if (typeof e.code === 'number' && RETRYABLE_CODES.has(e.code)) return true;
  if (typeof e.code === 'string' && RETRYABLE_PATTERNS.test(e.code)) return true;
  if (typeof e.message === 'string' && RETRYABLE_PATTERNS.test(e.message)) return true;
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const { maxAttempts = 4, baseDelayMs = 1500, maxDelayMs = 30_000, label = 'request' } = opts;

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts - 1 || !isRetryable(err)) throw err;

      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) + Math.floor(Math.random() * 500);
      const reason = (err as { status?: number; message?: string }).status
        ?? (err as { message?: string }).message
        ?? 'transient';
      console.log(`  ⏳  ${label} attempt ${attempt + 1}/${maxAttempts} failed (${reason}), retrying in ${Math.round(delay / 1000)}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
