import { existsSync } from 'node:fs';
import type { Config } from 'drizzle-kit';

// drizzle-kit does not read .env files itself; load the first one that exists
// so `pnpm db:generate` / `db:migrate` see DATABASE_URL.
for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set — add it to .env.local (see .env.example)');
}

export default {
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
} satisfies Config;
