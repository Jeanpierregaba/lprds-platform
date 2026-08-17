import type { Metadata } from 'next'
import { Images } from 'lucide-react'
import { PageHero } from '@/components/marketing/page-hero'
import { GalleryExplorer } from '@/components/marketing/gallery-explorer'
import { CtaBand } from '@/components/marketing/cta-band'
import { BRAND } from '@/lib/marketing/data'

export const metadata: Metadata = {
  title: `Galerie — ${BRAND.name}`,
  description: 'La vie à la crèche en images : ateliers, jeux extérieurs, repas et fêtes des Petits Rayons de Soleil.',
}

export default function GalleryPage() {
  return (
    <>
      <PageHero
        title="La vie à la crèche en images"
        subtitle="Découvrez le quotidien joyeux de nos petits rayons de soleil à travers nos photos."
        badge="Galerie"
        Icon={Images}
        image="/images/marketing/gallery-main.jpg"
      />

      <section className="px-6 py-16 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <GalleryExplorer />
        </div>
      </section>

      <CtaBand />
    </>
  )
}
