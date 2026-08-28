import 'server-only';

/**
 * Minimal structured logger. Every error line carries a request id so a report
 * from a user ("reference X") can be found in the logs.
 */

type Level = 'info' | 'warn' | 'error';

export function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function log(level: Level, message: string, context: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...context,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
