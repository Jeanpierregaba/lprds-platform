import type { Metadata } from 'next'
import { localeAlternates } from '@/i18n/metadata'
import { getLocale, getTranslations } from 'next-intl/server'
import Image from 'next/image'
import { ArrowRight, Newspaper, Baby, Cloud, Sun } from 'lucide-react'
import { DifferenceTimeline } from '@/components/marketing/difference-timeline'
import { Doodle } from '@/components/marketing/doodle'
import { SectionDivider } from '@/components/marketing/section-divider'
import { SECTION_PIN_STYLES, SectionPinCard } from '@/components/marketing/section-pin-card'
import { JoinTimeline } from '@/components/marketing/join-timeline'
import { MarketingButton } from '@/components/marketing/marketing-button'
import { Reveal } from '@/components/marketing/reveal'
import { CtaBand } from '@/components/marketing/cta-band'
import { buildStats, buildSections, BRAND } from '@/lib/marketing/data'
import { fetchPublicBlogPosts, sortByPublished, fetchPublicGallery } from '@/lib/api/public-blog.api'
import heroImg from '../../../../public/images/marketing/hero-img.png'
import { Link } from '@/i18n/navigation'

// Icône Lucide par section (aperçu accueil : 3 sections crèche) — voir aussi
// sectionPinIcon() pour la page Nos Sections (les 7 sections).
const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  creche_etoile: Baby,
  creche_nuage: Cloud,
  creche_soleil: Sun,
}


export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'marketing.home.meta' })
  return {
    title: t('title', { name: BRAND.name }),
    description: t('description'),
    alternates: localeAlternates('/', locale),
  }
}

