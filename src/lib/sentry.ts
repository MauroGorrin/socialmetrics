import 'server-only';

import { log, newRequestId } from '@/lib/logging';

/**
 * Error-tracking seam. Structured-logs every captured error with a request id;
 * when `SENTRY_DSN` is configured it also forwards to Sentry. Kept dependency-
 * free until a DSN exists — `@sentry/nextjs` is added at that point and wired
 * in behind this same `captureException` signature.
 */

export type ErrorContext = {
  requestId?: string;
  route?: string;
  userId?: string;
  [key: string]: unknown;
};

const SENTRY_DSN = process.env.SENTRY_DSN;

export function captureException(error: unknown, context: ErrorContext = {}): string {
  const requestId = context.requestId ?? newRequestId();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  log('error', message, { ...context, requestId, stack, sentry: Boolean(SENTRY_DSN) });

  if (SENTRY_DSN) {
    // A DSN is set but @sentry/nextjs is not a dependency yet — record intent
    // so the gap is visible rather than silently swallowed.
    log('warn', 'sentry: DSN configured but SDK not installed', { requestId });
  }

  return requestId;
}
