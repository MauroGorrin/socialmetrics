/**
 * Deliberate error page (E3-T6 acceptance): rendering it throws so the
 * `[orgSlug]/error.tsx` boundary can be exercised. Not linked from anywhere.
 */
export default function DevErrorPage(): never {
  throw new Error('Deliberate render error (E3-T6)');
}
