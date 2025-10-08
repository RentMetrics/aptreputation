import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverComponentsExternalPackages: ['@radix-ui/react-label'],
  },
  // Increase header size limits to prevent 431 errors
  serverRuntimeConfig: {
    maxHeaderSize: 16384,
  },
  // Clear browser cache issues
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
