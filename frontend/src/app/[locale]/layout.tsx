import type { Metadata, Viewport } from 'next'
import { Fredoka, Work_Sans } from 'next/font/google'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { notFound } from 'next/navigation'
import { Providers } from '../providers'
import { PwaProvider } from '@/components/pwa/pwa-provider'
import { routing } from '@/i18n/routing'
import '../globals.css'

import { Toaster } from '@/components/ui/sonner'

// Polices du design system — cf. DESIGN.md § 3 Typography Rules.
// "Fredoka One" (display) a été fusionnée dans la famille variable "Fredoka"
// sur Google Fonts ; on ne charge que le poids 400 utilisé par la spec.
const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-fredoka',
  display: 'swap',
})

const workSans = Work_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-work-sans',
  display: 'swap',
})

/** Origine publique du site — sert de base aux URL absolues des balises
 *  `hreflang`, que les moteurs de recherche exigent absolues. En développement,
 *  on retombe sur localhost : les balises restent cohérentes et vérifiables. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: process.env.NEXT_PUBLIC_APP_NAME ?? 'LPRDS',
  description: 'Gestion de crèche et école maternelle',
  applicationName: process.env.NEXT_PUBLIC_APP_NAME ?? 'LPRDS',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LPRDS',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: '/icons/icon-192.png',
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#F5AA2D',
}

/** Pré-rend les deux langues au build plutôt qu'à la première visite. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  // Le middleware ne laisse normalement passer que des locales connues, mais
  // une route peut être atteinte hors de ce chemin (pré-rendu, lien forgé) —
  // une locale inconnue doit donner un 404, jamais un rendu à moitié traduit.
  if (!hasLocale(routing.locales, locale)) notFound()

  return (
    <html lang={locale} suppressHydrationWarning className={`${fredoka.variable} ${workSans.variable}`}>
    <body>
      <NextIntlClientProvider>
        <PwaProvider>
          <Providers>
            {children}
            <Toaster position="top-right" richColors />
          </Providers>
        </PwaProvider>
      </NextIntlClientProvider>
    </body>
    </html>

  )
}