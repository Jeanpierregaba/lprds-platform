import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Newspaper, Baby, Cloud, Sun } from 'lucide-react'
import { DifferenceTimeline } from '@/components/marketing/difference-timeline'
import { Doodle } from '@/components/marketing/doodle'
import { SectionDivider } from '@/components/marketing/section-divider'
import { JoinTimeline } from '@/components/marketing/join-timeline'
import { MarketingButton } from '@/components/marketing/marketing-button'
import { Reveal } from '@/components/marketing/reveal'
import { CtaBand } from '@/components/marketing/cta-band'
import { STATS, SECTIONS, BRAND } from '@/lib/marketing/data'
import { fetchPublicBlogPosts, sortByPublished, fetchPublicGallery } from '@/lib/api/public-blog.api'
import { GALLERY_PHOTO_CATEGORIES } from '@/types/blog'
import { cn } from '@/lib/utils/cn'
import heroImg from '@/assets/hero-img.png'

// Icône Lucide par section (aperçu accueil : 3 sections crèche).
const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  creche_etoile: Baby,
  creche_nuage: Cloud,
  creche_soleil: Sun,
}

// Style « note épinglée » inspiré de la maquette : panneau pastel intérieur,
// numéro manuscrit, punaise colorée, légère rotation en quinconce.
const SECTION_PIN_STYLES = [
  { panel: 'bg-[#009f98]', number: 'text-[#ffffff]', pin: 'bg-[#009f98]', rotate: 'sm:-rotate-2', offset: '' },
  { panel: 'bg-[#f5a82e]', number: 'text-[#ffffff]', pin: 'bg-[#f5a82e]', rotate: 'sm:rotate-2', offset: 'sm:mt-10' },
  { panel: 'bg-[#174f33]', number: 'text-[#ffffff]', pin: 'bg-[#174f33]', rotate: 'sm:-rotate-1', offset: '' },
] as const

export const metadata: Metadata = {
  title: `${BRAND.name} — Crèche, Garderie & École Maternelle à Lomé`,
  description: 'Crèche, garderie et école maternelle moderne et bienveillante à Lomé, Togo. Un environnement sûr, joyeux et stimulant où chaque enfant explore et rayonne.',
}

