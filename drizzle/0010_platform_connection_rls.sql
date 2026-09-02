-- platform_connection holds encrypted OAuth tokens. Enable RLS with NO policy:
-- anon / authenticated (PostgREST) get zero rows; only the server's direct
-- Drizzle connection and the service_role can read or write it. Mirrors the
-- deny-by-default posture appropriate for a secrets table — unlike the other
-- business tables in 0001_rls_policies.sql, this one gets no SELECT policy.
ALTER TABLE "platform_connection" ENABLE ROW LEVEL SECURITY;
