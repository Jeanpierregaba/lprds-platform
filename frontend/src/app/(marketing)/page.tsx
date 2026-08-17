import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Baby, ShieldCheck, Sparkles, Users2 } from 'lucide-react'
import { MarketingButton } from '@/components/marketing/marketing-button'
import { Reveal } from '@/components/marketing/reveal'
import { CtaBand } from '@/components/marketing/cta-band'
import { STATS, WHY_US, SECTIONS, NEWS, BRAND } from '@/lib/marketing/data'
import heroImg from '@/assets/hero-img.png'

export const metadata: Metadata = {
  title: `${BRAND.name} — Crèche, Garderie & École Maternelle à Lomé`,
  description: 'Crèche, garderie et école maternelle moderne et bienveillante à Lomé, Togo. Un environnement sûr, joyeux et stimulant où chaque enfant explore et rayonne.',
}

const WHY_ITEMS = [
  { ...WHY_US[0], Icon: Users2 },
  { ...WHY_US[1], Icon: Sparkles },
  { ...WHY_US[2], Icon: Baby },
  { ...WHY_US[3], Icon: ShieldCheck },
] as const

export default function HomePage() {
  const sectionPreview = SECTIONS.slice(0, 3)
  const newsPreview = NEWS.slice(0, 3)
  const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      {/* Hero — DESIGN.md § 9 : titre + CTA à gauche, illustration de la crèche à droite. */}
      <section className="relative overflow-hidden bg-cream">
        {/* Décorations organiques discrètes — rayons et halo, sans surcharger. */}
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-primary/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-20 top-1/3 size-64 rounded-full bg-mint/70 blur-3xl" />

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 py-16 sm:py-24 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-navy">
              Crèche · Garderie · Maternelle
            </span>
            <h1 className="mt-6 font-display text-4xl leading-[1.05] text-navy drop-shadow-sm sm:text-5xl lg:text-6xl">
              Où chaque enfant <span className="text-secondary">explore</span> et <span className="text-secondary">rayonne</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg lg:mx-0">
              Votre enfant mérite un départ réussi : une structure où il grandit, apprend et s’épanouit en toute sécurité.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <MarketingButton href="/contact" size="lg" variant="primary">
                Réserver une visite
              </MarketingButton>
              <MarketingButton href="/nos-sections" size="lg" variant="outline">
                Découvrir nos sections
              </MarketingButton>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div aria-hidden className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-mint/70" />
            <div className="relative aspect-[16/9] overflow-hidden rounded-[2.5rem] shadow-soft ring-1 ring-border">
              <Image
                src={heroImg}
                alt="Enfants épanouis dans la cour de la crèche"
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Bandeau de confiance — sous le hero, jamais dedans. */}
      <section className="bg-primary py-10 text-primary-foreground">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 sm:grid-cols-4 lg:px-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display text-3xl sm:text-4xl">{s.value}</div>
              <div className="mt-1 text-xs text-primary-foreground/70 sm:text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pourquoi nous — grille asymétrique image + cartes, pas un simple split 50/50. */}
      <section className="px-6 py-20 sm:py-28 lg:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-5 lg:gap-16">
          <Reveal className="lg:col-span-2 lg:order-2" y={20}>
            <h2 className="font-display text-3xl text-primary sm:text-4xl">
              Pourquoi Les Petits Rayons de Soleil&nbsp;?
            </h2>
            <p className="mt-4 text-muted-foreground">
              Une équipe passionnée, un cadre pensé pour la sécurité et la découverte, et une pédagogie qui
              grandit avec votre enfant — de la crèche à la grande section.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4">
              {WHY_ITEMS.map(({ Icon, ...item }) => (
                <div key={item.label} className="rounded-2xl bg-muted p-5">
                  <Icon className="size-5 text-accent" />
                  {'value' in item && item.value && (
                    <div className="mt-3 font-display text-2xl text-primary">{item.value}</div>
                  )}
                  <p className={`text-sm text-foreground/80 ${'value' in item && item.value ? 'mt-1' : 'mt-3'}`}>
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal className="relative lg:order-1 lg:col-span-3" delay={0.1}>
            <div className="relative aspect-[4/3] overflow-hidden rounded-[2.5rem] shadow-xl">
              <Image src="/images/marketing/about-img.jpg" alt="Éducatrice avec des enfants" fill className="object-cover" sizes="(min-width: 1024px) 60vw, 100vw" />
            </div>
            <div className="absolute -bottom-6 -right-6 hidden aspect-[4/3] w-48 overflow-hidden rounded-3xl border-4 border-background shadow-xl sm:block">
              <Image src="/images/marketing/about-img-3.jpg" alt="Enfants qui jouent" fill className="object-cover" sizes="192px" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Nos sections — grille de cartes, familles d'âge. */}
      <section className="bg-muted/40 px-6 py-20 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl text-primary sm:text-4xl">Un parcours pensé pour chaque âge</h2>
            <p className="mt-4 text-muted-foreground">
              De la crèche à la grande section, chaque étape a son rythme, ses activités et son équipe dédiée.
            </p>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {sectionPreview.map((section, i) => (
              <Reveal key={section.id} delay={i * 0.08}>
                <Link
                  href="/nos-sections"
                  className="group block h-full overflow-hidden rounded-3xl bg-background shadow-sm ring-1 ring-border transition-all hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <Image
                      src={section.image}
                      alt={section.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(min-width: 640px) 33vw, 100vw"
                    />
                  </div>
                  <div className="p-6">
                    <span className="text-xs font-semibold uppercase tracking-wide text-accent">{section.ageRange}</span>
                    <h3 className="mt-1 font-display text-xl text-primary">{section.shortTitle}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
          <div className="mt-10 text-center">
            <MarketingButton href="/nos-sections" variant="outline">
              Voir toutes les sections
              <ArrowRight className="size-4" />
            </MarketingButton>
          </div>
        </div>
      </section>

      {/* Vie de la crèche — mosaïque photo, teaser de la galerie. */}
      <section className="px-6 py-20 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <Reveal>
              <h2 className="font-display text-3xl text-primary sm:text-4xl">La vie à la crèche, en images</h2>
              <p className="mt-3 max-w-lg text-muted-foreground">
                Ateliers, jeux, repas partagés, siestes paisibles — un aperçu du quotidien de nos petits rayons.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <MarketingButton href="/galerie" variant="outline">
                Toute la galerie
                <ArrowRight className="size-4" />
              </MarketingButton>
            </Reveal>
          </div>
          <Reveal delay={0.15}>
            <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { src: '/images/marketing/gallery-1.jpg', span: '' },
                { src: '/images/marketing/gallery-2.jpg', span: '' },
                { src: '/images/marketing/gallery-main.jpg', span: 'row-span-2' },
                { src: '/images/marketing/choose-img-v1.jpg', span: '' },
                { src: '/images/marketing/life-gard.jpg', span: '' },
              ].map((img, i) => (
                <div
                  key={img.src}
                  className={`relative aspect-square overflow-hidden rounded-2xl ${img.span} ${i === 2 ? 'sm:aspect-auto' : ''}`}
                >
                  <Image src={img.src} alt="" fill className="object-cover transition-transform duration-500 hover:scale-105" sizes="25vw" />
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Actualités — teaser éditorial. */}
      <section className="bg-muted/40 px-6 py-20 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <Reveal>
              <h2 className="font-display text-3xl text-primary sm:text-4xl">Nos dernières actualités</h2>
            </Reveal>
            <Reveal delay={0.1}>
              <MarketingButton href="/actualites" variant="outline">
                Toutes les actualités
                <ArrowRight className="size-4" />
              </MarketingButton>
            </Reveal>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {newsPreview.map((article, i) => (
              <Reveal key={article.id} delay={i * 0.08}>
                <Link
                  href={`/actualites/${article.id}`}
                  className="group block h-full rounded-3xl bg-background p-6 shadow-sm ring-1 ring-border transition-all hover:-translate-y-1 hover:shadow-lg"
                >
                  <span className="text-3xl">{article.emoji}</span>
                  <time className="mt-4 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {dateFormatter.format(new Date(article.date))}
                  </time>
                  <h3 className="mt-2 font-display text-lg leading-snug text-primary group-hover:underline">
                    {article.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{article.excerpt}</p>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  )
}
