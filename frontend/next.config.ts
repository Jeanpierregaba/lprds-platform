import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// Branche `src/i18n/request.ts` sur le rendu serveur (chargement des messages).
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/**
 * Nombre de processus de build, quand l'environnement le dicte.
 *
 * ⚠️ Node compte les cœurs dans `/proc/cpuinfo`, qui expose ceux de la machine
 * HÔTE — pas la part que le cgroup accorde au conteneur. Sur le VPS (2 cœurs,
 * 4 Go), Next annonçait « using 31 workers » et lançait 31 processus chargeant
 * chacun l'application : la machine partait en swap, des pages qui se génèrent
 * en une seconde en prenaient soixante, et le déploiement dépassait la limite
 * de temps de l'action SSH. Le build ne CASSAIT pas — il n'aboutissait jamais,
 * ce qui est bien plus difficile à lire.
 *
 * Non défini (poste de développement), on laisse Next décider : là, le compte
 * de cœurs est juste.
 */
const buildCpus = Number(process.env.NEXT_BUILD_CPUS) || 0

const nextConfig: NextConfig = {
  output: 'standalone',
  ...(buildCpus > 0 && {
    experimental: {
      cpus: buildCpus,
      // Le nombre de workers découle AUSSI du découpage des pages : sans ce
      // plancher, 102 pages se répartissent en bien plus de lots que de cœurs.
      staticGenerationMinPagesPerWorker: 64,
    },
  }),
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
