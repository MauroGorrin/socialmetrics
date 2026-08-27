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
};

export default nextConfig;
