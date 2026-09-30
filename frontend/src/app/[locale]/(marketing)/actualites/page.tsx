import type { Metadata } from 'next'
import { localeAlternates } from '@/i18n/metadata'
import { getLocale, getTranslations } from 'next-intl/server'
import { Newspaper } from 'lucide-react'
import { PageHero } from '@/components/marketing/page-hero'
import { NewsExplorer } from '@/components/marketing/news-explorer'
import { CtaBand } from '@/components/marketing/cta-band'
import { BRAND } from '@/lib/marketing/data'
import { fetchPublicBlogPosts, fetchPublicBlogTags, sortByPublished } from '@/lib/api/public-blog.api'
import { asAppLocale } from '@/i18n/routing'

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'marketing.newsPage.meta' })
  return {
    title: t('title', { name: BRAND.name }),
    description: t('description'),
    alternates: localeAlternates('/actualites', locale),
  }
}

export const dynamic = 'force-dynamic'

export default async function NewsPage() {
  const t = await getTranslations('marketing.newsPage')
  // La locale vient du segment d'URL (page rendue côté serveur) et part
  // explicitement à l'API : le contenu des articles est traduit en base, pas
  // par les catalogues du frontend.
  const locale = asAppLocale(await getLocale())
  const [posts, tags] = await Promise.all([
    fetchPublicBlogPosts(undefined, locale),
    fetchPublicBlogTags(),
  ])

  return (
    <>
      <PageHero
        title={t('title')}
        subtitle={t('subtitle')}
        badge={t('badge')}
        Icon={Newspaper}
        image="/images/marketing/news-gard.png"
      />

      <section className="px-6 py-16 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <NewsExplorer articles={sortByPublished(posts)} tags={tags} />
        </div>
      </section>

      <CtaBand />
    </>
  )
}