export default async function HomePage() {
  const locale = await getLocale()
  const t = await getTranslations('marketing')
  const tHome = await getTranslations('marketing.home')

  const sectionPreview = buildSections(t).slice(0, 3).map((section) => ({
    ...section,
    Icon: SECTION_ICONS[section.id] || Baby,
  }))
  const stats = buildStats(t)
  const newsPreview = sortByPublished(await fetchPublicBlogPosts()).slice(0, 3)
  const galleryPreview = await fetchPublicGallery()
  // Le format de date suit la langue affichée : « 3 mars 2026 » en français,
  // « 3 March 2026 » en anglais.
  const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      {/* Hero plein-bleed (inspiration maquette) : la photo actuelle en fond,
          titre blanc par-dessus, stats en bas — header flottant par-dessus. */}
      <div className="relative flex min-h-[100svh] flex-col">
        <section className="relative flex flex-1 flex-col overflow-hidden">
          <Image
            src={heroImg}
            alt={tHome('hero.imageAlt')}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/50 via-from-black/35 to-black/45" />

          <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-10 pt-32 sm:px-6 sm:pb-14 lg:px-8">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
                {tHome('hero.eyebrow')}
              </span>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="mt-6 max-w-3xl font-display font-bold text-4xl leading-[1.05] text-white drop-shadow-md sm:text-6xl">
                {tHome('hero.titleLine1')} <br />{tHome('hero.titleLine2')}
              </h1>
            </Reveal>

            <div className="mt-auto flex flex-col gap-8 pt-10 sm:pt-14 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-xl">
                <Reveal delay={0.16}>
                  <p className="text-base text-white/85 sm:text-lg">
                    {tHome('hero.lead')}
                  </p>
                </Reveal>
                <Reveal delay={0.24}>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <MarketingButton href="/contact" size="lg" variant="primary" className="w-full sm:w-auto">
                      {tHome('hero.bookVisit')}
                    </MarketingButton>
                    <MarketingButton href="/nos-sections" size="lg" variant="tertiary" className="w-full sm:w-auto">
                      {tHome('hero.discoverSections')}
                    </MarketingButton>
                  </div>
                </Reveal>
              </div>
              <Reveal delay={0.3}>
                <div className="flex flex-wrap gap-6 sm:gap-10">
                  {stats.map((s) => (
                    <div key={s.label}>
                      <div className="font-display font-bold text-3xl text-white drop-shadow sm:text-4xl">{s.value}</div>
                      <div className="mt-1 text-xs text-white/75 sm:text-sm">{s.label}</div>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </section>

      {/* Coupe franche hero photo → Pourquoi (blanc), sans vague. */}
      </div>

      {/* Pourquoi nous — grille asymétrique image + cartes, pas un simple split 50/50. */}
      <section className="relative overflow-clip px-4 pt-14 sm:px-6 sm:pt-28 lg:px-8">
        <Doodle src="/images/marketing/icons-decor/contours-dessines-a-la-main-nuage-et-soleil.png" size={72} className="right-[4%] top-10 hidden sm:block" delay={0.4} duration={7} />
        <Doodle src="/images/marketing/icons-decor/crayon.png" size={52} className="bottom-28 left-[3%] hidden rotate-12 sm:block" delay={2} />
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-5 lg:gap-16">
          <Reveal className="lg:col-span-2 lg:order-2" y={20}>
            <span className="inline-flex items-center gap-2 py-2 text-sm font-semibold uppercase tracking-wide text-secondary">{tHome('about.eyebrow')}</span>
            <h2 className="font-bold text-3xl text-primary sm:text-4xl">
              {tHome('about.title')}
            </h2>
            <p className="my-6 text-muted-foreground sm:text-lg">
              {tHome('about.body')}
            </p>

            <MarketingButton href="/a-propos" size="lg" variant="tertiary">
                {tHome('about.cta')}
            </MarketingButton>

          </Reveal>
          <Reveal className="relative lg:order-1 lg:col-span-3" delay={0.1}>
            <div className="relative aspect-[4/3] overflow-hidden rounded-[2.5rem] shadow-xl">
              <Image src="/images/marketing/about-img.png" alt={tHome('about.imageAlt')} fill className="object-cover" sizes="(min-width: 1024px) 60vw, 100vw" />
            </div>
          </Reveal>
        </div>
        {/* Vague de transition Pourquoi (blanc) → Sections (bleu très clair). */}
        <SectionDivider bgClass="bg-background" fillClass="fill-muted" className="mt-12 sm:mt-28" />
      </section>

      {/* Nos sections — grille de cartes, familles d'âge. */}
      <section className="relative overflow-clip bg-muted/40 px-4 pt-14 sm:px-6 sm:pt-28 lg:px-8">
        <Doodle src="/images/marketing/icons-decor/abaque.png" size={60} className="left-[3%] top-16 hidden -rotate-12 md:block" delay={1} duration={6} />
        <Doodle src="/images/marketing/icons-decor/ours-en-peluche.png" size={64} className="bottom-28 right-[3%] hidden rotate-6 md:block" delay={2.4} />
        <div className="mx-auto max-w-6xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 py-2 text-sm font-semibold uppercase tracking-wide text-secondary">{tHome('sections.eyebrow')}</span>
            <h2 className="font-bold text-3xl text-primary sm:text-4xl">{tHome('sections.title')}</h2>
            <p className="mt-4 text-muted-foreground sm:text-lg">
              {tHome('sections.body')}
            </p>
          </Reveal>
          <div className="mt-14 grid grid-cols-1 items-start gap-10 sm:grid-cols-3 sm:gap-8">
            {sectionPreview.map((section, i) => {
              const style = SECTION_PIN_STYLES[i % SECTION_PIN_STYLES.length] as (typeof SECTION_PIN_STYLES)[number]
              return (
                <Reveal key={section.id} delay={i * 0.08} className={style.offset}>
                  <Link
                    href="/nos-sections"
                    aria-label={tHome('sections.cardLabel', { name: section.shortTitle, age: section.ageRange })}
                    className="group relative block h-full"
                  >
                    <SectionPinCard
                      index={i}
                      icon={section.Icon}
                      title={section.shortTitle}
                      description={section.description}
                    />
                  </Link>
                </Reveal>
              )
            })}
          </div>
          <div className="mt-12 text-center sm:mt-20">
            <MarketingButton href="/nos-sections" variant="tertiary">
              {tHome('sections.cta')}
              <ArrowRight className="size-4" />
            </MarketingButton>
          </div>
        </div>
        {/* Vague de transition Sections (bleu très clair) → Différences (blanc). */}
        <SectionDivider bgClass="bg-muted/40" fillClass="fill-background" flip className="mt-12 sm:mt-20" />
      </section>

      <DifferenceTimeline />

      {/* Vie de la crèche — mosaïque photo, teaser de la galerie. */}
      {galleryPreview.length > 0 && (
        <section className="relative overflow-clip px-4 pt-14 sm:px-6 sm:pt-28 lg:px-8">
          <Doodle src="/images/marketing/icons-decor/star.png" size={44} className="right-[10%] top-8 hidden rotate-12 sm:block" delay={0.9} duration={4} />
          <Doodle src="/images/marketing/icons-decor/avion.png" size={52} className="bottom-28 left-[4%] hidden -rotate-12 lg:block" delay={2.2} duration={6} />
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <Reveal>
                <span className="inline-flex items-center gap-2 py-2 text-sm font-semibold uppercase tracking-wide text-secondary">{tHome('gallery.eyebrow')}</span>
                <h2 className="font-bold text-3xl text-primary sm:text-4xl">{tHome('gallery.title')}</h2>
                <p className="mt-3 max-w-lg text-muted-foreground sm:text-lg">
                  {tHome('gallery.body')}
                </p>
              </Reveal>
              <Reveal delay={0.1}>
                <MarketingButton href="/galerie" variant="tertiary">
                  {tHome('gallery.cta')}
                  <ArrowRight className="size-4" />
                </MarketingButton>
              </Reveal>
            </div>
            <Reveal delay={0.15}>
              <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {galleryPreview.slice(0, 5).map((photo, i) => (
                  <div
                    key={photo.id}
                    className={`relative aspect-square overflow-hidden rounded-2xl ${i === 2 ? 'sm:row-span-2 sm:aspect-auto' : ''} ${i === 4 ? 'col-span-2 sm:col-span-1' : ''}`}
                  >
                    <Image
                      src={photo.url}
                      alt={photo.category?.name ?? tHome('gallery.photoAlt')}
                      fill
                      unoptimized
                      className="object-cover transition-transform duration-500 hover:scale-105"
                      sizes="(min-width: 640px) 25vw, 50vw"
                    />
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
          {/* Vague de transition Galerie (blanc) → Rejoindre (crème). */}
          <SectionDivider bgClass="bg-background" fillClass="fill-cream" flip className="mt-12 sm:mt-28" />
        </section>
      )}

      <JoinTimeline />

      {/* Actualités — teaser éditorial. */}
      <section className="relative overflow-clip bg-muted/40 px-4 pt-14 sm:px-6 sm:pt-28 lg:px-8">
        <Doodle src="/images/marketing/icons-decor/soleil.png" size={56} className="left-[4%] top-12 hidden sm:block" delay={1.5} duration={7} />
        <Doodle src="/images/marketing/icons-decor/crayon.png" size={44} className="bottom-28 right-[5%] hidden rotate-12 lg:block" delay={0.3} duration={5} />
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <Reveal>
              <h2 className="font-bold text-3xl text-primary sm:text-4xl">{tHome('news.title')}</h2>
            </Reveal>
            <Reveal delay={0.1}>
              <MarketingButton href="/actualites" variant="tertiary">
                {tHome('news.cta')}
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
                            {tHome('news.read')}
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
        <SectionDivider bgClass="bg-muted/40" fillClass="fill-accent" className="mt-12 sm:mt-28" />
      </section>

      <CtaBand />
    </>
  )
}
