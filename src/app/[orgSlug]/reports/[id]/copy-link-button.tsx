'use client';

import { useState } from 'react';

/** Copies `text` to the clipboard; the only client bit on the report view. */
export function CopyLinkButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard blocked — the link is still visible next to this button
        }
      }}
      className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg)] hover:opacity-70"
    >
      {copied ? 'Copiado' : 'Copiar link'}
    </button>
  );
}
