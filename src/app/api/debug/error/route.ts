import { NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';

/**
 * Deliberate error endpoint (E3-T6 acceptance): captures a synthetic exception
 * through the same path a real one takes and returns its request id so the
 * hardening test can assert the error was logged with a reference.
 */
export function GET(): NextResponse {
  const requestId = captureException(new Error('Deliberate test error (E3-T6)'), {
    route: '/api/debug/error',
  });
  return NextResponse.json(
    { error: 'Test error captured', requestId },
    { status: 500 },
  );
}
