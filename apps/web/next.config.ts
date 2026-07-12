import type { NextConfig } from 'next';
import { resolve } from 'node:path';

const apiOrigin = process.env.GARAGEOS_API_ORIGIN ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve(__dirname, '../..'),
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
