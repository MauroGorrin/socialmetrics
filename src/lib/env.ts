import { z } from 'zod';

/**
 * Environment contract. Validated once at module load; a missing or malformed
 * required variable throws a named error here rather than failing later at the
 * first query or request. No secret ever falls back to a default.
 */
const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.url(),
  SESSION_JWT_SECRET: z.string().min(1),
  SESSION_URL: z.url().optional(),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.email(),

  // Ad-platform sync (blueprints/ads-api-sync) — all optional. The feature is
  // gated at runtime by `integrationsConfig()` in src/lib/integrations.ts, never
  // by boot validation: the app runs exactly as before with none of these set.
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  GOOGLE_ADS_CLIENT_ID: z.string().optional(),
  GOOGLE_ADS_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
  OAUTH_REDIRECT_BASE_URL: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }

  return parsed.data;
}

export const env: Env = loadEnv();
