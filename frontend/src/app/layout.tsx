import type { Metadata } from 'next'
import { Fredoka, Work_Sans } from 'next/font/google'
import { Providers } from './providers'
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
}

export default function RootLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${fredoka.variable} ${workSans.variable}`}>
    <body>
      <Providers>
        {children}
        <Toaster position="top-right" richColors />
      </Providers>
    </body>
    </html>

  )
}