import type { Metadata } from 'next'
import { CloudOff } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Hors ligne',
  robots: { index: false, follow: false },
}

export default function OfflinePage() {
  return (
    <div className="grid min-h-dvh place-items-center bg-cream px-4 py-12">
      <div className="max-w-md rounded-3xl border border-primary/20 bg-background p-10 text-center shadow-xl">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-primary/15">
          <CloudOff className="size-8 text-primary" aria-hidden="true" />
        </div>
        <p className="font-display text-3xl font-bold text-navy">Hors ligne</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          La connexion a été perdue. Les pages mises en cache restent consultables ;
          reconnectez-vous pour retrouver l&rsquo;ensemble de la plateforme.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Image
            src="/images/marketing/logo.png"
            alt="Les Petits Rayons de Soleil"
            width={120}
            height={40}
            className="h-10 w-auto object-contain"
          />
        </div>
        <Link href="/" className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-[0_4px_0_#D88D16] transition-all hover:translate-y-0.5 hover:shadow-none">
          Réessayer
        </Link>
      </div>
    </div>
  )
}