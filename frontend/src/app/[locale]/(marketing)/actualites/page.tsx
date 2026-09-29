import type { Metadata } from 'next'
import { Newspaper } from 'lucide-react'
import { PageHero } from '@/components/marketing/page-hero'
import { NewsExplorer } from '@/components/marketing/news-explorer'
import { CtaBand } from '@/components/marketing/cta-band'
import { BRAND } from '@/lib/marketing/data'
import { fetchPublicBlogPosts, fetchPublicBlogTags, sortByPublished } from '@/lib/api/public-blog.api'

export const metadata: Metadata = {
  title: `Actualités — ${BRAND.name}`,
  description: 'Suivez la vie quotidienne, les événements et les projets pédagogiques des Petits Rayons de Soleil.',
}

export const dynamic = 'force-dynamic'

export default async function NewsPage() {
  const [posts, tags] = await Promise.all([fetchPublicBlogPosts(), fetchPublicBlogTags()])

  return (
    <>
      <PageHero
        title="Toute l’actualité de la crèche"
        subtitle="Suivez la vie quotidienne, les événements et les projets pédagogiques de nos petits rayons."
        badge="Actualités"
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
