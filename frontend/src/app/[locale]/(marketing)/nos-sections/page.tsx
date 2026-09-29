import type { Metadata } from 'next'
import { localeAlternates } from '@/i18n/metadata'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Baby } from 'lucide-react'
import { PageHero } from '@/components/marketing/page-hero'
import { SectionsExplorer } from '@/components/marketing/sections-explorer'
import { CtaBand } from '@/components/marketing/cta-band'
import { BRAND } from '@/lib/marketing/data'

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'marketing.sectionsPage.meta' })
  return {
    title: t('title', { name: BRAND.name }),
    description: t('description'),
    alternates: localeAlternates('/nos-sections', locale),
  }
}

export default function SectionsPage() {
  const t = useTranslations('marketing.sectionsPage')
  return (
    <>
      <PageHero
        title={t('title')}
        subtitle={t('subtitle')}
        badge={t('badge')}
        Icon={Baby}
        image="/images/marketing/our-sec.png"
      />

      <section className="px-6 py-16 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionsExplorer />
        </div>
      </section>

      <CtaBand />
    </>
  )
}
