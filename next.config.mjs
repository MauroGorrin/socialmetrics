/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  eslint: {
    // Linting is handled by Biome via `pnpm lint`, not ESLint.
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Puppeteer / the packaged Chromium have dynamic requires and their own
    // binary resolvers — keep them out of the bundle, load from node_modules.
    serverComponentsExternalPackages: [
      'puppeteer',
      'puppeteer-core',
      '@sparticuz/chromium-min',
      // Google Ads client: native-ish deps (google-gax / protobufjs) with dynamic
      // requires — load from node_modules, never bundle. Server-only, see
      // src/server/providers/google-ads.ts.
      'google-ads-api',
    ],
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
