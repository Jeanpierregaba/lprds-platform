import type { Metadata } from 'next'
import { Newspaper } from 'lucide-react'
import { PageHero } from '@/components/marketing/page-hero'
import { NewsExplorer } from '@/components/marketing/news-explorer'
import { CtaBand } from '@/components/marketing/cta-band'
import { BRAND } from '@/lib/marketing/data'

export const metadata: Metadata = {
  title: `Actualités — ${BRAND.name}`,
  description: 'Suivez la vie quotidienne, les événements et les projets pédagogiques des Petits Rayons de Soleil.',
}

export default function NewsPage() {
  return (
    <>
      <PageHero
        title="Toute l’actualité de la crèche"
        subtitle="Suivez la vie quotidienne, les événements et les projets pédagogiques de nos petits rayons."
        badge="Actualités"
        Icon={Newspaper}
        image="/images/marketing/news-gard.jpg"
      />

      <section className="px-6 py-16 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <NewsExplorer />
        </div>
      </section>

      <CtaBand />
    </>
  )
}
