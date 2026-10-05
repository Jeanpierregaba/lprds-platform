import type { Metadata } from 'next'
import { localeAlternates } from '@/i18n/metadata'
import { getLocale, getTranslations } from 'next-intl/server'
import { Images } from 'lucide-react'
import { PageHero } from '@/components/marketing/page-hero'
import { GalleryExplorer } from '@/components/marketing/gallery-explorer'
import { CtaBand } from '@/components/marketing/cta-band'
import { BRAND } from '@/lib/marketing/data'
import { fetchPublicGallery, fetchPublicGalleryCategories } from '@/lib/api/public-blog.api'
import { asAppLocale } from '@/i18n/routing'

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
  // Les noms de catégories sont saisis par l'établissement : ils sont traduits
  // en base, pas par les catalogues. La langue part donc explicitement à l'API.
  const locale = asAppLocale(await getLocale())
  const [photos, categories] = await Promise.all([
    fetchPublicGallery(undefined, locale),
    fetchPublicGalleryCategories(locale),
  ])

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
