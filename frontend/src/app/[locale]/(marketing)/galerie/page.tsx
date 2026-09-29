import type { Metadata } from 'next'
import { localeAlternates } from '@/i18n/metadata'
import { getTranslations } from 'next-intl/server'
import { Images } from 'lucide-react'
import { PageHero } from '@/components/marketing/page-hero'
import { GalleryExplorer } from '@/components/marketing/gallery-explorer'
import { CtaBand } from '@/components/marketing/cta-band'
import { BRAND } from '@/lib/marketing/data'
import { fetchPublicGallery, fetchPublicGalleryCategories } from '@/lib/api/public-blog.api'

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'marketing.galleryPage.meta' })
  return {
    title: t('title', { name: BRAND.name }),
    description: t('description'),
    alternates: localeAlternates('/galerie', locale),
  }
}

export const dynamic = 'force-dynamic'

export default async function GalleryPage() {
  const t = await getTranslations('marketing.galleryPage')
  const photos = await fetchPublicGallery()
  const categories = await fetchPublicGalleryCategories()

  return (
    <>
      <PageHero
        title={t('title')}
        subtitle={t('subtitle')}
        badge={t('badge')}
        Icon={Images}
        image="/images/marketing/gallery-hero.png"
      />

      <section className="px-6 py-16 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <GalleryExplorer items={photos} categories={categories} />
        </div>
      </section>

      <CtaBand />
    </>
  )
}