export default async function HomePage() {
  const sectionPreview = SECTIONS.slice(0, 3).map((section) => ({
    ...section,
    Icon: SECTION_ICONS[section.id] || Baby,
  }))
  const newsPreview = sortByPublished(await fetchPublicBlogPosts()).slice(0, 3)
  const galleryPreview = await fetchPublicGallery()
  const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      {/* Hero + Bande de confiance — plein écran (100vh) */}
      <div className="relative min-h-screen flex flex-col bg-cream">
        {/* Hero — DESIGN.md § 9 : titre + CTA à gauche, illustration de la crèche à droite. */}
        <section className="relative overflow-hidden flex-1 flex items-center">
          {/* Décorations organiques discrètes — rayons et halo, sans surcharger. */}
          <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-primary/15 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -right-20 top-1/3 size-64 rounded-full bg-mint/70 blur-3xl" />

          {/* Doodles ludiques façon landing — flottement doux. */}
          <Doodle src="/images/marketing/icons-decor/star.png" size={56} className="right-[6%] top-10 rotate-12" delay={0.6} />
          <Doodle src="/images/marketing/icons-decor/avion.png" size={64} className="bottom-8 right-[10%] hidden -rotate-12 sm:block" delay={1.8} duration={6} />
          <Doodle src="/images/marketing/icons-decor/soleil.png" size={52} className="left-[3%] top-1/3 hidden lg:block" delay={1.2} duration={7} />

          <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 w-full px-4 lg:grid-cols-2 lg:gap-12 lg:px-6">
          <div className="text-center lg:text-left">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-tertiary/30 bg-tertiary/10 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-tertiary">
                Crèche · Garderie · Maternelle
              </span>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="mt-6 font-display font-bold text-5xl leading-[1.05] text-navy drop-shadow-sm sm:text-6xl lg:text-6xl">
                Où chaque enfant <span className="text-primary">explore</span>, <span className="text-primary"> </span> <br />et <span className="text-primary">rayonne</span>
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg lg:mx-0">
                Votre enfant mérite un départ réussi : une structure où il grandit, apprend et s’épanouit en toute sécurité.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                <MarketingButton href="/contact" size="lg" variant="primary">
                  Réserver une visite
                </MarketingButton>
                <MarketingButton href="/nos-sections" size="lg" variant="tertiary">
                  Découvrir nos sections
                </MarketingButton>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.2} className="relative mx-auto w-full lg:max-w-none">
            <div aria-hidden className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-mint/70" />
            <div className="relative aspect-[4/3] overflow-hidden rounded-[2.5rem] shadow-soft ring-1 ring-border">
              <Image
                src={heroImg}
                alt="Enfants épanouis dans la cour de la crèche"
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Vague de transition hero (crème) → bandeau (vert forêt). */}
      <SectionDivider bgClass="bg-cream" fillClass="fill-secondary" />

      {/* Bandeau de confiance — sous le hero, jamais dedans. */}
      <section className="bg-secondary pb-0 pt-10 text-secondary-foreground shrink-0">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 sm:grid-cols-4 lg:px-8">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08}>
              <div className="text-center">
                <div className="font-display font-bold text-3xl sm:text-4xl">{s.value}</div>
                <div className="mt-1 text-xs text-primary-foreground/70 sm:text-sm">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
        {/* Vague de transition bandeau (vert forêt) → Pourquoi (blanc). */}
        <SectionDivider bgClass="bg-secondary" fillClass="fill-background" flip className="mt-10" />
      </section>
    </div>

      {/* Pourquoi nous — grille asymétrique image + cartes, pas un simple split 50/50. */}
      <section className="relative overflow-clip px-6 pt-20 sm:pt-28 lg:px-8">
        <Doodle src="/images/marketing/icons-decor/contours-dessines-a-la-main-nuage-et-soleil.png" size={72} className="right-[4%] top-10 hidden sm:block" delay={0.4} duration={7} />
        <Doodle src="/images/marketing/icons-decor/crayon.png" size={52} className="bottom-28 left-[3%] hidden rotate-12 sm:block" delay={2} />
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-5 lg:gap-16">
          <Reveal className="lg:col-span-2 lg:order-2" y={20}>
            <span className="inline-flex items-center gap-2 py-2 text-sm font-semibold uppercase tracking-wide text-secondary">A PROPOS DE NOUS</span>
            <h2 className="font-bold text-3xl text-primary sm:text-4xl">
              Pourquoi Les Petits Rayons de Soleil&nbsp;?
            </h2>
            <p className="my-6 text-muted-foreground sm:text-lg">
              Une équipe passionnée, un cadre pensé pour la sécurité et la découverte, et une pédagogie qui
              grandit avec votre enfant — de la crèche à la grande section.
            </p>

            <MarketingButton href="/a-propos" size="lg" variant="tertiary">
                En savoir plus sur nous
            </MarketingButton>

          </Reveal>
          <Reveal className="relative lg:order-1 lg:col-span-3" delay={0.1}>
            <div className="relative aspect-[4/3] overflow-hidden rounded-[2.5rem] shadow-xl">
              <Image src="/images/marketing/about-img.png" alt="Éducatrice avec des enfants" fill className="object-cover" sizes="(min-width: 1024px) 60vw, 100vw" />
            </div>
          </Reveal>
        </div>
        {/* Vague de transition Pourquoi (blanc) → Sections (bleu très clair). */}
        <SectionDivider bgClass="bg-background" fillClass="fill-muted" className="mt-20 sm:mt-28" />
      </section>

      {/* Nos sections — grille de cartes, familles d'âge. */}
      <section className="relative overflow-clip bg-muted/40 px-6 pt-20 sm:pt-28 lg:px-8">
        <Doodle src="/images/marketing/icons-decor/abaque.png" size={60} className="left-[3%] top-16 hidden -rotate-12 md:block" delay={1} duration={6} />
        <Doodle src="/images/marketing/icons-decor/ours-en-peluche.png" size={64} className="bottom-28 right-[3%] hidden rotate-6 md:block" delay={2.4} />
        <div className="mx-auto max-w-6xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 py-2 text-sm font-semibold uppercase tracking-wide text-secondary">NOS SECTIONS</span>
            <h2 className="font-bold text-3xl text-primary sm:text-4xl">Un parcours pensé pour chaque âge</h2>
            <p className="mt-4 text-muted-foreground sm:text-lg">
              De la crèche à la grande section, chaque étape a son rythme, ses activités et son équipe dédiée.
            </p>
          </Reveal>
          <div className="mt-14 grid grid-cols-1 items-start gap-10 sm:grid-cols-3 sm:gap-8">
            {sectionPreview.map((section, i) => {
              const style = SECTION_PIN_STYLES[i % SECTION_PIN_STYLES.length] as (typeof SECTION_PIN_STYLES)[number]
              return (
                <Reveal key={section.id} delay={i * 0.08} className={style.offset}>
                  <Link
                    href="/nos-sections"
                    aria-label={`Découvrir la section ${section.shortTitle} — ${section.ageRange}`}
                    className={cn(
                      'group relative block h-full rounded-[1.75rem] bg-white p-3 pb-4 shadow-xl ring-1 ring-black/5 transition-all duration-300 hover:rotate-0 hover:-translate-y-1.5 hover:shadow-2xl',
                      style.rotate,
                    )}
                  >
                    {/* Punaise */}
                    <span aria-hidden className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
                      <span className={cn('relative block size-6 rounded-full shadow-md ring-4 ring-white', style.pin)}>
                        <span className="absolute left-1 top-1 block size-1.5 rounded-full bg-white" />
                      </span>
                    </span>
                    <div className={cn('rounded-[1.25rem] p-5 pt-7', style.panel)}>
                      <div className="flex items-start justify-between gap-3">
                        <span className={cn('font-display text-3xl italic leading-none', style.number)}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/80 ring-1 ring-black/5 transition-transform duration-300 group-hover:scale-110">
                          <section.Icon className="size-5 text-navy" aria-hidden="true" />
                        </span>
                      </div>
                      <h3 className="mt-1 font-display text-2xl font-bold text-white">{section.shortTitle}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-white">{section.description}</p>
                    </div>
                  </Link>
                </Reveal>
              )
            })}
          </div>
          <div className="mt-20 text-center">
            <MarketingButton href="/nos-sections" variant="tertiary">
              Voir toutes les sections
              <ArrowRight className="size-4" />
            </MarketingButton>
          </div>
        </div>
        {/* Vague de transition Sections (bleu très clair) → Différences (blanc). */}
        <SectionDivider bgClass="bg-muted/40" fillClass="fill-background" flip className="mt-20" />
      </section>

      <DifferenceTimeline />

      {/* Vie de la crèche — mosaïque photo, teaser de la galerie. */}
      {galleryPreview.length > 0 && (
        <section className="relative overflow-clip px-6 pt-20 sm:pt-28 lg:px-8">
          <Doodle src="/images/marketing/icons-decor/star.png" size={44} className="right-[10%] top-8 hidden rotate-12 sm:block" delay={0.9} duration={4} />
          <Doodle src="/images/marketing/icons-decor/avion.png" size={52} className="bottom-28 left-[4%] hidden -rotate-12 lg:block" delay={2.2} duration={6} />
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <Reveal>
                <span className="inline-flex items-center gap-2 py-2 text-sm font-semibold uppercase tracking-wide text-secondary">NOTRE GALERIE</span>
                <h2 className="font-bold text-3xl text-primary sm:text-4xl">La vie à la crèche, en images</h2>
                <p className="mt-3 max-w-lg text-muted-foreground sm:text-lg">
                  Ateliers, jeux, repas partagés, siestes paisibles — un aperçu du quotidien de nos petits rayons.
                </p>
              </Reveal>
              <Reveal delay={0.1}>
                <MarketingButton href="/galerie" variant="tertiary">
                  Toute la galerie
                  <ArrowRight className="size-4" />
                </MarketingButton>
              </Reveal>
            </div>
            <Reveal delay={0.15}>
              <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {galleryPreview.slice(0, 5).map((photo, i) => (
                  <div
                    key={photo.id}
                    className={`relative aspect-square overflow-hidden rounded-2xl ${i === 2 ? 'row-span-2 sm:aspect-auto' : ''}`}
                  >
                    <Image
                      src={photo.url}
                      alt={GALLERY_PHOTO_CATEGORIES[photo.category]}
                      fill
                      unoptimized
                      className="object-cover transition-transform duration-500 hover:scale-105"
                      sizes="25vw"
                    />
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
          {/* Vague de transition Galerie (blanc) → Rejoindre (crème). */}
          <SectionDivider bgClass="bg-background" fillClass="fill-cream" flip className="mt-20 sm:mt-28" />
        </section>
      )}

      <JoinTimeline />

      {/* Actualités — teaser éditorial. */}
      <section className="relative overflow-clip bg-muted/40 px-6 pt-20 sm:pt-28 lg:px-8">
        <Doodle src="/images/marketing/icons-decor/soleil.png" size={56} className="left-[4%] top-12 hidden sm:block" delay={1.5} duration={7} />
        <Doodle src="/images/marketing/icons-decor/crayon.png" size={44} className="bottom-28 right-[5%] hidden rotate-12 lg:block" delay={0.3} duration={5} />
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <Reveal>
              <h2 className="font-bold text-3xl text-primary sm:text-4xl">Nos dernières actualités</h2>
            </Reveal>
            <Reveal delay={0.1}>
              <MarketingButton href="/actualites" variant="tertiary">
                Toutes les actualités
                <ArrowRight className="size-4" />
              </MarketingButton>
            </Reveal>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {newsPreview.map((article, i) => (
              <Reveal key={article.id} delay={i * 0.08} className="h-full">
                <Link
                  href={`/actualites/${article.id}`}
                  className="group flex h-full flex-col rounded-[2rem] bg-secondary p-2 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="relative h-50 shrink-0 overflow-hidden rounded-[2rem] bg-muted">
                    {article.coverUrl ? (
                      <Image
                        src={article.coverUrl}
                        alt={article.title}
                        fill
                        unoptimized
                        sizes="(min-width: 768px) 33vw, 100vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/70 via-primary/40 to-secondary/60">
                        <Newspaper className="size-10 text-white/80" aria-hidden="true" />
                      </div>
                    )}
                    {article.tag && (
                      <span className="absolute right-3 top-3 rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
                        {article.tag.name}
                      </span>
                    )}
                  </div>

                  <div className="relative -mt-9 flex flex-1 flex-col px-2 pb-2">
    
                    <div className="flex flex-1 flex-col rounded-2xl bg-secondary p-5 pt-4">
                      <h3 className="line-clamp-2 font-display text-lg font-bold leading-snug text-white group-hover:underline">
                        {article.title}
                      </h3>
                      <p className="mt-1.5 line-clamp-2 text-sm text-white/60">{article.excerpt}</p>
                      <div className="mt-auto pt-4">
                        <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                          {article.publishedAt ? (
                            <time className="text-xs font-medium uppercase tracking-wide text-white/50">
                              {dateFormatter.format(new Date(article.publishedAt))}
                            </time>
                          ) : (
                            <span />
                          )}
                          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-white">
                            Lire
                            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
        {/* Vague de transition Actualités (bleu très clair) → CTA (crème). */}
        <SectionDivider bgClass="bg-muted/40" fillClass="fill-accent" className="mt-20 sm:mt-28" />
      </section>

      <CtaBand />
    </>
  )
}
