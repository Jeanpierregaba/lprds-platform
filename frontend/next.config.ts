import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// Branche `src/i18n/request.ts` sur le rendu serveur (chargement des messages).
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  output: 'standalone',
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
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '8000' },
      { protocol: 'https', hostname: 'preprod.lespetitsrayonsdesoleil.net' },
      { protocol: 'https', hostname: 'lespetitsrayonsdesoleil.net' },
    ],
  },
}

export default withNextIntl(nextConfig)
