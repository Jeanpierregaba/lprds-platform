import type { Metadata, Viewport } from 'next'
import { Fredoka, Work_Sans } from 'next/font/google'
import { Providers } from './providers'
import { PwaProvider } from '@/components/pwa/pwa-provider'
import './globals.css'

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

export const metadata: Metadata = {
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

export default function RootLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${fredoka.variable} ${workSans.variable}`}>
    <body>
      <PwaProvider>
        <Providers>
          {children}
          <Toaster position="top-right" richColors />
        </Providers>
      </PwaProvider>
    </body>
    </html>

  )
}