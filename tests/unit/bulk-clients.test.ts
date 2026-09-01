import { describe, expect, it } from 'vitest';
import { MAX_BULK_CLIENTS, parseBulkClients } from '@/lib/bulk-clients';

describe('parseBulkClients', () => {
  it('parses a bare name per line, defaulting the profile to ads', () => {
    const { rows, errors } = parseBulkClients('Cliente Uno\nCliente Dos\n');
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { name: 'Cliente Uno', reportProfile: 'ads' },
      { name: 'Cliente Dos', reportProfile: 'ads' },
    ]);
  });

  it('reads a profile after the last comma, by key or Spanish label', () => {
    const { rows } = parseBulkClients('A, organic\nB, Ambos\nC, Ads\nEmpresa, S.A., orgánico');
    expect(rows).toEqual([
      { name: 'A', reportProfile: 'organic' },
      { name: 'B', reportProfile: 'mixed' },
      { name: 'C', reportProfile: 'ads' },
      { name: 'Empresa, S.A.', reportProfile: 'organic' },
    ]);
  });

  it('skips blank lines, duplicates (case-insensitive), and unknown profiles', () => {
    const { rows, errors } = parseBulkClients('  \nCliente\ncliente\nOtro, xyz');
    expect(rows).toEqual([{ name: 'Cliente', reportProfile: 'ads' }]);
    expect(errors).toHaveLength(2);
    expect(errors.some((e) => e.includes('duplicado'))).toBe(true);
    expect(errors.some((e) => e.includes('no reconocido'))).toBe(true);
  });

  it('caps the batch and reports the overflow', () => {
    const raw = Array.from({ length: MAX_BULK_CLIENTS + 5 }, (_, i) => `Cliente ${i}`).join('\n');
    const { rows, errors } = parseBulkClients(raw);
    expect(rows).toHaveLength(MAX_BULK_CLIENTS);
    expect(errors.some((e) => e.includes(String(MAX_BULK_CLIENTS)))).toBe(true);
  });

  it('rejects a name over 120 characters', () => {
    const { rows, errors } = parseBulkClients(`${'x'.repeat(121)}\nOk`);
    expect(rows).toEqual([{ name: 'Ok', reportProfile: 'ads' }]);
    expect(errors[0]).toContain('120');
  });
});
