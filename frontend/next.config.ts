import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Proxy les appels /api/* vers le backend FastAPI en dev
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/v1/:path*`,
      },
    ]
  },
  images: {
    // Domaines autorisés pour next/image
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '8000' },
    ],
  },
}

export default nextConfig