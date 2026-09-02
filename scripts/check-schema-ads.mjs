import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

/**
 * DB-state assertion for the ads-api-sync foundation migration (E1-T1).
 * The repo has no `psql`, so this checks the applied schema through the
 * project's own `postgres` driver. Exits 0 when everything is in place.
 */

// Load .env.local the same way the e2e specs do.
try {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {
  // env already present
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (checked .env.local and the environment)');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false });

try {
  const [tableRows, indexRows, rlsRows, columnRows] = await Promise.all([
    sql`select 1 from information_schema.tables where table_name = 'platform_connection'`,
    sql`select 1 from pg_indexes where indexname = 'platform_connection_client_platform_unique'`,
    sql`select relrowsecurity from pg_class where relname = 'platform_connection'`,
    sql`select 1 from information_schema.columns where table_name = 'metric' and column_name = 'source'`,
  ]);

  const checks = {
    platform_connection_table: tableRows.length > 0,
    client_platform_unique_index: indexRows.length > 0,
    rls_enabled: rlsRows[0]?.relrowsecurity === true,
    metric_source_column: columnRows.length > 0,
  };

  console.log(checks);
  process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
} finally {
  await sql.end();
}
