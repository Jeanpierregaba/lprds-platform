import type { Metadata } from 'next'
import Image from 'next/image'
import { Compass, Heart, Target } from 'lucide-react'
import { PageHero } from '@/components/marketing/page-hero'
import { CtaBand } from '@/components/marketing/cta-band'
import { Reveal } from '@/components/marketing/reveal'
import { PARTNERS, STATS, BRAND } from '@/lib/marketing/data'

export const metadata: Metadata = {
  title: `À Propos — ${BRAND.name}`,
  description: 'Découvrez l’histoire, la mission et l’équipe de professionnels des Petits Rayons de Soleil, crèche et école maternelle à Lomé.',
}

const HISTORY_PARAGRAPHS = [
  'Les Petits Rayons de Soleil est née d’une passion pour la petite enfance et d’un rêve simple : offrir aux enfants un lieu où ils puissent grandir dans la joie, la sécurité et la confiance.',
  `Notre établissement grandit jour après jour, tout comme les sourires des enfants qui y ont fait leurs premiers pas. Aujourd’hui, ${BRAND.name} est devenue une référence d’accueil de qualité, alliant pédagogie moderne, bienveillance et engagement éducatif, tout en restant fidèle à son esprit familial.`,
  'Notre évolution s’est naturellement poursuivie avec l’ouverture de l’école maternelle, afin d’accompagner les enfants dans la continuité de leur développement jusqu’à l’entrée à l’école primaire.',
  'Chaque jour, notre équipe met tout son cœur à créer un environnement où les enfants apprennent, explorent et s’épanouissent — car ici, grandir est une aventure lumineuse.',
]

export default function AboutPage() {
  return (
    <>
      <PageHero
        title="Notre histoire et nos valeurs"
        subtitle="Découvrez l’histoire des Petits Rayons de Soleil et l’équipe passionnée qui accompagne vos enfants chaque jour."
        badge="À propos"
        Icon={Heart}
        image="/images/marketing/about-sec.jpg"
      />

      {/* Notre histoire */}
      <section className="px-6 py-20 sm:py-28 lg:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <h2 className="font-display text-3xl text-primary sm:text-4xl">Notre histoire</h2>
            <div className="mt-6 space-y-4 text-muted-foreground">
              {HISTORY_PARAGRAPHS.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="relative aspect-[4/3] overflow-hidden rounded-[2.5rem] shadow-xl">
              <Image src="/images/marketing/about-img.jpg" alt="Enfants et éducatrices dans un environnement bienveillant" fill className="object-cover" sizes="(min-width: 1024px) 50vw, 100vw" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="bg-muted/40 px-6 py-20 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl text-primary sm:text-4xl">Notre mission et notre vision</h2>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
            <Reveal className="rounded-3xl bg-background p-8 shadow-sm ring-1 ring-border">
              <Target className="size-10 text-primary" />
              <h3 className="mt-5 font-display text-xl text-primary">Notre Mission</h3>
              <p className="mt-3 text-muted-foreground">
                Offrir aux enfants un environnement qui nourrit leur curiosité et leur créativité, tout en
                développant leur capacité à interagir avec les autres et à explorer le monde. Nous accompagnons
                chaque enfant dans son parcours unique, en valorisant la confiance, la responsabilisation et la
                découverte personnelle.
              </p>
            </Reveal>
            <Reveal delay={0.1} className="rounded-3xl bg-background p-8 shadow-sm ring-1 ring-border">
              <Compass className="size-10 text-accent" />
              <h3 className="mt-5 font-display text-xl text-primary">Notre Vision</h3>
              <p className="mt-3 text-muted-foreground">
                Être un établissement où l’éducation va au-delà de l’apprentissage académique, en préparant les
                enfants à devenir des individus épanouis, autonomes et ouverts sur le monde. Une communauté
                éducative inspirante, où parents et éducateurs bâtissent ensemble un futur enrichissant pour
                chaque enfant.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-primary py-14 text-primary-foreground">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 sm:grid-cols-4 lg:px-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display text-3xl sm:text-4xl">{s.value}</div>
              <div className="mt-1 text-xs text-primary-foreground/70 sm:text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Nos partenaires */}
      <section className="px-6 py-20 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mx-auto max-w-3xl text-center">
            <h2 className="font-display text-3xl text-primary sm:text-4xl">Nos partenaires</h2>
            <p className="mt-4 text-muted-foreground">
              Pour un accompagnement complet, {BRAND.name} s’entoure de professionnels spécialisés qui
              interviennent régulièrement auprès des enfants et complètent notre approche pédagogique.
            </p>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PARTNERS.map((partner, i) => (
              <Reveal key={partner.name} delay={(i % 3) * 0.06} className="rounded-2xl bg-muted/50 p-6 text-center">
                <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-accent/15">
                  <span className="font-display text-xl text-primary">{partner.name.charAt(0)}</span>
                </div>
                <h3 className="mt-4 font-display text-base text-primary">{partner.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{partner.role}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  )
}
