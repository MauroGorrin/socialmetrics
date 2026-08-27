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
