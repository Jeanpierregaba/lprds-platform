import type { Metadata } from 'next'
import { Baby } from 'lucide-react'
import { PageHero } from '@/components/marketing/page-hero'
import { SectionsExplorer } from '@/components/marketing/sections-explorer'
import { CtaBand } from '@/components/marketing/cta-band'
import { BRAND } from '@/lib/marketing/data'

export const metadata: Metadata = {
  title: `Nos Sections — ${BRAND.name}`,
  description: 'De la crèche à la grande section maternelle : découvrez nos 7 sections d’âge, leurs activités et leur journée type.',
}

export default function SectionsPage() {
  return (
    <>
      <PageHero
        title="Un parcours pensé pour chaque âge"
        subtitle="De 3 mois à 8 ans, chaque section a son rythme, ses activités et une équipe dédiée pour accompagner votre enfant."
        badge="Nos sections"
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
