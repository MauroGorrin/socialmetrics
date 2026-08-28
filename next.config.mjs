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
    // Puppeteer has dynamic requires and ships its own Chromium resolver —
    // keep it out of the bundle and load it from node_modules at runtime.
    serverComponentsExternalPackages: ['puppeteer'],
  },
};

export default nextConfig;
