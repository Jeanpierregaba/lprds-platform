import type { Metadata } from 'next'
import { CloudOff } from 'lucide-react'
import Image from 'next/image'
import { getTranslations } from 'next-intl/server'

import { Link } from '@/i18n/navigation'
import { BRAND } from '@/lib/marketing/data'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pwa')
  return {
    title: t('offlineTitle'),
    // Repli technique du service worker : aucune raison de l'indexer, et une
    // page « Hors ligne » dans les résultats de recherche serait absurde.
    robots: { index: false, follow: false },
  }
}

export default async function OfflinePage() {
  const t = await getTranslations('pwa')

  return (
    <div className="grid min-h-dvh place-items-center bg-cream px-4 py-12">
      <div className="max-w-md rounded-3xl border border-primary/20 bg-background p-10 text-center shadow-xl">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-primary/15">
          <CloudOff className="size-8 text-primary" aria-hidden="true" />
        </div>
        <p className="font-display text-3xl font-bold text-navy">{t('offlineTitle')}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t('offlineBody')}
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Image
            src="/images/marketing/logo.png"
            alt={BRAND.name}
            width={120}
            height={40}
            className="h-10 w-auto object-contain"
          />
        </div>
        <Link href="/" className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-[0_4px_0_#D88D16] transition-all hover:translate-y-0.5 hover:shadow-none">
          {t('offlineRetry')}
        </Link>
      </div>
    </div>
  )
}
